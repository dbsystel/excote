/**
 * This module runs tests in the background and caches the result.
 * @module
 * @param logger
 * @param command
 * @param {TimeOptions} timeOptions
 * @param runner {module:runner}
 * @return {{stop: stop, getLastResult: (function(): {startTime: undefined, endTime: undefined, body: {message: string}, contentType: string, successful: boolean})}}
 */
module.exports = (logger, command, timeOptions, runner) => {
  let lastResult = {
    successful: true,
    body: {message: 'There is no completed test run yet, the first test is still running'},
    contentType: 'application/json',
    startTime: undefined,
    endTime: undefined
  }

  let paused = false

  let timer

  let run = async () => {
    try {
      logger.info('Starting new async run')
      let startTime = new Date()
      let result = await runner.execute(command, timeOptions.timeout)
      result.startTime = startTime
      result.endTime = new Date()
      handleResult(result, result.successful ? timeOptions.success : timeOptions.error)
    } catch (error) {
      logger.error('Unexpected Error while executing the runner, this should not happen: ', error)
      // We always want to set the timeout for the next round, even if something goes terribly wrong
      handleResult({
        successful: false,
        body: {message: 'Unexpected error, please check the logs'},
        contentType: 'application/json'
      }, timeOptions.error)
    }
  }

  let handleResult = (newResult, timeout) => {
    if (!paused) {
      lastResult = newResult
      timer = setTimeout(run, timeout)
      logger.info(`Finished async run with result:[${JSON.stringify(newResult)}]. Next run will start at ${new Date(new Date().getTime() + timeout)}`)
    } else {
      logger.info('discarding result of last run, because the runner is currently paused')
    }
  }

  /**
   * Stops this async runner. This is a throw away method, after calling this, this runner can no longer be used.
   */
  let stop = () => {
    if (timer) {
      clearTimeout(timer)
    }
  }

  /**
   * Set special Timeout to pause the async runner. After this timeout, the normal execution will be continued
   */
  let setOneTimeTimeout = (timeout) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      paused = false
      run()
    }, timeout)
  }

  /**
   * Cancel the automatic execution of the runner and sets a timeout, after this timeout, the normal execution will be continued.
   * If there is a running test, this test will be aborted
   * @param timeout
   */
  let pauseAsyncExecution = (timeout) => {
    logger.info('Request to pause the async execution received. Execution is now paused, running processes are canceled.')
    paused = true
    runner.abortAllRunningExecutions()
    setOneTimeTimeout(timeout)
  }

  let resumeAsyncExecution = () => {
    if (paused) {
      logger.info('Request to resume the async execution received. Execution will start immediately.')
      setOneTimeTimeout(0)
    } else {
      logger.info('Request to resume the async execution received, but the execution is currently not paused. This request will be ignored.')
    }
  }

  run()

  return {getLastResult: () => lastResult, stop, pauseAsyncExecution, resumeAsyncExecution}
}
