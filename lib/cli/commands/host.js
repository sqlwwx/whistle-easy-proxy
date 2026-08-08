const { readConfig, writeConfig, info, ok, err, title, sep } = require('../helpers');

function registerHost(program) {
  const hostCmd = program.command('host').description('Hosts 覆盖管理');

  hostCmd
    .command('list')
    .description('列出所有 Hosts 覆盖')
    .action(() => {
      const cfg = readConfig();
      const hosts = cfg.hosts || [];
      title('Hosts 覆盖');
      sep();
      if (!hosts.length) {
        info('暂无 Hosts 覆盖');
        info('使用: easy-proxy host add <域名> <IP>');
        return;
      }
      hosts.forEach((h, i) => info(`${i + 1}. ${h.pattern} → ${h.ip}`));
      sep();
      info(`共 ${hosts.length} 条`);
    });

  hostCmd
    .command('add <domain> <ip>')
    .description('添加 Hosts 覆盖')
    .action((domain, ip) => {
      const cfg = readConfig();
      if (!cfg.hosts) cfg.hosts = [];
      const idx = cfg.hosts.findIndex((h) => h.pattern === domain);
      if (idx >= 0) {
        cfg.hosts[idx].ip = ip;
        writeConfig(cfg);
        ok(`已更新: ${domain} → ${ip}`);
      } else {
        cfg.hosts.push({ pattern: domain, ip });
        writeConfig(cfg);
        ok(`已添加: ${domain} → ${ip}`);
      }
    });

  hostCmd
    .command('remove <domain>')
    .description('移除 Hosts 覆盖')
    .action((domain) => {
      const cfg = readConfig();
      if (!cfg.hosts?.length) {
        err('暂无 Hosts 覆盖');
        return;
      }
      const idx = cfg.hosts.findIndex((h) => h.pattern === domain);
      if (idx < 0) {
        err(`覆盖不存在: ${domain}`);
        return;
      }
      cfg.hosts.splice(idx, 1);
      writeConfig(cfg);
      ok(`已移除: ${domain}`);
    });

  hostCmd
    .command('clear')
    .description('清除所有 Hosts 覆盖')
    .action(() => {
      const cfg = readConfig();
      if (!cfg.hosts?.length) {
        info('已经为空');
        return;
      }
      const n = cfg.hosts.length;
      cfg.hosts = [];
      writeConfig(cfg);
      ok(`已清除 ${n} 条`);
    });
}

module.exports = {
  registerHost,
};
