# solid-logic

<img src="https://raw.githubusercontent.com/solid/community-server/main/templates/images/solid.svg" alt="[Solid logo]" height="150" align="right"/>

[![MIT license](https://img.shields.io/github/license/solidos/solidos)](https://github.com/solidos/solidos/blob/main/LICENSE.md)


Core business logic of SolidOS which can be used for any webapp as well.


# Usage

## 📦 Install via npm

```sh
npm install solid-logic rdflib
```

> **Important**: `rdflib` is a peer dependency - you must install it separately.

### Import in your project (ESM/TypeScript)

```js
import { solidLogicSingleton, store, authn } from 'solid-logic';

// Example usage
console.log('Current user:', authn.currentUser());
```

## 🌐 Use directly in a browser

Both UMD and ESM bundles externalize rdflib to keep bundle sizes small and avoid version conflicts.

## Available Files

| Format | File | Usage | Global Variable |
|--------|------|-------|----------------|
| UMD | `dist/solid-logic.js` | Development | `window.SolidLogic` |
| UMD | `dist/solid-logic.min.js` | Production | `window.SolidLogic` |
| ESM | `dist/solid-logic.esm.js` | Development | Import only |
| ESM | `dist/solid-logic.esm.min.js` | Production | Import only |

### UMD Bundle (Script Tags)

**⚠️ Important**: Load rdflib **before** solid-logic or you'll get `$rdf is not defined` errors.

```html
<!-- 1. Load rdflib first (creates window.$rdf) -->
<script src="https://cdn.jsdelivr.net/npm/rdflib/dist/rdflib.min.js"></script>

<!-- 2. Load solid-logic (expects $rdf to exist) -->
<script src="https://unpkg.com/solid-logic/dist/solid-logic.min.js"></script>

<script>
	// Access via global variable
	const { solidLogicSingleton, store, authn } = window.SolidLogic;
	
	// Example usage
	console.log('Store:', store);
	console.log('Authentication:', authn.currentUser());
</script>
```

### ESM Bundle (Native Modules)

```html
<script type="module">
	import * as $rdf from 'https://esm.sh/rdflib';
	import { solidLogicSingleton, store, authn } from 'https://esm.sh/solid-logic@4.0.1';

	// Example usage
	console.log('Store:', store);
	console.log('Authentication:', authn.currentUser());
</script>
```

### ESM with Import Maps (Recommended)

```html
<script type="importmap">
{
	"imports": {
		"rdflib": "https://esm.sh/rdflib",
		"solid-logic": "https://esm.sh/solid-logic@4.0.1"
	}
}
</script>
<script type="module">
	import * as $rdf from 'rdflib';
	import { solidLogicSingleton, store, authn } from 'solid-logic';

	// Example usage - cleaner imports!
	console.log('Store:', store);
	console.log('Authentication:', authn.currentUser());
</script>
```

## Common Exports

```js
import { 
	solidLogicSingleton,  // Complete singleton instance
	store,                // RDF store
	authn,                // Authentication logic
	authSession,          // Authentication session
	ACL_LINK,            // ACL constants
	getSuggestedIssuers,  // Identity provider suggestions
	createTypeIndexLogic, // Type index functionality
	// Error classes
	UnauthorizedError,
	NotFoundError,
	FetchError
} from 'solid-logic';
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
