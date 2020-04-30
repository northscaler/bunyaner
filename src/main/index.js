'use strict'

const util = require('util')

// see https://github.com/trentm/node-bunyan#log-method-api
const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

// see https://github.com/trentm/node-bunyan#core-fields
const CORE_FIELDS = ['v', 'level', 'name', 'hostname', 'pid', 'time', 'msg', 'src']

const DEFAULT_PAYLOAD_KEY = 'payload'
const DEFAULT_ERROR_KEY = 'isError'

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
 * * If `typeof arguments[0]` is `'string'` and is a [`util.format`](https://nodejs.org/api/util.html#util_util_format_format_args) string, then the _second_ argument to the log level method is returned.
 * * Otherwise, the formatted string is returned.
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
      let head = args[0]

      if (typeof head === 'function') {
        args = head(...args.slice(1))
        if (!Array.isArray(args)) {
          args = [args]
        }
        head = args[0]
      }

      let eo
      if (head instanceof Error) {
        if (bunyanLogger.serializers && bunyanLogger.serializers.err) {
          eo = bunyanLogger.serializers.err(args[0])
        } else {
          eo = Object.getOwnPropertyNames(args[0])
            .reduce((accum, next) => {
              accum[next] = args[0][next]
              return accum
            }, {})
          eo.name = head.name // add Error name for convenience
        }
        args[0] = eo
      }

      if (typeof args[0] === 'object') {
        args[0] = { [payloadKey]: args[0] }
      } else if (typeof head === 'string' && head.indexOf('%') !== -1) { // then may be a format string
        const formatted = util.format(head, args.slice(1))
        if (head !== formatted) { // then first was a format string
          head = formatted // return the formatted value
          args = [formatted]
        }
      }

      if (eo || alwaysShowErrorIndicator) {
        args[0][errorIndicatorKey] = !!eo
      }

      originalMethod(...args)
      return head
    }

    bunyanLogger[level] = patchedMethod.bind(bunyanLogger)
  })

  return bunyanLogger
}

module.exports = bunyaner
