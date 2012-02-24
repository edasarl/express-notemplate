express-notemplate
==================

What ?
------

* templates are pristine html
* no artifical language or syntax, plain DOM scripts
* functions that merge data on server can also be used to merge data on browsers,
  whenever possible or useful.
* jQuery-like library to help manipulation and portability.


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

As usual in express, define locals :

	res.local('mydata', mydata);

Add handlers inside your html :

	<script type="text/javascript" notemplate="server">
		function _merge(data) {
			$('head > title').text(data.mydata.title);
		}
	</script>
	<script type="text/javascript">
		function merge(data) {
			$('body').html(data.mydata.body);
		}
	</script>

The script tag with notemplate="server" attribute will call _merge(), then be removed from output.
Then merge() is called.

Client-side browsers will have access to window.merge, not to window._merge.

A modified version of [jQuip](https://github.com/mythz/jquip)
is available to the server-side scripts, allowing easy DOM manipulation and traversal.


Dependencies
------------

Ideally express-notemplate should use upstream jsdom and jquip (or another jquery-like lib).
Unfortunately :

* jsdom 0.2.12 does not output XHTML, putting most browsers in quirks mode.
  and also has a small querySelectorAll bug.

* jquip cannot be used as-is with jsdom

So forks are used until a better situation is found.

