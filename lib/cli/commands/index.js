const { registerStart, registerStop, registerW2 } = require('./start');
const { registerAccel } = require('./accel');
const { registerHost } = require('./host');
const { registerRule } = require('./rule');
const { registerProxy } = require('./proxy');
const { registerCert } = require('./cert');
const { registerHealth } = require('./health');
const { registerStatus } = require('./status');
const { registerConfig } = require('./config-cmd');
const { registerIntercept } = require('./intercept');
const { registerNetwork } = require('./network');

function registerAllCommands(program) {
  registerStart(program);
  registerStop(program);
  registerW2(program);
  registerAccel(program);
  registerHost(program);
  registerRule(program);
  registerProxy(program);
  registerCert(program);
  registerHealth(program);
  registerStatus(program);
  registerConfig(program);
  registerIntercept(program);
  registerNetwork(program);
}

module.exports = {
  registerAllCommands,
};
