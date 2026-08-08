const { info, ok, err } = require('../helpers');

function registerNetwork(program) {
  const netCmd = program.command('network').description('网络工具');

  netCmd
    .command('ip')
    .description('显示本机 IP')
    .action(() => {
      const { getLocalIp } = require('../../network-utils');
      info(`本机 IP: ${getLocalIp()}`);
    });

  netCmd
    .command('delay')
    .description('检测网络延迟')
    .option('-p, --port <port>', '通过代理端口检测（不指定则直连）')
    .action(async (opts) => {
      const { checkDelay } = require('../../network-utils');
      const port = opts.port ? parseInt(opts.port, 10) : undefined;
      try {
        const ms = await checkDelay(port);
        ok(`延迟: ${ms}ms${port ? `（通过端口 ${port}）` : '（直连）'}`);
      } catch (e) {
        err(`检测失败: ${e.message}`);
      }
    });
}

module.exports = {
  registerNetwork,
};
