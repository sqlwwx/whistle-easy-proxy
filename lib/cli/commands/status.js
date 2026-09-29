const { CONFIG_PATH } = require('../../config');
const { readConfig, getWhistleStatus, info, ok, title, sep, c } = require('../helpers');

function registerStatus(program) {
  program
    .command('status')
    .description('查看 EasyProxy 状态')
    .action(() => {
      const cfg = readConfig();
      const ws = getWhistleStatus();
      const interceptOn = cfg.interceptEnabled !== false;
      const ruleCount = cfg.interceptRules ? Object.keys(cfg.interceptRules).length : 0;
      title('EasyProxy 状态');
      sep();
      info(
        'Whistle:         ' +
          (ws.running ? `${c.green}✓ 运行中${c.reset}` : `${c.red}✗ 未运行${c.reset}`) +
          (ws.port ? `（端口: ${ws.port}）` : '')
      );
      info(`加速功能:        ${cfg.enabled ? `${c.green}✓ 已启用` : `${c.red}✗ 已关闭`}${c.reset}`);
      info(
        '拦截规则:        ' +
          (interceptOn ? `${c.green}✓ 已启用` : `${c.red}✗ 已关闭`) +
          c.reset +
          '（' +
          ruleCount +
          ' 个域名）'
      );
      info(
        'SNI 改写:        ' +
          (cfg.sniRewrite?.enabled ? `${c.green}✓ 已启用` : `${c.red}✗ 已关闭`) +
          c.reset
      );
      info(`DoH 服务器:      ${cfg.doh ? cfg.doh.host : 'dns.google'}`);
      info(`Hosts 覆盖:      ${cfg.hosts?.length || 0} 条`);
      info(`配置文件:        ${CONFIG_PATH}`);
      sep();
      info('Web 控制台:      http://local.whistlejs.com/plugin.easy-proxy/');
      info('常用命令:        easy-proxy start --init  （启动 whistle + 代理 + 证书）');
      info('                 easy-proxy intercept list  （查看拦截规则）');
      info('                 easy-proxy proxy on / easy-proxy proxy off  （切换系统代理）');
      info('                 easy-proxy start  （安装证书）');
    });
}

module.exports = {
  registerStatus,
};
