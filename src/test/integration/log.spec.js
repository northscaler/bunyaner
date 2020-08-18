/* global describe, it, beforeEach, afterEach */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const intercept = require('intercept-stdout')
const bunyan = require('bunyan')
const nodeMajorVersion = process.versions.node.split('.')[0]

const getLog = require('./log')

describe('integration tests of bunyaner', function () {
  let unintercept
  let stdout

  beforeEach(function () {
    unintercept = intercept(text => {
      stdout = text
    })
  })

  afterEach(function () {
    unintercept()
    stdout = null
  })

  it('should work with an Error object', function () {
    for (const alwaysShowErrorIndicator of [true, false]) {
      const log = getLog({ bunyanerOpts: { alwaysShowErrorIndicator } })
      const msg = 'a message'
      const code = 'E_CODE'
      let it = new Error(msg)
      it.code = code

      let actual = log.error(it)
      expect(actual).to.equal(it)

      let json = JSON.parse(stdout)
      expect(json.payload).to.deep.equal({
        name: 'Error',
        message: actual.message,
        stack: actual.stack,
        code: actual.code
      })

      expect(json.isError).to.equal(true)

      stdout = null
      it = { foo: 'bar' }

      actual = log.info(it)
      expect(actual).to.equal(it)

      json = JSON.parse(stdout)
      expect(json.payload).to.deep.equal(it)

      if (alwaysShowErrorIndicator) {
        expect(json.isError).to.equal(false)
      }
    }
  })

  it('should work with an Error object and a custom serializer', function () {
    const boom = 'boom'
    const expected = { boom }

    const log = getLog({
      bunyanLogger: bunyan.createLogger({
        name: 'test',
        serializers: {
          err: () => ({ boom })
        }
      })
    })

    const it = new Error('a message')

    const actual = log.error(it)
    expect(actual).to.equal(it)

    const json = JSON.parse(stdout)
    expect(json.payload).to.deep.equal(expected)

    expect(json.isError).to.equal(true)
  })

  it('should work with a non-conflicting object', function () {
    const expected = { foo: 'foo' }
    const log = getLog()

    const actual = log.info(expected)
    expect(actual).to.equal(expected)

    const json = JSON.parse(stdout)
    expect(json.payload).to.deep.equal(expected)
  })

  it('should work with a function returning a non-conflicting object', function () {
    const expected = { foo: 'foo' }
    const log = getLog()

    const actual = log.info(() => expected)
    expect(actual).to.equal(expected)

    const json = JSON.parse(stdout)
    expect(json.payload).to.deep.equal(expected)
  })

  it('should work with a function taking arguments returning a non-conflicting object', function () {
    const value = 'foo'
    const expected = { foo: value }
    const log = getLog()

    const actual = log.info(it => ({ foo: it }), value)
    expect(actual).to.deep.equal(expected)

    const json = JSON.parse(stdout)
    expect(json.payload).to.deep.equal(expected)
  })

  it('should work with a conflicting object', function () {
    const expected = { v: 'v' }
    const log = getLog()

    const actual = log.info(expected)
    expect(actual).to.equal(expected)

    const json = JSON.parse(stdout)
    expect(json.payload).to.deep.equal(expected)
  })

  it('should work with a function returning a conflicting object', function () {
    const expected = { v: 'v' }
    const log = getLog()

    const actual = log.info(() => expected)
    expect(actual).to.equal(expected)

    const json = JSON.parse(stdout)
    expect(json.payload).to.deep.equal(expected)
  })

  it('should work with a string', function () {
    const expected = 'a plain old string'
    const log = getLog()

    const actual = log.info(expected)
    expect(actual).to.equal(expected)

    const json = JSON.parse(stdout)

    expect(json.payload).to.equal(expected)
  })

  it('should work with a formatting string', function () {
    const format = 'format %s'
    const object = { an: 'object' }
    const expected = nodeMajorVersion >= 12 ? 'format [ [Object] ]' : 'format [object Object]'
    const log = getLog()

    const actual = log.info(format, object)
    expect(actual).to.equal(expected)

    const json = JSON.parse(stdout)
    expect(json.msg).to.equal(expected)
  })

  it('should work with multiple strings', function () {
    const strings = ['a plain old string', 'with another string', 'and a third string']
    const expected = strings.join(' ')
    const log = getLog()

    const actual = log.info(...strings)
    expect(actual).to.equal(strings[0])

    const json = JSON.parse(stdout)
    expect(json.msg).to.equal(expected)
  })

  it('should work with a function returning an array of strings', function () {
    const strings = ['a plain old string', 'with another string', 'and a third string']
    const expected = strings.join(' ')
    const log = getLog()

    const actual = log.info(() => strings)
    expect(actual).to.equal(strings[0])

    const json = JSON.parse(stdout)
    expect(json.msg).to.equal(expected)
  })

  it('should work with a function returning an array of a format string and an object', function () {
    const obj = { foo: 'foo' }
    const format = 'format %s'
    const args = [format, obj]
    const expected = nodeMajorVersion >= 12 ? 'format [ [Object] ]' : 'format [object Object]'
    const log = getLog()

    const actual = log.info(() => args)
    expect(actual).to.equal(expected)

    const json = JSON.parse(stdout)
    expect(json.msg).to.equal(expected)
  })

  it('should return the object given even when the log method is below the log threshold', function () {
    const expected = { foo: 'foo' }
    const log = getLog()
    log.level('info')

    const actual = log.debug(expected)
    expect(actual).to.equal(expected)

    expect(stdout).not.to.be.ok()
  })

  it('should only invoke the function when the log method is at or above the current log level', function () {
    let i = 0
    const msg = 'a message'
    const msg2 = 'another message'

    const log = getLog()
    log.level('info')

    let actual = log.debug(() => { // below
      i++
      return msg
    })
    expect(actual).to.equal(undefined)
    expect(i).to.equal(0)
    expect(stdout).not.to.be.ok()

    actual = log.info(() => { // at
      i++
      return msg
    })
    expect(actual).to.equal(msg)
    expect(i).to.equal(1)
    expect(JSON.parse(stdout).payload).to.equal(msg)

    actual = log.warn(() => { // above
      i++
      return msg2
    })
    expect(actual).to.equal(msg2)
    expect(i).to.equal(2)
    expect(JSON.parse(stdout).payload).to.equal(msg2)
  })

  it('should return edge cases correctly', function () {
    let expected
    let actual
    const log = getLog()
    log.level('info')

    expected = null
    actual = log.info(expected)
    expect(actual).to.equal(expected)
    expect(JSON.parse(stdout).payload).to.equal(expected)

    expected = undefined
    actual = log.info(expected)
    expect(actual).to.equal(expected)
    expect(JSON.parse(stdout).payload).to.equal(expected)

    expected = ''
    actual = log.info(expected)
    expect(actual).to.equal(expected)
    expect(JSON.parse(stdout).payload).to.equal(expected)

    expected = ' '
    actual = log.info(expected)
    expect(actual).to.equal(expected)
    expect(JSON.parse(stdout).payload).to.equal(expected)

    expected = true
    actual = log.info(expected)
    expect(actual).to.equal(expected)
    expect(JSON.parse(stdout).payload).to.equal(expected)

    expected = false
    actual = log.info(expected)
    expect(actual).to.equal(expected)
    expect(JSON.parse(stdout).payload).to.equal(expected)

    expected = NaN
    actual = log.info(expected)
    expect(actual).to.be.NaN()
    expect(JSON.parse(stdout).payload).to.equal(null) // NaN is not part of the JSON spec

    expected = Infinity
    actual = log.info(expected)
    expect(actual).to.equal(Infinity)
    expect(JSON.parse(stdout).payload).to.equal('Infinity') // Infinity is not part of the JSON spec

    expected = Symbol('foo')
    actual = log.info(expected)
    expect(actual).to.equal(expected)
    expect(JSON.parse(stdout).payload).to.equal(expected.toString()) // bunyaner doesn't log Symbols, apparently
  })
})
