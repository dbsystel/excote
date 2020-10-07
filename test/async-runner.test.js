const chai = require('chai')
const chaiSubset = require('chai-subset')
chai.use(require('chai-as-promised'))
const should = chai.should()
const expect = chai.expect
const sinon = require('sinon')
const loggerMock = require('./loggerMock')
const util = require('util')

chai.use(chaiSubset)
const TEST_DURATION = 5
/**
 * The test data strategy is to have a large wait time after a successful test, and a short test duration time,
 * as well as a short wait time after an error, to be able to test this behavior correctly
 * @type {{success: number, error: number, timeout: number}}
 */
const timeOptions = {
  success: 100,
  error: 5
}
const PAUSE_DURATION = timeOptions.success * 5
let AsyncRunner = require('../src/async-runner')
let asyncRunner
let clock

/**
 * Creates a runner that can be given a list of results. Depending on the invocation number of the execute function,
 * it will return the n-th result element, always after waiting the testDuration amount of time.
 * @param results An array of results that are returned
 * @param testDuration The time that is waited before returning the result, simulating a long running test
 * @returns {{execute}}
 */
let stubRunner = (results = [{}], testDuration = TEST_DURATION) => {
  return {
    execute: (() => {
      let stub = sinon.stub()
      results.forEach((result, i) => {
        stub.onCall(i).callsFake(async () => {
          await sleep(testDuration)
          return result
        })
      })
      return stub
    })(),
    abortAllRunningExecutions: (() => {
      loggerMock.info('Execution Canceled')
    })
  }
}

/**
 * Helper method to create an async runner and to assign it to a variable, in order to clean up after each test
 * @param runner
 * @returns {{stop, lastResult}}
 */
function setupAsyncRunner(runner) {
  asyncRunner = AsyncRunner(loggerMock, undefined, timeOptions, runner)
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * This will wait until all other code that is currently waiting to be executed because of a tick advancement is executed.
 *
 * @return Promise<void>
 */
async function endOfNodeEventLoop() {
  return await util.promisify(setImmediate)()
}

/**
 * This will advance the fake clock by duration milliseconds and then wait for the end of the Node Event Loop
 * @param {number} duration
 */
async function tickAndWait(duration) {
  clock.tick(duration)
  await endOfNodeEventLoop()
}

describe('Async Runner', () => {
  beforeEach(() => {
    sinon.resetHistory()
    // We do not want to fake setImmediate, otherwise we could not skip at the end of the event loop in our tests
    clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime']})
  })

  afterEach(() => {
    if (asyncRunner) {
      asyncRunner.stop()
    }
    asyncRunner = undefined
    clock.restore()
  })
  it('should return http 200 if no test was executed yet', async () => {
    //delay the execute function of the runner to test the behavior of a long running first test
    setupAsyncRunner(stubRunner())
    asyncRunner.getLastResult().should.have.property('successful', true)
    expect(asyncRunner.getLastResult().startTime).to.be.undefined
    expect(asyncRunner.getLastResult().endTime).to.be.undefined

  })

  it('should return the result of the first runner invocation after the test executed', async () => {
    let result = {body: {test: 'this'}, successful: true}
    setupAsyncRunner(stubRunner([result]))
    await tickAndWait(TEST_DURATION)
    asyncRunner.getLastResult().body.should.deep.equal(result.body)
  })

  it('should return the result of the second runner invocation after the wait time has passed and the second test is executed correctly', async () => {
    let result1 = {body: {test: 'this'}, successful: true}
    let result2 = {body: {test: 'second'}, successful: true}
    setupAsyncRunner(stubRunner([result1, result2]))
    await tickAndWait(TEST_DURATION)
    await tickAndWait(timeOptions.success)
    await tickAndWait(TEST_DURATION)
    asyncRunner.getLastResult().body.should.deep.equal(result2.body)
  })

  it('should use the error timeOptions for starting the next command if the previous failed', async () => {
    let result1 = {body: {test: 'this'}, successful: false}
    let result2 = {body: {test: 'second'}, successful: true}
    setupAsyncRunner(stubRunner([result1, result2]))
    await tickAndWait(TEST_DURATION)
    await tickAndWait(timeOptions.error)
    await tickAndWait(TEST_DURATION)
    asyncRunner.getLastResult().body.should.deep.equal(result2.body)
  })

  describe('Test pause and resume', () => {
    it('should pause execution and resume after the timeout', async () => {
      //delay the execute function of the runner to test the behavior of a long running first test
      const results = generateResultData(4)
      setupAsyncRunner(stubRunner(results))
      await tickAndWait(TEST_DURATION)
      await tickAndWait(timeOptions.success)
      await tickAndWait(TEST_DURATION)
      asyncRunner.pauseAsyncExecution(PAUSE_DURATION)
      await tickAndWait(PAUSE_DURATION)
      asyncRunner.getLastResult().body.should.deep.equal(results[1].body)
      await tickAndWait(TEST_DURATION)
      asyncRunner.getLastResult().body.should.deep.equal(results[2].body)
      await tickAndWait(timeOptions.success)
      await tickAndWait(TEST_DURATION)
      asyncRunner.getLastResult().body.should.deep.equal(results[3].body)
    })

    it('should immediately start next test operation after pause was called and then resume was called', async () => {
      const results = generateResultData(3)
      setupAsyncRunner(stubRunner(results))
      await tickAndWait(TEST_DURATION)
      asyncRunner.pauseAsyncExecution(PAUSE_DURATION)
      asyncRunner.resumeAsyncExecution()
      await tickAndWait(TEST_DURATION)
      asyncRunner.getLastResult().body.should.deep.equal(results[1].body)
    })

    let generateResultData = (n) => {
      let results = []
      for (let i = 0; i < n; i++) {
        results.push({body: {test: i}, successful: true})
      }
      return results
    }

    it('should do nothing, if resume is called but the state is currently not paused', async () => {
      const results = generateResultData(3)
      setupAsyncRunner(stubRunner(results))
      await tickAndWait(TEST_DURATION - 1)
      asyncRunner.resumeAsyncExecution()
      await tickAndWait(TEST_DURATION)
      asyncRunner.getLastResult().body.should.deep.equal(results[0].body)
    })
  })

  it('should ignore results if they occur while paused', async () => {
    const result = {body: {test: 'this'}, successful: false}
    setupAsyncRunner(stubRunner([result]))
    asyncRunner.pauseAsyncExecution(PAUSE_DURATION)
    asyncRunner.getLastResult().successful.should.be.true
    await tickAndWait(TEST_DURATION)
    asyncRunner.getLastResult().successful.should.be.true
  })
})
