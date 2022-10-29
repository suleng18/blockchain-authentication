const contract1 = artifacts.require('Login');

module.exports = function (deployer) {
  deployer.then(async () => {
    await deployer.deploy(contract1)
  })
}