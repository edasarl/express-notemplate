express-notemplate
==================

Let the template be plain HTML code, and use javascript to merge data into it.

Why ?
-----

The view is totally separated from the model.
The glue code that merges data into the view is easy to maintain, and can be run by the server or the clients.
There is no artificial syntax, no unnecessary abstraction.
Just familiar DOM and javascript.

In particular, this allows one to merge new data on the clients using a messenging system using the exact same code
as what is needed on the server to output html.

The only extra is a jQuery $ object provided by default on server.
(if the javascript code is not used on clients, jQuery is not needed on clients).


Express 3 Setup
---------------

	var notemplate = require('express-notemplate');
	app.set('statics', process.cwd() + '/public');
	app.set('views', process.cwd() + '/views');
	app.engine('html', notemplate.__express);
	app.set('view engine', 'html');
	app.use(express.static(app.get('statics')));


Usage
-----

It is meant to be used as any other express view rendering :

	res.locals.mydata = mydata;
	res.render('index');

Then express-notemplate will load the html file into a DOM, add window.$ to it, and process script tags :

	<script type="text/javascript">
		// some client code here, won't be run on server
	</script>
	<script type="text/javascript" notemplate="both" src="javascripts/moment.js"></script>
	<script type="text/javascript" notemplate="server">
		$(document).on('data', function(e, data) {
			$('head > title').text(data.mydata.title + moment());
		});
	</script>
	<script type="text/javascript" notemplate="both">
		$(document).on('data', function(e, data) {
			$('body').html(data.mydata.body);
		});
	</script>


In this example :

* moment.js is loaded and the script tag is kept in the html output,
* the first handler is run on server but won't be available on client
* the second handler is run and it will be possible to trigger it on client too.

script tags can have attribute notemplate = server | client | both :

* (default) client : script are not run
* server : scripts are run and tag is removed
* both : scripts are run

The "notemplate" attribute is removed from html output.


Middleware
----------

Aside from page-bound scripts for merging data, there are several 'global'
events that can be listened to :

	* ready		page DOM loaded in view.window - jquery and other scripts are available, as usual
		Listener arguments : view, opts
	* data		called before any page-bound handlers, all page-bound scripts being loaded
		Listener arguments : view, opts
	* render	called after page-bound handlers
		Listener arguments : view, opts
	* output	called after DOM is serialized to xhtml string
		Listener argument : { output : <str> }, opts


Usage :

	view.window
	view.window.$
	view.window.document
	view.window.console

	opts.settings.env
	opts.locals.mydata
	opts.mydata
	opts.use(...)
		

	var notemplate = require('express-notemplate');
	../..
	notemplate.on('output', function(ref) {
		ref.output = ref.output.replace('é', '&eacute;');
	});

A typical use of middleware is in notemplate-minify.


Features
--------

* console.log works in the jsdom context.
