const chai = require('chai')
const chaiSubset = require('chai-subset')
chai.use(require('chai-as-promised'))
const should = chai.should()
const expect = chai.expect

chai.use(chaiSubset)

describe('Dummy Tests for integration testing the runner', () => {
  it('should run 1 second', async () => {
    await sleep(1000)
    return true
  })

  it('should run 2 seconds', async () => {
    await sleep(2000)
    return true
  }).timeout(3000)
})

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

