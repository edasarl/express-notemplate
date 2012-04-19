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


Setup
-----

	app.configure(function(){
		app.set('views', __dirname + '/views');
		app.register('.html', require('express-notemplate'));
		app.set('view engine', 'html');
		app.set('view options', {
			layout: false
		});
	});


Usage
-----

It is meant to be used as any other express view rendering :

	res.local('mydata', mydata);
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

	var notemplate = require('express-notemplate');
	notemplate.on('data', function(window, data, opts) {
		// opts are the options of compile(str, opts)
		// this is called *before* any other template-bound handlers
	});
	notemplate.on('render', function(window, data, opts) {
		// this is called *after* any other template-bound handlers
	});
	notemplate.on('output', function(ref) {
		// this is called *after* the DOM has been serialized to html
		// ref.output is a string and can be modified.
		ref.output = ref.output.replace('é', '&eacute;');
	});

	Typical example of this are the notemplate-rootpath and notemplate-minify middlewares.


Features
--------

* console.log works in the jsdom context.
* globally defined event handlers for all templates :
