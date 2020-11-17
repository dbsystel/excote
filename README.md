# excote

This is a lightweight npm library meant to help **ex**ecute **co**ntinuous **te**sts. These arbitrary tests generate results as either a junit/xml or as a readable html page, together with a meaningful http status code. The status code can be used, to connect an uptime monitoring like icinga to a service, that reports the status of the executed tests (either synchronous or asynchronous).

Executing tests continuously is needed if you want to check a system for defects, that are not triggered by changes you make (like a redeployment). So a good use case is to execute a set of API tests for a RESTful API, to ensure that it is functioning correctly all the time. This makes sense, if you have noticed, that the system itself is unstable and that you need to correct the state of the system once the tests fail. It can also be helpful to monitor availability, not only of a system as a whole, but also including the core functionality.

Executing the tests within a CI/CD Pipeline is of course also a good idea, but not the scope of this library, as you can just use a test runner for that, like mocha in npm.

## Installation

via [npm](https://github.com/npm/npm)

    npm install -S excote

via [yarn](https://classic.yarnpkg.com/en/)

    yarn add excote

## Usage

### Specify the test command

The test command will be executed in a sub shell, so it can be any shell command:

    const command = 'npm test'

While the command is very flexible, there is a contract on the response of the command. It needs to print a json on the stdout, with the following form:
```json
{
  "file" : "<pathToReportFile>",
  "status" : 200
}
```
Alternatively, the command can also return this json:

```json
{
  "file" : "<pathToReportFile>",
  "successful" : true
}
```

This leaves the responsibility of assigning a http response code completely to the library. It will choose 200 for successful results and 500 for unsuccessful results.

execote will delete the file after reading it and will cache the result in memory.

### Synchronous Execution of tests

The simplest version is to use the route, that can be directly served in a node express app:

```javascript
const contentType = 'text/html'
const excote = require('excote')(logger, 60*1000, command, contentType)

app.route('/monitoring').get(excote.synchronousExecutionRoute)
```

With these lines, every time the endpoint `/monitoring` is called, the node script runner will be called. This example is inspired by the newman runner, that will execute a newman test suite and will return the results as a report html (hence the contentType `text/html`). The second parameter of the constructor is the execution timeout. After this period, the process will be killed and an error response will be returned. Make sure to set this high enough, so that you get meaningfull error results if something goes wrong.

### Background Test execution (periodic)

Instead of running a test, whenever a caller wants information about the test results, it is often better to periodically run the tests and present the results of the last test run. This is easily possible using the Asynchronous Test Runner included in this library. A simple example can be as concise as this:

```javascript
const contentType = 'text/html'
const excote = require('excote')(logger, 60*1000, command, contentType)

excote.startAsyncRunner({success: 1000 * 10, error: 1000})
router.get('/results', testExecutor.asynchronousTestResultsRoute)
```

This example will call the command, and depending on it’s success will either wait 10 Seconds if it was successful or 1 second if it was unsuccessful before calling it again.

Anybody that calls the `/results/` endpoint will receive the test results of the last completed test run. If no run was completed, the library will answer with a 200 and a generic message. This is meant to avoid false alarms of monitoring tools after a container restart. The library will immediately start the first test after calling `startAsyncRunner`.

If for any reason you want to stop the background execution of tests, you can call `testExecutor.stop()`, this will deactivate the runner. Currently, there is no way to restart it, so you need to recreate the module.

The reasoning behind two different wait times between tests is, that in the happy case, that the tests are all green, you might want to execute them with a relatively large time gap in between test runs. In case something goes wrong, it is usually a good idea to repeat the test to see, if the test is still red, or if there was a temporary problem. Configuring sensitive values for the timeOptions in conjunction with the notification settings of your monitoring can be a challenge, as you want no false alarms and still want to quickly notice, if something is wrong. These two values should give you the tools to do so.

#### Start/Pause test execution

In some situations it might be necessary to control the periodic execution of tests. For example, if a CI/CD Pipeline performs a redeployment of the system under test, the tests should be paused, in order to avoid interference with the deployment or false positive results. This library offers two endpoints to achieve just that:

You can pause the execution by calling `testExecutor.pauseAsyncRunner(timeout)` Pausing the background execution will do two things:

1.  Cancel all currently running test executions, ignoring any results of these runs.

2.  Stop the periodic running for a period of time (the parameter timeout). This is to make sure, that it cannot be forgotten to resume the running of tests. This time should be long enough to allow all deployments/updates/etc. to complete.

During the pause of the runner, it will return the last result that came from a completed test execution.

If the pipeline task is completed, and the runner should resume periodic testing, it can be resumed by calling `testExecutor.resumeAsyncRunner()`. This will immediately start a new test run.

## Contribute

See [How to contribute](CONTRIBUTING.md) 

## License

excote was released under [Apache-2.0](LICENSE)
