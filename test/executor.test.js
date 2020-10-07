'use-strict'

/* eslint-env node, mocha */

const chai = require('chai')
const chaiSubset = require('chai-subset')
chai.use(require('chai-as-promised'))
const should = chai.should()
const sinon = require('sinon')
const loggerMock = require('./loggerMock')

chai.use(chaiSubset)

let AsyncRunner = () => {
  return {
    stop: sinon.fake().returns({}),
    getLastResult: sinon.fake().returns({})
  }
}

const SUCCESSFUL_RESULT = {body: {test: 'this'}, successful: true}
const UNSUCCESFUL_RESULT = {body: {test: 'this'}, successful: false, contentType: 'other/type'}

let Runner = () => {
  return {
    execute: sinon.fake.resolves(SUCCESSFUL_RESULT)
  }
}

let UnsuccessfulRunner = () => {
  return {
    execute: sinon.fake.resolves(UNSUCCESFUL_RESULT)
  }
}

let res = {}
res.status = sinon.fake.returns(res)
res.type = sinon.fake.returns(res)
res.send = sinon.fake.returns(res)
res.end = sinon.fake()

const CONTENT_TYPE = 'content/type'
let executor = require('../src/executor')(loggerMock, undefined, '', CONTENT_TYPE, undefined, undefined, Runner, AsyncRunner)
let unsuccessfulExecutor = require('../src/executor')(loggerMock, undefined, '', CONTENT_TYPE, undefined, undefined, UnsuccessfulRunner, AsyncRunner)

describe('Executor', () => {
  beforeEach(() => {
    sinon.resetHistory()
  })

  it('should call the runner if the synchronous route is called and return the result', async () => {
    await executor.synchronousExecutionRoute(undefined, res)
    res.status.firstCall.args[0].should.equal(200)
    res.send.firstCall.args[0].should.equal(SUCCESSFUL_RESULT.body)
  })

  it('should return the content Type that was passed in if the result itself does not set a ContentType', async () => {
    await executor.synchronousExecutionRoute(undefined, res)
    res.type.firstCall.args[0].should.equal(CONTENT_TYPE)
  })
  it('should return the content type of the result if existent', async () => {
    await unsuccessfulExecutor.synchronousExecutionRoute(undefined, res)
    res.type.firstCall.args[0].should.equal(UNSUCCESFUL_RESULT.contentType)
  })


})
