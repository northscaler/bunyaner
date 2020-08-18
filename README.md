# `@northscaler/bunyaner`
Make [bunyan](https://www.npmjs.com/package/bunyan)'s log level methods much mo' betta'!

## Overview
* Have bunyan's log level methods return values, usually the first argument given so that you can inline your logging statements.
* No worries about having your logged objects conflict with [bunyan's core fields](https://www.npmjs.com/package/bunyan#core-fields).
* Allow log level methods to support functions in order to defer expensive log statements if the log method's level is below the currently configured log level.

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
const bunyaner = require('@northscaler/bunyaner')

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
  throw log.error(new Error('boom'), 'we blew up')
} // logs { ..., "isError": true, "payload": { "message": "boom", "stack": ... }, "msg": "we blew up", ... } & returns the error object

// avoid calculations if your logging level is higher than
// your method's level by putting whatever's logged inside a function:
log.debug(() => `foo: ${somethingExpensive()}`) // if log.level() is > debug, somethingExpensive() is never called!
```

## Details
This library monkey patches a bunyan logger to give it log level methods that
* return a value,
* allow the caller to defer expensive evaluation when the current log level is below the level of the log method invoked.
* prevent conflicts with [bunyan's core fields](https://www.npmjs.com/package/bunyan#core-fields), and
* indicate that the logged object was an `Error`.

### Returning values
With this monkey patch, the log methods return values so that you can inline your logging code.
The returned value is usually the first argument that you give the log function, but there are some exceptions noted below.
Generally, inline logging looks like this:
```
const foo = log.debug({bar: true}, 'I just set my foo')
```
and it will log something like this (without indentation):
```
{
  "name": "test",
  "hostname": "...",
  "pid": 32708,
  "level": 30,
  "payload": {
    "bar": true
  },
  "msg": "I just set my foo",
  "time": "2020-08-18T17:13:42.766Z",
  "v": 0
}
```
The value is returned whether or not the log level method would generate log output.
Otherwise, inline logging wouldn't be very valuable!

The only times the value returned from the log method is _not_ the first value are the following.
 
* If the first argument is a function, you are performing deferred execution and shouldn't be using inline logging, so `undefined` is returned.
* If the first argument is a [`util.format`](https://nodejs.org/api/util.html#util_util_format_format_args) string, then the _second_ argument to the log level method is returned and there is no `payload` property in the logged record.

### Lazy log calculations
Passing a function to the log method will cause evaluation of the function to be executed only if the current log method would produce output.
After all, if you're not going to log anything, then don't calculate anything to log!

When the first argument is a function, the function will be invoked with the remainder of the arguments given and the function's return value will be passed along to bunyan's log method.
If the function returns an array, then the elements become the multiple arguments to the log method.

### No conflicts with core logging properties
For any object that you want to log, this monkey patch puts it in a property called `payload` (by default), so that you don't ever conflict with [bunyan's core fields](https://www.npmjs.com/package/bunyan#core-fields).

### Logging `Error`s
If the payload is an `Error`, the `isError` property is included in the log record with the value `true`.
You can also force the `isError` property to _always_ be present, too, and its value will be `true` or `false` based on whether the `payload` is an `Error`.
```
throw log.error(new Error('boom'), 'Done blowed up')
```
logs (without indentation):
```
{
  "name": "test",
  "hostname": "...",
  "pid": 32908,
  "level": 50,
  "payload": {
    "message": "boom",
    "name": "Error"
  },
  "isError": true,
  "msg": "Done blowed up",
  "time": "2020-08-18T17:49:30.797Z",
  "v": 0
}
```
Notice the `payload` & `isError` properties in the log record.

If the first argument is an `Error`, bunyan's configured `err` serializer is used to log it, otherwise it is converted into a plain, old JavaScript object and that value is logged.
In either case, there is a log record field added called `isError` (by default) and its value will be truthy.
If you don't want to include the `Error` `stack`, use your own `err` serializer with bunyan.

## Configuration
The function returned by `require('@northscaler/bunyaner')` takes a configuration object as follows.
```
{
  bunyanLogger: logger,             // required: your configured bunyan logger instance
  bunyanerOpts: {                   // optional
    payloadKey: 'payload',          // or whatever you want, just don't conflict with bunyan
    errorIndicatorKey: 'isError',   // or whatever you want, just don't conflict with bunyan
    alwaysShowErrorIndicator: false // or true
  }
}
```
Create a file in your app that configures the log, then have your app just `require`:
```javascript
const bunyan = require('bunyan')
const bunyaner = require('@northscaler/bunyaner')

// ...configure bunyan however you want to here...
const logger = bunyan.createLogger({ name: 'my-logger' })

module.exports = bunyaner({ bunyanLogger: logger })
``` 

## Tips

### Don't use return value feature with deferred logging
If you use deferred logging, like `log.debug(() => somethingExpensive())`, remember that you will _not_ get a return value from the log method, because you are intentionally skipping logging based on the current log level.

### Use aspects for tracing
Combine AOP from [@northscaler/aspectify](https://www.npmjs.com/package/@northscaler/aspectify) with this library's deferred logging to do automated, efficient and unobtrusive tracing.
Here's an example that logs inputs as well as happy & saddy path outputs:
```javascript
// in file trace.js
const { AsyncAround } = require('@northscaler/aspectify')
const log = require('./.../log.js') // as above
 
const trace = async ({ thisJoinPoint }) => {
  const start = Date.now()

  try {
    const returned = await thisJoinPoint.proceed()
    log.trace(() => ({
      clazz: thisJoinPoint.clazz.name,
      method: thisJoinPoint.fullName,
      args: thisJoinPoint.args,
      returned,
      elapsed: Date.now() - start
    }))

    return returned
  } catch (e) {
    log.error(() => ({
      clazz: thisJoinPoint.clazz.name,
      method: thisJoinPoint.fullName,
      args: thisJoinPoint.args,
      threw: e,
      elapsed: Date.now() - start
    }))

    throw e
  }
}
 
module.exports = AsyncAround(trace)
```

Now use it:
```javascript
const trace = require('./trace')

class CustomerRepository {
  constructor(mongoose) {
    // ...  
  }

  @trace // will log happy & saddy paths -- no need for log statements everywhere
  async findByLastName(lastName) {
    // use mongoose to query...
  }
}
```

### Use @northscaler/error-support
_NB: shameless plug._

If you use [@northscaler/error-support](https://www.npmjs.com/package/@northscaler/error-support), the `Error`s you log will be [converted very nicely to a loggable object](https://www.npmjs.com/package/@northscaler/error-support#toobject), include entire cause chains.

