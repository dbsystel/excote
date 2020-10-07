// eslint-disable-next-line no-console
const consoleLog = (msg, obj1, obj2) => console.log(new Date().toISOString() + ' ' + msg + (obj1 ? JSON.stringify(obj1) : '') + (obj2 ? JSON.stringify(obj2) : ''))
module.exports = {
  info: consoleLog,
  debug: consoleLog,
  warn: consoleLog,
  error: consoleLog,
  log: consoleLog
}
