# solid-logic

<img src="https://raw.githubusercontent.com/solid/community-server/main/templates/images/solid.svg" alt="[Solid logo]" height="150" align="right"/>

[![MIT license](https://img.shields.io/github/license/solidos/solidos)](https://github.com/solidos/solidos/blob/main/LICENSE.md)


Core business logic of SolidOS which can be used for any webapp as well.


# Usage

## Install via npm

```sh
npm install solid-logic
```

### Import in your project (ESM/TypeScript)

```js
import { someFunction } from 'solid-logic';
```

## Use directly in a browser
 Both UMD and ESM bundles take rdflib as external, this means you need to install it yourself, separately. 

## Files
- For browser UMD, without rdflib: `dist/solid-logic.js` (global `window.SolidLogic`)
- For browser ESM, without rdflib: `dist/solid-logic.esm.external.js` (import as module)
- UMD has also chunked files.
- both version also containe minified versions.


### UMD bundle (global variable)

```html
<!-- Load dependencies first -->
<script src="https://cdn.jsdelivr.net/npm/rdflib/dist/rdflib.min.js"></script>
<!-- Load solid-logic UMD bundle -->
<script src="https://unpkg.com/solid-logic/dist/solid-logic.min.js"></script>
<!-- or -->
<!-- script src="https://cdn.jsdelivr.net/npm/solid-logic/dist/solid-logic.min.js"></script -->
<!-- or -->
<!-- script src="dist/solid-logic.js"></script -->
<script>
	// Access via global variable
	const rdflib = window.$rdf;
	const logic = window.SolidLogic;
	// Example usage
	// logic.someFunction(...)
</script>
```


### ESM bundle (import as module)

```html
<script type="module">
	import * as $rdf from 'https://esm.sh/rdflib'
	import { someFunction } from 'https://esm.sh/solid-logic'

	// Example usage
	// someFunction(...)
</script>
```

or 

### ESM bundle with import map (bare specifiers)

```html
<script type="importmap">
{
	"imports": {
		"rdflib": "https://esm.sh/rdflib",
		"solid-logic": "https://esm.sh/solid-logic"
	}
}
</script>
<script type="module">
    import * as $rdf from 'rdflib'
	import { someFunction } from 'solid-logic'

	// Example usage
	// someFunction(...)
</script>
```

# How to develop

Check the scripts in the `package.json` for build, watch, lint and test.

# Used stack

* TypeScript + Babel
* Jest
* ESLint
* Webpack

# How to release

Change version and push directly to main. This will trigger the npm release latest script in CI.

# History

Solid-logic was a move to separate business logic from UI functionality so that people using different UI frameworks could use logic code. 

It was created when the "chat with me" feature was built. We needed to share logic between chat-pane and profile-pane (which was part of solid-panes back then I think) due to that feature. The whole idea of it is to separate core solid logic from UI components, to make logic reusable, e.g. by other UI libraries or even non web apps like CLI tools etc. 
