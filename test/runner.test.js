const chai = require('chai')
const chaiSubset = require('chai-subset')
chai.use(require('chai-as-promised'))
chai.use(require('chai-match'))
const should = chai.should()
const sinon = require('sinon')
const loggerMock = require('./loggerMock')

const fs = {
  readFileSync: sinon.stub().returns(),
  unlinkSync: sinon.stub().returns()
}
const xmlReader = {readXML: sinon.stub().yields(undefined, {content: '<test></test>'})}

chai.use(chaiSubset)
const EXECUTION_TIMEOUT = 20 /* ms */

let runner = require('../src/runner')(loggerMock, fs, xmlReader)
describe('Runner', () => {
  beforeEach(() => {
    beforeEach(() => {
      sinon.resetHistory()
    })
  })
  it('should execute a simple command', async () => {
    let result = await runner.execute(`echo "${runner.buildResultString(true, 'file.file')}"`, EXECUTION_TIMEOUT)
    result.successful.should.be.true
  })

  it('should work with more complex stdout of the process', async () => {
    const line1 = {message: 'This is a log message', level: 'debug'}
    const line2 = {file: 'file.file', status: 200, successful: true}
    const line3 = {text: 'some text'} // this line will be skipped in output

    let result = await runner.execute(`echo '${JSON.stringify(line1)}\n${JSON.stringify(line2)}\n${JSON.stringify(line3)}'`)
    result.successful.should.be.true
    result.log.length.should.equal(1)
  })

  it('should throw an error if the process takes longer than the execution timeout ', async () => {
    let result = await runner.execute(`sleep ${(EXECUTION_TIMEOUT * 2) / 1000} && echo "${runner.buildResultString(true, 'file.file')}"`, EXECUTION_TIMEOUT)
    result.successful.should.be.false
  })

  it('should not throw an error, if the command returns within the timeout', async () => {
    let result = await runner.execute(`sleep ${(EXECUTION_TIMEOUT / 2) / 1000} && echo "${runner.buildResultString(true, 'file.file')}"`, EXECUTION_TIMEOUT)
    result.successful.should.be.true

  })

  it('should throw an error if there is no file parameter', async () => {
    let result = await runner.execute('echo "{}"', EXECUTION_TIMEOUT)
    result.successful.should.be.false

  })

  it('should not block the main thread while waiting for the child process to complete', async () => {
    let start = new Date()
    // Let the bash sleep 100 ms. If this blocks, calling it without await, still takes roughly 100 ms.
    // If it does not block, it will return immediately.
    runner.execute(`sleep ${100 / 1000}`)
    let end = new Date()
    let duration = end.getTime() - start.getTime()
    duration.should.be.lessThan(50)
  })

  it('should abort a running process', async () => {
    let resultPromise = runner.execute(`sleep ${0.05} && echo "${runner.buildResultString(true, 'file.file')}"`)
    runner.abortAllRunningExecutions()
    return resultPromise.should.eventually.have.property('successful', false)
  })

  it('should abort four running process', async () => {
    let resultPromise1 = runner.execute(`sleep ${0.05} && echo "${runner.buildResultString(true, 'file.file')}"`)
    let resultPromise2 = runner.execute(`sleep ${0.05} && echo "${runner.buildResultString(true, 'file.file')}"`)
    runner.abortAllRunningExecutions()
    return await Promise.all([
      resultPromise1.should.eventually.have.property('successful', false),
      resultPromise2.should.eventually.have.property('successful', false)
    ])
  })

  it('the command executed should fail but we should see an appropriate error', async () => {
    let result = await runner.execute('echo2 "test"', EXECUTION_TIMEOUT)
    result.successful.should.be.false
    result.body.error.should.match(/Command failed: echo2 "test"/ )
  })

})
