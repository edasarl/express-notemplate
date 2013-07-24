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

// keep that in memory
var jquery = fs.readFileSync(Path.join(Path.dirname(require.resolve('jquery-browser')), 'lib/jquery.js')).toString();


function load(path, href, cb) {
	var view = { path: path };
	fs.stat(path, function(err, result) {
		if (err) return cb(err);
		fs.readFile(view.path, function(err, str) {
			if (err) return cb(err, view);
			view.window = getWindow(str, href);
			view.mtime = result.mtime;
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
	
	return window;
}

notemplate.window = getWindow;

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

function replaceCommentedTags(win) {
	var reg = /^\s*(\[if\s[^\]]+\]>)(.*)(<\!\[endif\])\s*$/
	var helper = win.document.createElement('div');
	var node = win.document.head.firstChild;
	while (node) {
		var cur = node;
		node = node.nextSibling;
		if (cur.nodeType != 8) continue;
		var match = reg.exec(cur.data);
		if (!match || match.length != 4) continue;
		helper.innerHTML = match[2].trim();
		var newNode = helper.firstChild;
		if (!newNode || newNode.nodeType != 1) continue;
		var parent = cur.parentNode;
		parent.insertBefore(newNode, cur);
		parent.removeChild(cur);
		newNode.setAttribute('notemplate:comment-start', match[1]);
		newNode.setAttribute('notemplate:comment-end', match[3]);
	}
}

function restoreCommentedTags(win) {
	var $ = win.$;
	var helper = win.document.createElement('div');
	$(win.document.head).find('[notemplate\\:comment-start]').each(function() {
		var comment = win.document.createComment("");
		$(this).replaceWith(comment);
		helper.appendChild(this);
		var start = this.getAttribute('notemplate:comment-start');
		this.attributes.removeNamedItem('notemplate:comment-start');
		var end = this.getAttribute('notemplate:comment-end');
		this.attributes.removeNamedItem('notemplate:comment-end');
		comment.data = start + helper.innerHTML + end;
	});
}

function merge(view, options, callback) {
	var window = view.window;
	var $ = window.$;
	var document = window.document;
	replaceCommentedTags(window);
	// call all pending document.ready listeners
	window.jQuery.ready(true);
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

	restoreCommentedTags(window);
	
	if (!instance.output) instance.output = instance.toString();
	notemplate.emit('output', instance, options);
	var funClose = function() { close(view); view = null; };
	// notemplate-archive has a typical example of such an instance.output
	if (instance.output instanceof EventEmitter) {
		instance.output.on('end', funClose);
		instance.output.on('error', funClose);
	} else {
		funClose();
	}
	callback(null, instance.output);
}

function close(view) {
	if (view.instance) {
		view.instance.window.close();
		delete view.instance.window;
		delete view.instance;
	}
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
		Step(function() {
			var group = this.group();
			view.window.$('script').each(function() {
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
				if (!src && script.textContent) view.window.run(script.textContent);
				if (att == "server") script.parentNode.removeChild(script);
				if (!src) return done();
				loadScript(options.settings.statics || process.cwd() + '/public', src.value, done);
			});
		}, function(err, scripts) {
			if (err) console.error(err); // errors are not fatal
			scripts.forEach(function(txt) {
				if (txt) view.window.run(txt.toString());
			});
			notemplate.emit('ready', view, options);
			// all scripts have been loaded
			// now we can deal with data merging
			merge(view, options, callback);
		});
	});
};

notemplate.middleware = function(req, res, next) {
	req.app.settings.href = req.protocol + '://' + req.headers.host + req.url;
	next();
};

