'use strict'

const bunyan = require('bunyan')
const bunyaner = require('../../..')

const log = ({
  name,
  bunyanerOpts,
  bunyanLogger
} = {}) => bunyaner({
  bunyanLogger: bunyanLogger || bunyan.createLogger({ name: name || 'test' }),
  bunyanerOpts
})

module.exports = log
