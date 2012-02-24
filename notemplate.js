(function(exports) {
var jsdom = require('jsdom');

exports.compile = function(str, opts) {
	// use opts.features, opts.scripts ?
	var window = jsdom.jsdom(str, null, {
		features: {
			FetchExternalResources: false,				// mandatory !
			MutationEvents: '1.0',								// tell jsdom to run
			ProcessExternalResources: ['script'],	// <script> contents
			QuerySelector: true										// rely on bundled Sizzle, until jQuery becomes modular
		}
	}).createWindow();

	// core jQuery : selector, manipulation, traversal
	// use real jQuery when it becomes modular.
	// jquip needs some patches to run inside jsdom (mainly because node.style.key is not supported by cssom)
	var jquip = require('fs').readFileSync(require.resolve('jquip-jsdom')).toString();
	window.run(jquip);

	// remove <script notemplate="server">
	window.$('script[notemplate=server]').remove();
	
	return function(data) {
		// just return the template if no merge functions
		if (!window._merge && !window.merge) return str;
		if (window._merge) window._merge(data);
		if (window.merge) window.merge(data);
		// outputs doctype because of jsdom bug
		return window.document.doctype.toString() + "\n" + window.document.outerHTML;
	};
};
})((typeof exports === "undefined") ? window : exports);
