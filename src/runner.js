var processMaster = require('child_process')
const uuidv4 = require('uuid/v4')
/**
 * This module allows to spawn child processes that call a given command. After the command is finished,
 * it tries to collect a result file and returns if the tests were successful.
 * @module runner
 * @param logger
 * @param fs
 * @param xmlReader
 * @returns {{execute: (function(*=, *=): {body: any, status: *})}}
 */
module.exports = (logger, fs = require('fs'), xmlReader = require('read-xml')) => {
  let runningExecutions = {}
  /**
   * Actually run a command synchronously.
   *
   * @param command The command that is execute in a child process
   * @param executionTimeout A timeout after which the child process is killed and an error is thrown
   * @returns {Promise<{body: any, status: *}>}
   */
  const execute = async (command, executionTimeout) => {
    let stdout = {}
    try {
      stdout = await executeAsync(command, executionTimeout)
    } catch (error) {
      if (error.stdout) {
        stdout = error.stdout
      } else if (error.error && error.error.signal !== 'SIGKILL' && error.error.signal !== 'SIGTERM') { // SIGKILL and SIGTERM are valid errors
        logger.error(JSON.stringify(error.error, Object.getOwnPropertyNames(error.error)))
        logger.error(`stdout of child process is: ${error.stdout}`)
        return {
          successful: false,
          body: {
            error: error.error.message || error.stdout,
            stack: error.error.stack
          },
          contentType: 'application/json'
        }
      }
    }
    stdout = Buffer.isBuffer(stdout) ? stdout.toString() : stdout
    let result = {successful: true}
    try {
      let response = extractJsonResponse(stdout)
      if (!response.file) {
        result.body = {message: 'The response from the child process is missing the file field, the response was: ' + JSON.stringify(response)}
      } else {
        result.body = await createBody(response.file)
        if (response.log) {
          result.log = response.log
        }
      }
      if (isTestRunUnsuccessful(response)) {
        result.successful = false
        logger.warn(`${JSON.stringify(response)}`)
        logger.warn(result.body)
      }
      return result
    } catch (error) {
      logger.error('Error during Execution of the child process, it is possible, that the process timed out, if you expect a long duration, increase the EXECUTION_TIMEOUT variable. ', {stdout}, {error: error.message})
      return {
        successful: false,
        body: {
          error: error.message || error.stdout,
          stack: error.stack
        },
        contentType: 'application/json'
      }
    }
  }

  /**
   * Wraps the exec method so that it can be used in an async function w/o explicit promise handling
   * @param command
   * @param executionTimeout
   * @return {Promise<any>}
   */
  const executeAsync = (command, executionTimeout) => {
    return new Promise(function (resolve, reject) {
      let processKey = uuidv4()
      logger.debug(`starting process with generated id [${processKey}]`)
      let childProcess = processMaster.exec(command, {timeout: executionTimeout}, (error, stdout) => {
        delete runningExecutions[processKey]
        if (error) {
          logger.debug(`process with id [${processKey}] returned with an error`)
          reject({error, stdout})
        } else {
          logger.debug(`process with id [${processKey}] returned without an error`)
          resolve(stdout)
        }
      })
      childProcess.on('exit', (code, signal) => {
        logger.debug(`process with id [${processKey}] exited with code [${code}] or signal [${signal}]`)
      })
      runningExecutions[processKey] = childProcess
    })
  }

  /**
   * Kills all running child processes, if existent. Does nothing, if no execution is running.
   */
  const abortAllRunningExecutions = () => {
    // We use SIGKILL, since mocha does not handle SIGTERM (default) correctly, see https://github.com/mochajs/mocha/issues/2726
    Object.keys(runningExecutions).forEach(processKey => runningExecutions[processKey].kill('SIGKILL'))
    runningExecutions = {}
  }

  const isTestRunUnsuccessful = (response) => {
    return (response.status !== undefined && response.status !== 200) ||
      (response.successful !== undefined && !response.successful) ||
      (response.status === undefined && response.successful === undefined)
  }

  const extractJsonResponse = (stdout) => {
    let lines = stdout.split ? stdout.split('\n') : []
    let jsonLines = lines.filter(line => line.startsWith('{'))
    if (jsonLines.length === 0) {
      throw new Error('Could not parse response from child process, got stdout:[' + JSON.stringify(stdout) + '].')
    }
    logger.info('Testrun complete, now printing all lines of the stdout of the testrun in loglevel debug. If you' +
      ' want this for debugging purposes, increase the LogLevel of your logger.')
    let result = {}
    for (let jsonLine of jsonLines) {
      logger.debug(jsonLine)
      const lineAsJson = JSON.parse(jsonLine)
      if (lineAsJson.file) {
        result = {...result, ...lineAsJson}
      } else if (lineAsJson.message) {
        if (!result.log) {
          result.log = []
        }
        result.log.push({...lineAsJson})
        logger.log(lineAsJson.level, lineAsJson.message)
      }
    }
    return result
  }


  const createBody = (fileName) => {
    return new Promise((resolve, reject) => {
      // pass a buffer or a path to a xml file
      let body
      try {
        let file = fs.readFileSync(fileName)
        // TODO why do we even parse the xml here? Could just as well be a simple String that is returned later
        xmlReader.readXML(file, function (err, data) {
          if (err) {
            throw new Error('Error accessing results file: ' + JSON.stringify(err))
          }
          body = data.content
          fs.unlinkSync(fileName)
        })
        resolve(body)
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Helper method to build a string that complies with the expected response for this runner,
   * and that can be used on a shell, for example with the echo command
   * @param success If the call was successful
   * @param file the file parameter
   * @return {string} A bash compatible json string (with escaped characters)
   */
  const buildResultString = (success, file) => {
    return JSON.stringify({file: file, successful: success}).replace(/"/g, '\\"')
  }

  return {execute, buildResultString, abortAllRunningExecutions}
}
