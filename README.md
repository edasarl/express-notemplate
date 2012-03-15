express-notemplate
==================

Let the template be plain HTML code, and use javascript to merge data into it.

Why ?
-----

The view is totally separated from the model.
The glue code that merges data into the view is easy to maintain, and can be run by the server or the clients.
There is no artificial syntax, no unnecessary abstraction.
Just DOM and javascript.

In particular, this allows one to merge new data on the clients, using the exact same code.

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
		function _merge(data) {
			$('head > title').text(data.mydata.title + moment());
		}
	</script>
	<script type="text/javascript" notemplate="both">
		function merge(data) {
			$('body').html(data.mydata.body);
		}
	</script>


In this example :

* moment.js is loaded and the script tag is kept in the html output,
* _merge is run and the script tag containing it is removed from html output,
* merge is run and kept in the output.

script tags can have attribute notemplate = server | client | both :

* (default) client : script are not run
* server : scripts are run and tag is removed
* both : scripts are run

The "notemplate" attribute is removed from html output.


Dependencies
------------

Ideally express-notemplate should use upstream jsdom and jquip (or another jquery-like lib).
Unfortunately :

* jsdom 0.2.12 does not output XHTML, putting most browsers in quirks mode.
  and also has an unpleasant querySelectorAll bug

* A (patched for jsdom) version of [jQuip](https://github.com/mythz/jquip) is available to server-side scripts.

So forks are used until a better situation is found.

