const { getWhistleStatus, info, ok, warn, title, sep } = require('../helpers');

function registerHealth(program) {
  program
    .command('health')
    .description('综合健康检查（whistle + 系统代理 + 证书）')
    .action(async () => {
      const { getLocalIp } = require('../../network-utils');
      const { checkSystemProxy } = require('../../proxy-check');
      const { checkCertStatus } = require('../../cert-check');

      title('健康检查');
      sep();

      // 1. whistle 进程
      const ws = getWhistleStatus();

      if (ws.running) {
        ok(`Whistle 代理: 运行中${ws.port ? ` (端口: ${ws.port})` : ''}`);
      } else {
        warn('Whistle 代理: 未运行');
        info('  运行 easy-proxy start --init 启动');
      }

      // 2. 系统代理
      if (ws.running && ws.port) {
        const proxyOn = await checkSystemProxy(ws.port);
        if (proxyOn) {
          ok('系统代理: 已开启');
        } else {
          warn('系统代理: 未指向 whistle');
          info('  运行 easy-proxy proxy on');
        }
      } else {
        info('系统代理: (whistle 未运行，跳过检查)');
      }

      // 3. 证书
      await checkCertStatus(true);

      // 4. 本机 IP
      info(`本机 IP: ${getLocalIp()}`);

      sep();
      if (!ws.running) {
        process.exit(1);
      }
    });
}

module.exports = {
  registerHealth,
};
