var jsdom = require('jsdom');
var Path = require('path');
var URL = require('url');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var Step = require('step');
var format = require('util').format;
var fexists = fs.exists || Path.exists;
var Parser;
try {
	Parser = require('html5');
} catch (e) {}

jsdom.defaultDocumentFeatures = {
	FetchExternalResources: false,				// loaded depending on script[notemplate] attribute
	ProcessExternalResources: false,			// same
	MutationEvents: false,								// not needed
	QuerySelector: false									// not needed, we use jquery's bundled sizzle instead of jsdom's one.
};

var notemplate = module.exports = new EventEmitter();

var views = Object.create(null);

// keep that in memory
var jquery = fs.readFileSync(Path.join(Path.dirname(require.resolve('jquery-browser')), 'lib/jquery.js')).toString();


function load(path, href, cb) {
	var view = views[path] || { path: path };
	fs.stat(path, function(err, result) {
		if (err) return cb(err);
		if (view.mtime && result.mtime <= view.mtime) {
			view.hit = true;
			return cb(null, view);
		}
		fs.readFile(view.path, function(err, str) {
			if (err) return cb(err, view);
			view.window = getWindow(str, href);
			view.mtime = result.mtime;
			view.hit = false;
			views[view.path] = view;
			return cb(null, view);
		});		
	});
}

function getWindow(str, href) {
	// create window with jquery
	var opts = {
		url: href || "/" // do not resolve to this file path !
	};
	if (Parser) opts.parser = Parser;
	var window = jsdom.jsdom(str, "2", opts).createWindow();
	window.navigator.server = true;
	window.console = console;
	var tempfun = window.setTimeout;
	// jQuery calls setTimeout(jQuery.ready) once
	window.setTimeout = function(fun, tt) {};
	window.run(jquery);
	window.setTimeout = tempfun;
	var $ = window.jQuery;
	$._evalUrl = $.globalEval = function() {};
	// short-circuit jQuery dom ready handling
	$.readyListeners = [];
	$.fn.ready = function(obj) {
		$.readyListeners.push(obj);
	};
	$.ready = function() {
		window.jQuery.isReady = true;
		$.readyListeners.forEach(function(fn) {
			fn.call(window.document, $);
		});
	};
	
	return window;
}

function loadScript(root, src, cb) {
	var url = URL.parse(src);
	if (url.hostname) return cb(format("express-notemplate error - cannot load remote script\n%s", src), null);
	var path = Path.join(root, url.pathname);
	fexists(path, function(exists) {
		if (exists) fs.readFile(path, cb);
		else cb(format("express-notemplate error - cannot find local script\n%s", path));
	});
}

function outer($nodes) {
	var ret = '';
	$nodes.each(function() {
		ret += this.outerHTML;
	});
	return ret;
}

function merge(view, options, callback) {
	var window = view.window;
	var $ = window.$;
	var document = window.document;
	document.replaceChild(view.root.cloneNode(true), document.documentElement);
	// make sure data listeners are removed
	window.jQuery(document).off('data');
	// call all pending document.ready listeners
	window.jQuery.isReady = false;
	window.jQuery.ready();
	// view is a template, view.instance is a per-location instance of the template
	var instance = {
		window: window,
		options: options
	};
	instance.toString = toString.bind(instance);
	view.instance = instance;
	
	// global listeners
	notemplate.emit('data', view, options);
	// listeners from scripts loaded inside view.window
	$(document).triggerHandler('data', options);

	// global listeners
	
	notemplate.emit('render', view, options);

	if (!instance.output) instance.output = instance.toString();
	
	notemplate.emit('output', instance, options);
	callback(null, instance.output);
}

function toString() {
	var doc = this.window.document;
	var output;
	if (this.options.fragment) output = outer(this.window.$(this.options.fragment)); // output selected nodes
	else {
		output = doc.outerHTML;
		if (output.length < 2 || output.substr(0, 2) != "<!") {
			// add <!DOCTYPE... when missing (problem with parser)
			var docstr = doc.doctype.toString();
			if (output.length && output[0] != "\n") docstr += "\n";
			output = docstr + output;
		}
	}
	return output;
}

notemplate.__express = function(filename, options, callback) {
	load(filename, options.settings.href, function(err, view) {
		if (err) return callback(err);
		// the first time the DOM is ready is an event
		var window = view.window;
		if (!view.hit) {
			Step(function() {
				var group = this.group();
				window.$('script').each(function() {
					var script = this;
					var done = group();
					var att = script.attributes.notemplate;
					// default is notemplate="client"
					if (!att) return done();
					att = att.value;
					script.attributes.removeNamedItem('notemplate');
					// any other value is "client"
					if (att != "server" && att != "both") return done();
					var src = script.attributes.src;
					// html5 runs script content only when src is not set
					if (!src && script.textContent) window.run(script.textContent);
					if (att == "server") script.parentNode.removeChild(script);
					if (!src) return done();
					loadScript(options.settings.statics || process.cwd() + '/public', src.value, done);
				});
			}, function(err, scripts) {
				if (err) console.error(err); // errors are not fatal
				scripts.forEach(function(txt) {
					if (txt) window.run(txt.toString());
				});
				notemplate.emit('ready', view, options);
				view.hit = true;
				view.root = window.document.documentElement;
				// all scripts have been loaded
				// now we can deal with data merging
				merge(view, options, callback);
			});
		} else merge(view, options, callback);
	});
};

notemplate.middleware = function(req, res, next) {
	req.app.settings.href = req.protocol + '://' + req.headers.host + req.url;
	next();
};

