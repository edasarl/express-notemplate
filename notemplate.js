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
	var view = {
		path: path,
		asyncs: [],
		merge: mergeView,
		request: requestView,
		render: renderView,
		done: doneView,
		close: closeView
	};
	fs.stat(path, function(err, result) {
		if (err) return cb(err);
		fs.readFile(view.path, function(err, str) {
			if (err) return cb(err, view);
			view.window = getWindow(str, href);
			handleXhrs(view);
			handleTimeouts(view);
			view.mtime = result.mtime;
			return cb(null, view);
		});
	});
}

function handleXhrs(view) {
	var window = view.window;
	var wxhr = window.XMLHttpRequest;
	window.XMLHttpRequest = function() {
		var xhr = wxhr();
		var xhrSend = xhr.send;
		var xhrOpen = xhr.open;
		xhr.open = function(method, url) {
			this.request = [method, url];
			return xhrOpen.apply(this, Array.prototype.slice.call(arguments, 0));
		};
		xhr.send = function(data) {
			// while xhr is typically not reused, it can happen, so support it
			var self = this;
			function listenXhr() {
				if (this.readyState != 4) return;
				self.removeEventListener(arguments.callee);
				view.request(self.request[0], self.request[1], self.status, self.responseText);
				arguments.callee.done = true;
				process.nextTick(function() {view.done();});
			}
			this.addEventListener("readystatechange", listenXhr);
			view.asyncs.push(listenXhr);
			var ret, err
			try {
				ret = xhrSend.call(this, data);
			} catch(e) {
				err = e;
			}
			if (this.readyState == 4 || err) {
				// free it now
				listenXhr();
			} // else the call was asynchronous and no error was thrown
			if (err) throw err; // rethrow
			return ret;
		};
		return xhr;
	};
}

function handleTimeouts(view) {
	var window = view.window;
	var wto = window.setTimeout;
	window.setTimeout = function(fun, delay) {
		var args = Array.prototype.slice.call(arguments, 2);
		function listenTo() {
			fun.apply(null, args);
			arguments.callee.done = true;
			process.nextTick(function() {view.done();});
		}
		view.asyncs.push(listenTo);
		return wto(listenTo, delay);
	};
}

function getWindow(str, href) {
	// create window with jquery
	var opts = {
		url: href || "/" // do not resolve to this file path !
	};
	if (Parser) opts.parser = Parser;
	var window = jsdom.jsdom(str, "2", opts).createWindow();
	window.navigator.server = true; // backward-compatibility - jsdom already sets window.navigator.noUI = true
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

function requestView(method, url, status, response) {
	notemplate.emit('request', this, method, url, status, response);
}

function mergeView(options) {
	var window = this.window;
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
	this.instance = instance;

	// global listeners
	notemplate.emit('data', this, options);
	// listeners from scripts loaded inside view.window
	$(document).triggerHandler('data', options);
	$(window).triggerHandler('load');
	this.done();
}

function renderView() {
	var view = this;
	var instance = view.instance;
	var window = instance.window;
	// global listeners
	notemplate.emit('render', view, instance.options);

	restoreCommentedTags(window);

	if (!instance.output) instance.output = instance.toString();
	notemplate.emit('output', instance, instance.options);
	var cb = view.callback;
	var funClose = function() { view.close(); };
	// notemplate-archive has a typical example of such an instance.output
	if (instance.output instanceof EventEmitter) {
		instance.output.on('end', funClose);
		instance.output.on('error', funClose);
	} else {
		funClose();
	}
	cb(null, instance.output);
}

function doneView() {
	var asyncs = this.asyncs;
	for (var i=0, len=asyncs.length; i < len; i++) {
		if (!asyncs[i].done) return;
	}
	// render if there was no asyncs registered or they were all done
	this.render();
}

function closeView() {
	if (this.instance) {
		this.instance.window.close();
		delete this.instance.window;
		delete this.instance;
	}
	this.asyncs = null;
	this.callback = null;
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
	load(filename, options.href, function(err, view) {
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
			notemplate.emit('ready', view, options);
			scripts.forEach(function(txt) {
				if (txt) view.window.run(txt.toString());
			});
			// all scripts have been loaded
			// now we can deal with data merging
			view.callback = callback;
			view.merge(options);
		});
	});
};

notemplate.middleware = function(req, res, next) {
	res.locals.href = req.protocol + '://' + req.headers.host + req.url;
	next();
};

