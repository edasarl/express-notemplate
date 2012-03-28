var jsdom = require('jsdom');
var Path = require('path');
var URL = require('url');
var readfile = require('fs').readFileSync;

// arrays of handlers
var handlers = [];

exports.compile = function(str, opts) {
	// use opts.features, opts.scripts ?
	opts = opts || {};
	opts.public = opts.public || 'public';
	
	var window = jsdom.jsdom(str, null, {
		features: {
			FetchExternalResources: false,				// loaded depending on script[notemplate] attribute
			ProcessExternalResources: false,			// same
			MutationEvents: false,								// not needed
			QuerySelector: false									// not needed, we use jquery's bundled sizzle instead of jsdom's one.
		}
	}).createWindow();

	window.console = console;
	// core jQuery : selector, manipulation, traversal
	// use real jQuery when it becomes modular.
	// jquip needs some patches to run inside jsdom (mainly because node.style.key is not supported by cssom)
	run(window, Path.join(__dirname, 'node_modules/jquery-browser/lib/jquery.js'));

	// <script> tags can have attribute notemplate = server | client | both
	// default value is client
	// server value : scripts are fetched (if they have src attribute), and discarded
	// client value : script are not fetched
	// both : scripts are fetched (if they have src attribute )and not discarded
	var scripts = window.$('script');
	for (var i=0, len = scripts.length; i < len; i++) {
		var script = scripts[i];
		var att = script.attributes.notemplate;
		if (!att) continue; // default is notemplate="client"
		att = att.value;
		script.attributes.removeNamedItem('notemplate'); // make sure attribute is removed
		if (att != "server" && att != "both") continue; // any other value is "client"
		var src = script.attributes.src;
		if (!src && script.textContent) window.run(script.textContent); // html5 runs script content only when src is not set
		if (att == "server") window.$(script).remove(); // remove script tag
		if (!src) continue;
		// load file and run it
		var path = resolve(opts.public, src.value);
		if (path) run(window, path);
	}
	
	return function(data) {
		// global handlers
		triggerHandler('data', window, data, opts);
		// no handlers return undefined
		var lastHandlerValue = window.$(window.document).triggerHandler('data', data);
		// global handlers
		triggerHandler('render', window, data, opts);
		// output selected nodes
		if (opts.fragment) return outer(window.$(opts.fragment));
		// outputs doctype because of jsdom bug
		return window.document.doctype.toString() + "\n" + window.document.outerHTML;
	};
};

exports.on = function(type, handler) {
	// allows adding "middleware" before compile() is called by render()
	// event can be 'data' in which case the handler is called before other handlers, or 'render',
	// in which case the handler is called after all other handlers, that is, before html output
	handlers.forEach(function(o) {
		if (o.type == type && o.handler == handler) return; // register handlers only once
	});
	handlers.push({type:type, handler:handler});
};

function triggerHandler(type, window, data, opts) {
	handlers.forEach(function(o) {
		if (o.type == type) o.handler(window, data, opts);
	});
}

function run(window, path) {
	window.run(readfile(path).toString());
}

function resolve(public, src) {
	var url = URL.parse(src);
	if (url.hostname) {
		console.error("express-notemplate doesn't allow loading external URL -- ping author to do it", script);
		return null;
	}
	var path = Path.join('.', public, url.pathname);
	if (!Path.existsSync(path)) {
		console.error("express-notemplate doesn't find script.src file", path);
		return null;
	}
	return path;
}

function outer($nodes) {
	var ret = '';
	$nodes.each(function() {
		ret += this.outerHTML;
	});
	return ret;
}
