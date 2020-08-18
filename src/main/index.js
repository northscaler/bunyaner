'use strict'

const util = require('util')

// see https://github.com/trentm/node-bunyan#log-method-api
const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

// see https://github.com/trentm/node-bunyan#core-fields
const CORE_FIELDS = ['v', 'level', 'name', 'hostname', 'pid', 'time', 'msg', 'src']

const DEFAULT_PAYLOAD_KEY = 'payload'
const DEFAULT_ERROR_KEY = 'isError'

const resolveLevel = require('bunyan').resolveLevel

const loggingAt = (levelName, logger) => {
  return logger.level() <= resolveLevel(levelName)
}

/**
 * Returns a function that monkey patches a bunyan logger to give it log level methods that
 * * prevent conflicts with [bunyan's core fields](https://www.npmjs.com/package/bunyan#core-fields),
 * * indicate that the logged object was an `Error`,
 * * return a value, and
 * * allow the caller to defer expensive evaluation when the current log level is below the level of the log method invoked.
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
      let headWasFn

      if (type === 'function') {
        headWasFn = true
        if (!loggingAt(patcheMethodLevel, this)) return // don't evaluate anything if we're not logging at this level!

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
          errorAsObject.name = head.name // add Error.name for convenience
        }
        args = [errorAsObject, ...args.slice(1)]
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
            head = args.length === 2 ? args[1] : args.slice(1) // return the second value if only one, else the rest
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
      return headWasFn ? undefined : head
    }

    bunyanLogger[level] = patchedMethod.bind(bunyanLogger)
  })

  return bunyanLogger
}

module.exports = bunyaner
