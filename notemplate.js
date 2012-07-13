var jsdom = require('jsdom');
var Path = require('path');
var URL = require('url');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var async = require('async');
var format = require('util').format;

var notemplate = module.exports = new EventEmitter();

var views = Object.create(null);

// keep that in memory
var jquery = fs.readFileSync(Path.join(Path.dirname(require.resolve('jquery-browser')), 'lib/jquery.js')).toString();


function load(path, cb) {
	var view = views[path] || { path: path };
	fs.stat(path, function(err, result) {
		if (err) return cb(err);
		if (view.mtime && result.mtime <= view.mtime) {
			view.hit = true;
			return cb(null, view);
		}
		fs.readFile(view.path, function(err, str) {
			if (err) return cb(err, view);
			view.window = getWindow(str);
			view.mtime = result.mtime;
			view.hit = false;
			views[view.path] = view;
			return cb(null, view);
		});		
	});
}

function getWindow(str) {
	// create window with jquery
	var window = jsdom.jsdom(str, null, {			// default DOM, but eventually will be level2.html
		features: {
			FetchExternalResources: false,				// loaded depending on script[notemplate] attribute
			ProcessExternalResources: false,			// same
			MutationEvents: false,								// not needed
			QuerySelector: false									// not needed, we use jquery's bundled sizzle instead of jsdom's one.
		},
		xhtml: true
	}).createWindow();
	window.console = console;
	var tempfun = window.setTimeout;
	window.setTimeout = function(fun, tt) { fun(); };
	window.run(jquery);
	window.setTimeout = tempfun;
	jqueryPatches(window.jQuery);
	return window;
}

function loadScript(root, src, cb) {
	var url = URL.parse(src);
	if (url.hostname) return cb(format("express-notemplate error - cannot load remote script\n%s", src), null);
	var path = Path.join(root, url.pathname);
	Path.exists(path, function(exists) {
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

function jqueryPatches($) {
	// jQuery monkey-patch
	$.buildFragmentOrig = $.buildFragment;
	$.buildFragment = function(args, nodes, scripts) {
		var r = $.buildFragmentOrig(args, nodes, scripts);
		// or else script.contentText will be run, this is a security risk
		if (Array.isArray(scripts)) scripts.length = 0;
		return r;
	};
}

function merge(view, options, callback) {
	var window = view.window;
	var $ = window.$;
	var document = window.document;
	document.replaceChild(view.root.cloneNode(true), document.documentElement);
	// global listeners
	notemplate.emit('data', view, options);
	// listeners from scripts loaded inside view.window
	$(document).triggerHandler('data', options);
	// global listeners
	notemplate.emit('render', view, options);
	var output;
	if (options.fragment) output = outer($(options.fragment)); // output selected nodes
	else output = document.doctype.toString() + "\n" + document.outerHTML; // outputs doctype because of jsdom bug
	// global listeners can modify output (sync)
	var obj = { output : output };
	notemplate.emit('output', obj, options);
	callback(null, obj.output);
}

notemplate.__express = function(filename, options, callback) {
	load(filename, function(err, view) {
		if (err) return callback(err);
		// the first time the DOM is ready is an event
		var window = view.window;
		if (!view.hit) {
			async.forEachSeries(window.$('script'), function(script, done) {
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
				if (att == "server") script.parentNode.remove
				if (!src) return done();
				loadScript(options.settings.statics || process.cwd() + '/public', src.value, function(err, textContent) {
					if (err) done(err);
					else {
						window.run(textContent.toString());
						done();
					}
				});
			}, function(err) {
				if (err) console.error(err); // errors are not fatal
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
