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
	app.use(notemplate.middleware); // initialize document.location

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
		$(document).ready(function() {
			if (window.navigator.server) return; // is true when run on server inside notemplate. Will change when jsdom supports it.
			// do client ui stuff here that won't be useful on server
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

IE-style conditional comments are replaced by the tag they contain (provided there is only one tag in it),
before document.ready event and are restored before output event. It allows all notemplate middleware
to process the nodes hidden within those comments the same way as other nodes.


Middleware
----------

Only page-bound scripts can listen to these events:

* $(document).ready(function() {})
  the usual document.ready event.  
  Modifying DOM before that event is unsupported.
  Use notemplate.ready to do just that.
* $(document).on('data', function(e, obj) {})
  obj can be the options object given by express to template engines render method.  
  It can also be a simple object received through other channels (say a message
  from a websocket connection).
  It is advised to check for existence of obj.mydatakey before trying to use it.  
  Listener arguments : e, locals


Only nodejs-bound scripts can listen to these events (emitted by notemplate):

* notemplate.on('ready', function(view, opts) {})
	DOM is loaded in view.window and will be copied over each new page instance.
	Only jquery is available.
* notemplate.on('data', function(view, opts) {})
  called just before document.data handlers.
* notemplate.on('render', function(view, opts) {})
	called just after document.data handlers.  
	view.instance.toString() will serialize dom, respecting fragment options.  
	Setting view.instance.output will prevent next step from calling toString.
* notemplate.on('output', function(instance, opts) {})
	called just after instance.output has been set.  
	instance.output can be anything, since it can be customized in a render event
	listener before. See usage below.


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

A typical use of render event middleware is in notemplate-archive.


Quick jsdom window with jquery
------------------------------

If you need quick access to an empty DOM with jquery,

  require('notemplate').window(htmlstr, href)

is what you need.


Tips
----

* console.log works in the jsdom context.
