const chai = require('chai')
const chaiSubset = require('chai-subset')
chai.use(require('chai-as-promised'))
const should = chai.should()
const loggerMock = require('./loggerMock')

chai.use(chaiSubset)
let runner = require('../src/runner')(loggerMock)
// These tests do not assert anything yet, but they help to test if the abortion works by looking at the logs TODO
describe('Runner Integration Tests', () => {
  it('should execute a simple command', async () => {
    let result = await runner.execute(`echo test > /tmp/file.file && echo "${runner.buildResultString(true, '/tmp/file.file')}"`, 20)
    result.successful.should.be.true
  })

  it('should execute a long running command and forcefully abort it', async () => {
    let result = runner.execute(`npx mocha -c test/dummy-test.js && echo "${runner.buildResultString(false, '/tmp/file.file')}"`, 20)
    runner.abortAllRunningExecutions()
    await result
  })
})
