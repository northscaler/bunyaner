'use strict'

const util = require('util')

// see https://github.com/trentm/node-bunyan#log-method-api
const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

// see https://github.com/trentm/node-bunyan#core-fields
const CORE_FIELDS = ['v', 'level', 'name', 'hostname', 'pid', 'time', 'msg', 'src']

const DEFAULT_PAYLOAD_KEY = 'payload'
const DEFAULT_ERROR_KEY = 'isError'

const resolveLevel = require('bunyan').resolveLevel

const willLog = (levelName, logger) => {
  return logger.level() <= resolveLevel(levelName)
}

/**
 * Returns a function that monkey patches a bunyan logger to give it log level methods
 * * that return a value (see below), and
 * * that allow the caller to provide a function in order to avoid expensive logging statements when the current log
 *   level is above the level of the log method invoked.
 *
 * ### Return values
 *
 * The value returned from the log level method is determined according to the following rules.
 * * If `typeof arguments[0]` is `'function'`, the return value of that function's invocation is returned.
 * * If `typeof arguments[0]` is `'string'` and is a [`util.format`](https://nodejs.org/api/util.html#util_util_format_format_args) string,
 *   * then the _second_ argument to the log level method is returned.
 *   * else, the formatted string is returned.
 * * Otherwise, `arguments[0]` is returned.
 *
 * ### Passing functions
 *
 * If the first argument is a function, it will be invoked with the remainder of the arguments given (the equivalent of `arguments[0](arguments.slice(1))`.
 * If the function returns an `Array`, then the array is passed as arguments to the log level method (the equivalent of `log.level.apply(log, theArray)`, where `level` is the log level method name.
 * If the function returns a non-`Array`, then that value is returned.
 *
 * ### Logging `Error`s
 *
 * If the first argument is `instanceof Error`, the bunyan's configured `err` serializer is used to log it, otherwise it is converted into a plain, old JavaScript object (using `Object.getOwnPropertyNames(error)`) and that value is logged.
 * In either case, there is a log record field added called `isError` (by default) and its value will be truthy.
 * If you don't want to include the `Error` `stack`, use your own `err` serializer with bunyan.
 *
 * @param {object} arg0 The argument to be deconstructed
 * @param {object} arg0.bunyanLogger A [bunyan](https://www.npmjs.com/package/bunyan) logger.
 * @param {object} [arg0.bunyanerOpts] Options for bunyaner
 * @param {object} [arg0.bunyanerOpts.payloadKey='payload'] The key to use in the bunyan log record for object payloads.
 * @param {object} [arg0.bunyanerOpts.errorIndicatorKey='isError'] The key to use to indicate if the payload contains an Error.
 * @param {object} [arg0.bunyanerOpts.alwaysShowErrorIndicator=false] Whether show the `errorIndicatorKey` for non-Error payloads.
 * @return {function}
 */
const bunyaner = function ({
  bunyanLogger,
  bunyanerOpts
} = {}) {
  if (!bunyanLogger) {
    throw new Error('no bunyan logger given')
  }

  bunyanerOpts = bunyanerOpts || {}

  const payloadKey = bunyanerOpts.payloadKey || DEFAULT_PAYLOAD_KEY
  if (CORE_FIELDS.includes(payloadKey)) {
    throw new Error(`payloadKey ${payloadKey} conflicts with bunyan's core fields`)
  }
  const errorIndicatorKey = bunyanerOpts.errorIndicatorKey || DEFAULT_ERROR_KEY
  if (CORE_FIELDS.includes(payloadKey)) {
    throw new Error(`errorIndicatorKey ${errorIndicatorKey} conflicts with bunyan's core fields`)
  }
  const alwaysShowErrorIndicator = !!bunyanerOpts.alwaysShowErrorIndicator

  LEVELS.forEach(level => {
    const originalMethod = bunyanLogger[level].bind(bunyanLogger)

    const patchedMethod = function (...args) {
      const patcheMethodLevel = level
      let head = args[0]
      let type = typeof head
      let errorAsObject

      if (type === 'function') {
        if (!willLog(patcheMethodLevel, this)) return

        args = head(...args.slice(1))
        args = Array.isArray(args) ? args : [args]
        head = args[0]
        type = typeof head
      }

      if (head instanceof Error) {
        if (bunyanLogger.serializers && bunyanLogger.serializers.err) {
          errorAsObject = bunyanLogger.serializers.err(args[0])
        } else {
          errorAsObject = Object.getOwnPropertyNames(args[0])
            .reduce((accum, next) => {
              accum[next] = args[0][next]
              return accum
            }, {})
          errorAsObject.name = head.name // add Error name for convenience
        }
        args[0] = errorAsObject
      }

      if (type === 'symbol' || type === 'bigint' || args[0] === Infinity) {
        args[0] = { [payloadKey]: args[0].toString() }
      } else if (type === 'object' || type === 'boolean' || type === 'number') {
        args[0] = { [payloadKey]: args[0] }
      }

      if (type === 'string') {
        if (head.indexOf('%') !== -1) { // then head may be a format string
          const formatted = util.format(head, args.slice(1))
          if (head !== formatted) { // then head was a format string
            head = formatted // return the formatted value
            args = [formatted]
          }
        } else {
          if (args.length > 1) args = [args.join(' ')]
          else args[0] = { [payloadKey]: args[0] }
        }
      }

      if (errorAsObject || alwaysShowErrorIndicator) {
        args[0][errorIndicatorKey] = !!errorAsObject
      }

      originalMethod(...args)
      return head
    }

    bunyanLogger[level] = patchedMethod.bind(bunyanLogger)
  })

  return bunyanLogger
}

module.exports = bunyaner
