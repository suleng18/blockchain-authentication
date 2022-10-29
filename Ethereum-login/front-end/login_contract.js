const Web3 = require('web3');
// const web3 = new Web3(new Web3.providers.WebsocketProvider('wss://kovan.infura.io/ws/v3/de8a23a03991481fb6f88a380a08624e'))
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:7545'));
let globalFn;

const LoginContractJSON = require('../smartcontract/build/contracts/Login.json');
const LoginContract = new web3.eth.Contract(
  LoginContractJSON.abi,
  LoginContractJSON.networks['5777'].address,
);

LoginContract.events.LoginAttempt({}, (err, e) => {
  if (err) {
    console.error(err);
    return;
  }
  if (globalFn) globalFn(e);
});

module.exports = exports = (fn) => void (globalFn = fn);
