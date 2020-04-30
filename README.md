# `bunyaner`
>NB: Git repo of truth is https://gitlab.com/northscaler-public/bunyaner; all others are mirrors.

## Overview
Make [bunyan](https://www.npmjs.com/package/bunyan)'s log level methods much mo' betta' with mo' bunyan-y flavor by doing the following:

* always return the first argument given
* if any key on `arguments[0]` conflicts with bunyan's [core logging fields](https://github.com/trentm/node-bunyan#core-fields), wraps `arguments[0]` with `{ object: arguments[0] }` in the logging level call

## TL;DR
Install `bunyan` (if you haven't already) & `bunyaner`:
```bash
$ npm i --save bunyan
$ npm i --save bunyaner
```
Create a file that your module will use to get a logger:
```javascript
// log.js
const bunyan = require('bunyan')
const bunyaner = require('bunyaner')

module.exports = bunyaner(bunyan.createLogger({
  name: 'foobar',
  serializers: bunyan.stdSerializers
  // ...other buyan options
}))
```
Now use it:
```javascript
const log = require('./log')

let gameState = log.info({
  game: 'zork',
  player: 'querky123'
}) // logs state object & returns it

// ...querky123 plays game to level 5...

gameState = log.info({
  game: 'zork',
  player: 'querky123',
  level: 5 // <- conflicts with bunyan core logging field, but no matter!
}) // logs gameState as { object: gameState } & returns gameState

if (gameState.badness) {
  // log method logs given error, then returns it so it can be thrown
  throw log.error(new Error('boom'))
}
```
