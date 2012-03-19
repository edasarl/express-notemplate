var jsdom = require('jsdom');
var Path = require('path');
var URL = require('url');
var readfile = require('fs').readFileSync;

exports.compile = function(str, opts) {
	// use opts.features, opts.scripts ?
	opts = opts || {};
	var window = jsdom.jsdom(str, null, {
		features: {
			FetchExternalResources: false,				// loaded depending on script[notemplate] attribute
			ProcessExternalResources: false,			// same
			MutationEvents: false,								// not needed
			QuerySelector: true										// jquip doesn't provide querySelector/querySelectorAll compatibility, Sizzle does.
		}
	}).createWindow();

	// core jQuery : selector, manipulation, traversal
	// use real jQuery when it becomes modular.
	// jquip needs some patches to run inside jsdom (mainly because node.style.key is not supported by cssom)
	run(window, require.resolve('jquip-jsdom'));

	// <script> tags can have attribute notemplate = server | client | both
	// default value is client
	// server value : scripts are fetched (if they have src attribute), and discarded
	// client value : script are not fetched
	// both : scripts are fetched (if they have src attribute )and not discarded
	var public = Path.join('.', opts.public || 'public');
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
		src = src.value;
		// try to find javascript file
		var url = URL.parse(src);
		if (url.hostname) {
			console.error("express-notemplate doesn't allow loading external URL -- ping author to do it", script);
			continue;
		}
		var path = Path.join(public, url.pathname);
		if (!Path.existsSync(path)) {
			console.error("express-notemplate doesn't find script.src file", path);
			continue;
		}
		run(window, path);
	}
	
	return function(data) {
		// just return the template if no merge functions
		if (!window._merge && !window.merge) return str;
		if (window._merge) window._merge(data);
		if (window.merge) window.merge(data);
		// output selected nodes
		if (opts.fragment) return outer(window.$(opts.fragment));
		// outputs doctype because of jsdom bug
		return window.document.doctype.toString() + "\n" + window.document.outerHTML;
	};
};

function run(window, path) {
	window.run(readfile(path).toString());
}
function outer($nodes) {
	var ret = '';
	$nodes.each(function() {
		ret += this.outerHTML;
	});
	return ret;
}
