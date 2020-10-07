/**
 * This module is able to execute another node process and collect the results, if this process prints the result to the stdout as a json.
 * @module execote
 * @param logger A logger compatible with winstons api
 * @param EXECUTION_TIMEOUT The timeout in milliseconds, until the process is forcefully stopped and an error is thrown
 * @param command The command that is executed to run the tests
 * @param contentType the content type of the response body (needs to be XML at the moment)
 * @param fs fs node package
 * @param xmlReader read-xml node package
 * @param Runner The runner.js file of this package, has a default, can be adjusted for testing
 * @param AsyncRunner The async-runner.js file of this package, has a default, can be adjusted for testing
 * @example require('test-executor')(logger, 60 * 1000, 'npm test', 'text/html')
 */
module.exports = (logger, EXECUTION_TIMEOUT, command, contentType, fs = require('fs'), xmlReader = require('read-xml'), Runner = require('./runner'), AsyncRunner = require('./async-runner')) => {

  const runner = Runner(logger, fs, xmlReader)
  let asyncRunner

  const synchronousExecutionRoute = async (req, res) => {
    logger.debug(`Start to execute command [${command}]`)
    let result = await runner.execute(command, EXECUTION_TIMEOUT)
    handleResult(res, result)
    res.end()
  }

  const asynchronousTestResultsRoute = async (req, res) => {
    if (!asyncRunner) {
      throw new Error('The asyncRunner needs to be started once, by calling startAsyncRunner.')
    }

    const result = asyncRunner.getLastResult()
    res.header('X-test-start', result.startTime)
    res.header('X-test-end', result.endTime)
    handleResult(res, result)
    res.end()
  }

  function handleResult (response, result) {
    response.type(result.contentType || contentType)
    response.status(result.successful ? 200 : 503)
    response.send(result.body)
  }

  /**
   *
   * @typedef {Object} TimeOptions
   * @property {number} [timeout] - The time that the execution of a command is allowed to take. Defaults to the ExecutionTimeout of the Executor Module
   * @property {number} success - The time that is waited after a successful command was executed
   * @property {number} error - The time that is waited after an unsuccessful command was executed
   *
   * @example {timeout: 10* 60 * 1000, success: 60 * 60 * 1000, failure: 10 * 60 * 1000}
   */

  /**
   * This starts a runner that runs periodic commands in the background, given the timeOptions.
   * @param {TimeOptions} timeOptions Options that control the periodic execution of the commands in the background
   */
  const startAsyncRunner = (timeOptions) => {
    if (asyncRunner) {
      throw new Error('There is already an instance of the async runner running. This module only allows to start the runner once, create another instance of this module to have multiple different runners')
    }
    if (!timeOptions.timeout) {
      timeOptions.timeout = EXECUTION_TIMEOUT
    }
    asyncRunner = AsyncRunner(logger, command, timeOptions, runner)
  }

  /**
   * This pauses the runner for the duration which is set with the timeout value.
   * @param {number} timeout duration to pause the period execution of commands. Has a default of 2 hours.
   */
  const pauseAsyncRunner = (timeout = 1000 * 2 * 60 * 60) => {
    asyncRunner.pauseAsyncExecution(timeout)
  }

  /**
   * This resumes a paused runner immediately.
   */
  const resumeAsyncRunner = () => {
    asyncRunner.resumeAsyncExecution()
  }

  return {
    synchronousExecutionRoute,
    asynchronousTestResultsRoute,
    startAsyncRunner,
    pauseAsyncRunner,
    resumeAsyncRunner,
    buildResultString: runner.buildResultString,
    getLastResult: () => asyncRunner.getLastResult(),
    stop: () => asyncRunner.stop()
  }
}
