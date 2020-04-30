# `@northscaler/bunyaner`
Make [bunyan](https://www.npmjs.com/package/bunyan)'s log level methods much mo' betta'!

## Overview
* Have bunyan's log level methods return values, usually the first argument given so that you can inline your logging statements.
* No worries about having your logged objects conflict with [bunyan's core fields](https://www.npmjs.com/package/bunyan#core-fields).
* Allow log level methods to support functions in order to defer expensive log statements if the log method's level is below the currently configured log level.

>NB: Git repo of truth is https://gitlab.com/northscaler-public/bunyaner; all others are mirrors.

## TL;DR
Install `bunyan` & `@northscaler/bunyaner`:
```bash
$ npm i --save bunyan
$ npm i --save @northscaler/bunyaner
```
Create a file that your module will use to get a logger:
```javascript
// log.js
const bunyan = require('bunyan')
const bunyaner = require('bunyaner')

module.exports = bunyaner({ bunyanLogger: bunyan.createLogger({ name: 'my-logger' }) })
```

Now use it:
```javascript
const log = require('./log')

let gameState = log.info({
  game: 'zork',
  player: 'querky123'
}) // logs { ..., "payload": { "game": "zork", "player": "querky123" }, ... } & returns object

// ...querky123 plays game to level 5...

gameState = log.info({
  game: 'zork',
  player: 'querky123',
  level: 5 // <- conflicts with bunyan core logging field, but no matter!
}) // logs { ..., "payload": { "game": "zork", ..., "level": 5 }, ... } & returns object

if (gameState.badness) {
  // log method logs given error, then returns it so it can be thrown
  throw log.error(new Error('boom'))
} // logs { ..., "isError": true, "payload": { "message": "boom", "stack": ... }, ... } & returns the error object

// don't do calculations if your logging level is higher than
// your method's level by putting whatever's logged inside a function:
log.debug(() => `foo: ${somethingExpensive()}`)

// if log.level is > debug, somethingExpensive() is never called;
// it only gets called if log.level <= debug
```
## Tips

### Don't use return value feature with deferred logging
If you use deferred logging, like `log.debug(() => somethingExpensive())`, remember that you'll only get the value if the current log level is at or below the method's level.

### Use aspects for tracing
Combine AOP from [@northscaler/aspectify](https://www.npmjs.com/package/@northscaler/aspectify) with this library's deferred logging to do automated, efficient and unobstrusive tracing.
Here's an example that logs inputs as well as happy & saddy path outputs:
```javascript
// in file tracer.js
const { AsyncAround } = require('@northscaler/aspectify')
const log = require('./.../log.js') // as above
 
const tracer = async ({ thisJoinPoint }) => {
  let start = Date.now()

  let retval
  try {
    const returned = await thisJoinPoint.proceed()

    // the function given here only gets evaluated if log.level <= debug
    // so there's almost no performance penalty when logging above debug
    log.debug(() => {
      clazz: thisJoinPoint.clazz.name,
      method: thisJoinPoint.fullName,
      args: thisJoinPoint.args,
      returned,
      elapsed: Date.now() - start
    })

    return returned
  } catch (e) {
    log.error(() => {
      clazz: thisJoinPoint.clazz.name,
      method: thisJoinPoint.fullName,
      args: thisJoinPoint.args,
      threw: e,
      elapsed: Date.now() - start
    })

    throw e
  }
}
 
module.exports = AsyncAround(tracer)
```

Now use it:
```javascript
const trace = require('./tracer')

class CustomerRepository {
  constructor(mongoose) {
    // ...  
  }

  // will log happy path & saddy path args & retval/error
  // no need for log statements everywhere
  @trace
  async findByLastName(lastName) {
    // use mongoose to query...
  }

  // ...
}
```
