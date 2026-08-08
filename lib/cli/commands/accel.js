const { readConfig, writeConfig, ensureSni, c, info, ok, err, title, sep } = require('../helpers');

function registerAccel(program) {
  const accelCmd = program.command('accel').description('GitHub 加速管理');

  accelCmd
    .command('on')
    .description('启用加速')
    .action(() => {
      const cfg = readConfig();
      cfg.enabled = true;
      writeConfig(cfg);
      ok('加速已启用');
    });

  accelCmd
    .command('off')
    .description('关闭加速')
    .action(() => {
      const cfg = readConfig();
      cfg.enabled = false;
      writeConfig(cfg);
      ok('加速已关闭');
    });

  accelCmd
    .command('dns')
    .description('刷新 DNS 缓存')
    .action(async () => {
      info('正在刷新 DNS 缓存...');
      try {
        const { getOptions } = require('../rule-api');
        const opts = getOptions();
        const http = require('node:http');
        await new Promise((resolve, reject) => {
          const headers = {};
          if (opts.auth) headers.Authorization = opts.auth;
          headers['Content-Type'] = 'application/json';
          const req = http.request(
            {
              hostname: opts.host,
              port: opts.port,
              path: '/plugin.easy-proxy/api/refresh',
              method: 'POST',
              headers,
            },
            (res) => {
              let data = '';
              res.on('data', (c) => (data += c));
              res.on('end', () => {
                if (res.statusCode === 200) resolve(data);
                else reject(new Error(`HTTP ${res.statusCode}`));
              });
            }
          );
          req.on('error', () => reject(new Error('无法连接 whistle')));
          req.write('{}');
          req.end();
        });
        ok('DNS 缓存已刷新');
      } catch (_e) {
        info('whistle 未运行，已跳过运行时缓存刷新（配置文件不受影响）');
        ok('完成');
      }
    });

  accelCmd
    .command('status')
    .description('查看加速状态')
    .action(() => {
      const cfg = readConfig();
      title('加速状态');
      sep();
      info(
        '加速功能:         ' +
          (cfg.enabled ? `${c.green}✓ 已启用` : `${c.red}✗ 已关闭`) +
          c.reset
      );
      info(
        'SNI 改写:         ' +
          (cfg.sniRewrite?.enabled ? `${c.green}✓ 已启用` : `${c.red}✗ 已关闭`) +
          c.reset
      );
      info(`DoH 服务器:       ${cfg.doh ? cfg.doh.host : 'dns.google'}`);
      if (cfg.hosts?.length) info(`Hosts 覆盖:       ${cfg.hosts.length} 条`);
      sep();
    });

  const sniCmd = accelCmd.command('sni').description('SNI 改写管理');

  sniCmd
    .command('on')
    .description('启用 SNI 改写')
    .action(() => {
      const cfg = readConfig();
      ensureSni(cfg);
      cfg.sniRewrite.enabled = true;
      writeConfig(cfg);
      ok('SNI 改写已启用');
    });

  sniCmd
    .command('off')
    .description('关闭 SNI 改写')
    .action(() => {
      const cfg = readConfig();
      ensureSni(cfg);
      cfg.sniRewrite.enabled = false;
      writeConfig(cfg);
      ok('SNI 改写已关闭');
    });

  sniCmd
    .command('status')
    .description('查看 SNI 改写状态')
    .action(() => {
      const cfg = readConfig();
      const s = cfg.sniRewrite;
      if (s?.enabled) ok('SNI 改写: 已启用');
      else info('SNI 改写: 已关闭');
    });

  sniCmd
    .command('config')
    .description('查看 SNI 改写配置')
    .action(() => {
      const cfg = readConfig();
      const s = cfg.sniRewrite || {};
      title('SNI 改写配置');
      sep();
      info(`启用状态:    ${s.enabled ? `${c.green}✓` : `${c.red}✗`}${c.reset}`);
      info(`默认 SNI:    ${s.defaultSni || '<无>'}`);
      const sm = s.sniMap || {};
      const entries = Object.entries(sm);
      if (entries.length) {
        info('SNI 映射:');
        entries.forEach(([k, v]) => info(`  ${k} → ${v}`));
      } else {
        info('SNI 映射: <无>');
      }
      sep();
    });

  sniCmd
    .command('set-default <domain>')
    .description('设置默认 SNI 域名')
    .action((domain) => {
      const cfg = readConfig();
      ensureSni(cfg);
      cfg.sniRewrite.defaultSni = domain;
      writeConfig(cfg);
      ok(`默认 SNI 已设置为: ${domain}`);
    });

  sniCmd
    .command('add-map <from> <to>')
    .description('添加 SNI 映射')
    .action((from, to) => {
      const cfg = readConfig();
      ensureSni(cfg);
      cfg.sniRewrite.sniMap[from] = to;
      writeConfig(cfg);
      ok(`SNI 映射已添加: ${from} → ${to}`);
    });

  sniCmd
    .command('remove-map <from>')
    .description('移除 SNI 映射')
    .action((from) => {
      const cfg = readConfig();
      ensureSni(cfg);
      if (cfg.sniRewrite.sniMap[from]) {
        delete cfg.sniRewrite.sniMap[from];
        writeConfig(cfg);
        ok(`SNI 映射已移除: ${from}`);
      } else {
        err(`映射不存在: ${from}`);
      }
    });
}

module.exports = {
  registerAccel,
};
