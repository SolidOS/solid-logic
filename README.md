# solid-logic

<img src="https://raw.githubusercontent.com/solid/community-server/main/templates/images/solid.svg" alt="[Solid logo]" height="150" align="right"/>

[![MIT license](https://img.shields.io/github/license/solidos/solidos)](https://github.com/solidos/solidos/blob/main/LICENSE.md)


Core business logic of SolidOS which can be used for any webapp as well.

# How to use

Either `npm install solid-logic` or in your HTML use directly `solid-logic.js` from `dist` folder.

# How to develop

Check the scripts in the `package.json` for build, watch, lint and test.

# Used stack

* TypeScript + Babel
* Jest
* ESLint
* Rollup

# How to release

Either chnage version and push directly to main. This will trigger the npm release latest script in CI.
Or commit a tag to main and than create a release (on the right side of the reps main page). Creating a release manaully, triggers teh release.yml script.

# History

Solid-logic was a move to separate business logic from UI functionality so that people using different UI frameworks could use logic code. 

It was created when the "chat with me" feature was built. We needed to share logic between chat-pane and profile-pane (which was part of solid-panes back then I think) due to that feature. The whole idea of it is to separate core solid logic from UI components, to make logic reusable, e.g. by other UI libraries or even non web apps like CLI tools etc. 
