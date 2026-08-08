const { CONFIG_PATH } = require('../../config');
const {
  readConfig,
  writeConfig,
  promptConfirm,
  info,
  ok,
  err,
  warn,
  title,
  sep,
  c,
} = require('../helpers');

function registerIntercept(program) {
  const interceptCmd = program.command('intercept').description('拦截规则管理');

  interceptCmd
    .command('status')
    .description('查看拦截规则状态')
    .action(() => {
      const cfg = readConfig();
      const enabled = cfg.interceptEnabled !== false;
      const rules = cfg.interceptRules || {};
      const hostCount = Object.keys(rules).length;
      let pathCount = 0;
      for (const h of Object.keys(rules)) {
        pathCount += Object.keys(rules[h] || {}).length;
      }
      title('拦截规则状态');
      sep();
      info(`拦截开关:   ${enabled ? `${c.green}✓ 已启用` : `${c.red}✗ 已关闭`}${c.reset}`);
      info(`域名规则数: ${hostCount} 个域名, ${pathCount} 条路径规则`);
      info(`配置文件:   ${CONFIG_PATH}`);
      sep();
      info('使用 easy-proxy intercept list 查看所有规则');
      info('使用 easy-proxy intercept search <关键词> 搜索规则');
    });

  interceptCmd
    .command('enable')
    .description('启用拦截规则')
    .action(() => {
      const cfg = readConfig();
      cfg.interceptEnabled = true;
      writeConfig(cfg);
      ok('拦截规则已启用');
    });

  interceptCmd
    .command('disable')
    .description('关闭拦截规则')
    .action(() => {
      const cfg = readConfig();
      cfg.interceptEnabled = false;
      writeConfig(cfg);
      ok('拦截规则已关闭');
    });

  interceptCmd
    .command('list')
    .description('列出所有拦截规则')
    .option('-d, --domain <domain>', '只显示指定域名的规则')
    .option('--json', '以 JSON 格式输出')
    .action((opts) => {
      const cfg = readConfig();
      const rules = cfg.interceptRules || {};
      const hosts = Object.keys(rules).sort();

      if (opts.json) {
        const result = {};
        for (const host of hosts) {
          if (opts.domain && host !== opts.domain && host.indexOf(opts.domain) < 0) continue;
          result[host] = rules[host];
        }
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      title('拦截规则列表');
      sep();
      let count = 0;
      for (const host of hosts) {
        if (opts.domain && host !== opts.domain && host.indexOf(opts.domain) < 0) continue;
        const pathRules = rules[host];
        console.log(c.bold + c.blue + host + c.reset);
        for (const pathPattern of Object.keys(pathRules)) {
          const actions = pathRules[pathPattern];
          const actionKeys = Object.keys(actions).filter(
            (k) => ['desc', 'remark', 'test'].indexOf(k) < 0
          );
          const desc = actions.desc || '';
          const actionStr =
            actionKeys.length > 0
              ? actionKeys
                  .map((k) => {
                    const v = actions[k];
                    if (typeof v === 'object') return `${k}:{...}`;
                    return `${k}:${v}`;
                  })
                  .join(', ')
              : `${c.gray}(仅文档)${c.reset}`;
          console.log(`  ${c.gray}${pathPattern}${c.reset} → ${actionStr}`);
          if (desc) console.log(`    ${c.gray}${desc}${c.reset}`);
          count++;
        }
        console.log('');
      }
      sep();
      info(`共 ${hosts.length} 个域名, ${count} 条路径规则`);
    });

  interceptCmd
    .command('search <keyword>')
    .description('搜索拦截规则')
    .action((keyword) => {
      const cfg = readConfig();
      const rules = cfg.interceptRules || {};
      const hosts = Object.keys(rules).filter((h) => h.indexOf(keyword) >= 0);
      title(`搜索: "${keyword}"`);
      sep();
      if (hosts.length === 0) {
        info('未找到匹配的规则');
        return;
      }
      for (const host of hosts) {
        const pathRules = rules[host];
        console.log(c.bold + c.blue + host + c.reset);
        for (const pathPattern of Object.keys(pathRules)) {
          const actions = pathRules[pathPattern];
          const actionKeys = Object.keys(actions).filter(
            (k) => ['desc', 'remark', 'test'].indexOf(k) < 0
          );
          const actionStr =
            actionKeys.length > 0
              ? actionKeys
                  .map((k) => {
                    const v = actions[k];
                    if (typeof v === 'object') return `${k}:{...}`;
                    return `${k}:${v}`;
                  })
                  .join(', ')
              : `${c.gray}(仅文档)${c.reset}`;
          console.log(`  ${c.gray}${pathPattern}${c.reset} → ${actionStr}`);
        }
        console.log('');
      }
      sep();
      info(`找到 ${hosts.length} 个匹配域名`);
    });

  interceptCmd
    .command('add <host> <path> <actionJson>')
    .description('添加拦截规则 (actionJson 为 JSON 字符串)')
    .action((host, pathPattern, actionJson) => {
      let actions;
      try {
        actions = JSON.parse(actionJson);
      } catch (e) {
        err(`actionJson 格式错误: ${e.message}`);
        info('示例: easy-proxy intercept add example.com ".*" \'{"sni":"baidu.com"}\'');
        return;
      }
      const cfg = readConfig();
      if (!cfg.interceptRules || typeof cfg.interceptRules !== 'object') {
        cfg.interceptRules = {};
      }
      if (!cfg.interceptRules[host]) {
        cfg.interceptRules[host] = {};
      }
      cfg.interceptRules[host][pathPattern] = actions;
      writeConfig(cfg);
      ok(`已添加规则: ${host} ${pathPattern}`);
      info(`动作: ${JSON.stringify(actions)}`);
    });

  interceptCmd
    .command('remove <host> [path]')
    .description('删除拦截规则 (不指定 path 则删除整个域名)')
    .action((host, pathPattern) => {
      const cfg = readConfig();
      if (!cfg.interceptRules?.[host]) {
        err(`未找到域名: ${host}`);
        return;
      }
      if (pathPattern) {
        if (!cfg.interceptRules[host][pathPattern]) {
          err(`未找到路径规则: ${pathPattern}`);
          return;
        }
        delete cfg.interceptRules[host][pathPattern];
        if (Object.keys(cfg.interceptRules[host]).length === 0) {
          delete cfg.interceptRules[host];
        }
        writeConfig(cfg);
        ok(`已删除: ${host} ${pathPattern}`);
      } else {
        delete cfg.interceptRules[host];
        writeConfig(cfg);
        ok(`已删除域名: ${host}`);
      }
    });

  interceptCmd
    .command('reset')
    .description('重置为默认拦截规则')
    .action(async () => {
      const confirmed = await promptConfirm('重置为默认拦截规则? 这将丢失自定义规则 (y/N) ');
      if (!confirmed) {
        info('已取消');
        return;
      }
      const cfg = readConfig();
      cfg.interceptRules = require('../../plugin/default-rules');
      writeConfig(cfg);
      ok('已重置为默认拦截规则');
    });
}

module.exports = {
  registerIntercept,
};
