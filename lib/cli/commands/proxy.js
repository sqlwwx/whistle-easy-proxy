const {
  localW2Path,
  getWhistleStatus,
  info,
  ok,
  warn,
  err,
  title,
  sep,
  c,
  editInEditor,
} = require('../helpers');

function enableSystemProxy() {
  const { execSync } = require('node:child_process');
  const proxyConfig = require('../proxy-config');
  const bypass = proxyConfig.getEffectiveBypass();
  const bypassArg = bypass.join(', ');
  info(`开启系统代理（bypass: ${bypass.length} 个域名）...`);
  execSync(`"${localW2Path}" proxy -x "${bypassArg}"`, { stdio: 'inherit' });
  ok('系统代理已开启');
}

function disableSystemProxy() {
  const { execSync } = require('node:child_process');
  execSync(`"${localW2Path}" proxy 0`, { stdio: 'inherit' });
  ok('系统代理已关闭');
}

// ---- 尝试同步上游代理规则到 whistle（静默失败） ----
async function trySyncUpstream(upstream, proxies) {
  try {
    const ruleApi = require('../rule-api');
    await upstream.syncToWhistle(ruleApi, proxies);
    info(`已同步上游代理规则到 whistle 规则集 "${upstream.RULESET_NAME}"`);
  } catch (_e) {
    // whistle 未运行时静默跳过，下次 start 后可手动 sync
    info(
      c.gray +
        '(whistle 未运行，规则未同步 — 启动后可用 easy-proxy proxy upstream sync 同步)' +
        c.reset
    );
  }
}

function registerProxy(program) {
  const proxyCmd = program.command('proxy').description('系统代理管理');

  // proxy on — 开启系统代理（调用 w2 proxy，自动带上 bypass 列表）
  proxyCmd
    .command('on')
    .description('开启系统代理（自动带上 bypass 域名）')
    .action(async () => {
      try {
        enableSystemProxy();
      } catch (e) {
        err(`开启系统代理失败: ${e.message}`);
        info('请确保 whistle 已运行: easy-proxy start --init');
        process.exit(1);
      }
    });

  // proxy off — 关闭系统代理
  proxyCmd
    .command('off')
    .description('关闭系统代理')
    .action(() => {
      try {
        disableSystemProxy();
      } catch (e) {
        err(`关闭系统代理失败: ${e.message}`);
        process.exit(1);
      }
    });

  // proxy status — 检查系统代理是否指向 whistle
  proxyCmd
    .command('status')
    .description('检查系统代理状态')
    .action(async () => {
      const { getLocalIp } = require('../../network-utils');
      info(`本机 IP: ${getLocalIp()}`);
      // 检查 whistle 是否运行
      const ws = getWhistleStatus();
      if (!ws.running) {
        warn('whistle 代理未运行');
        info('运行 easy-proxy start --init 启动代理');
        return;
      }
      if (ws.port) info(`whistle 端口: ${ws.port}`);
      // 检查系统代理
      const { checkSystemProxy } = require('../../proxy-check');
      const proxyOn = await checkSystemProxy(ws.port);
      if (proxyOn) {
        ok('系统代理: 已开启（指向 whistle）');
      } else {
        warn('系统代理: 未指向 whistle');
        info('运行 easy-proxy proxy on 开启系统代理');
      }
    });

  // ---- proxy upstream ----
  const upstreamCmd = proxyCmd.command('upstream').description('上游代理管理');

  upstreamCmd
    .command('edit')
    .description('编辑上游代理配置（打开 $EDITOR）')
    .action(async () => {
      const upstream = require('../upstream-proxy');
      const { parse, buildEditContent } = require('../upstream-editor');
      const oldProxies = upstream.loadProxies();
      let content = buildEditContent(oldProxies);

      let newProxies;
      while (true) {
        let editedText;
        try {
          editedText = editInEditor(content, 'upstream');
        } catch (_e) {
          // 编辑器非零退出码（如 vi :q!）视为用户取消
          info('已取消');
          return;
        }
        try {
          newProxies = parse(editedText);
          break;
        } catch (e) {
          err(e.message);
          warn('解析失败，请修正后重新保存...');
          content = editedText;
        }
      }

      if (JSON.stringify(oldProxies) === JSON.stringify(newProxies)) {
        info('无改动');
        return;
      }

      upstream.saveProxies(newProxies);
      await trySyncUpstream(upstream, newProxies);
      ok('上游代理配置已更新');
    });

  upstreamCmd
    .command('status')
    .description('查看上游代理配置')
    .action(() => {
      const upstream = require('../upstream-proxy');
      const proxies = upstream.loadProxies();
      title('上游代理配置');
      sep();
      if (proxies.length === 0) {
        info('未配置代理');
      } else {
        proxies.forEach((p) => {
          const state = p.disabled ? `${c.yellow}（已停用）${c.reset}` : '';
          const addr = p.disabled ? `# ${p.url}` : p.url;
          info(`${p.name}: ${addr} ${state}`);
          if (p.disabledUrls && p.disabledUrls.length > 0) {
            p.disabledUrls.forEach((u) => {
              info(`  # ${u}`);
            });
          }
          if (p.domains.length > 0) {
            p.domains.forEach((d) => {
              info(`  ${d}`);
            });
          } else {
            info('  (无域名)');
          }
        });
      }
      info('默认: 直连');
      sep();
      info(`规则集名: ${upstream.RULESET_NAME}`);
    });

  // proxy upstream sync — 手动同步规则到 whistle
  upstreamCmd
    .command('sync')
    .description('手动同步上游代理规则到 whistle')
    .action(async () => {
      const upstream = require('../upstream-proxy');
      const proxies = upstream.loadProxies();
      try {
        const ruleApi = require('../rule-api');
        await upstream.syncToWhistle(ruleApi, proxies);
        ok(`已同步 ${proxies.length} 个上游代理规则到 whistle`);
      } catch (e) {
        err(`同步失败: ${e.message}`);
        info('请确保 whistle 已运行: easy-proxy start --init');
        process.exit(1);
      }
    });

  // ---- proxy bypass ----
  const bypassCmd = proxyCmd.command('bypass').description('管理跳过代理的域名');

  bypassCmd
    .command('show')
    .description('查看当前跳过列表')
    .action(() => {
      const proxyConfig = require('../proxy-config');
      const config = proxyConfig.loadConfig();
      const domains = config.bypassDomains || proxyConfig.getDefaultBypass();
      title('跳过代理的域名');
      sep();
      if (domains.length === 0) {
        info('(空)');
      } else {
        domains.forEach((d) => {
          info(`  ${d}`);
        });
      }
      if (!config.bypassDomains) {
        info(`${c.gray}(使用默认列表)${c.reset}`);
      }
      sep();
    });

  bypassCmd
    .command('set <domains>')
    .description('设置跳过列表（逗号分隔，如: 127.0.0.1,localhost,*.local）')
    .action((domains) => {
      const proxyConfig = require('../proxy-config');
      const list = domains
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      if (list.length === 0) {
        err('请提供至少一个域名');
        return;
      }
      proxyConfig.saveConfig({ bypassDomains: list });
      ok(`已设置跳过列表: ${list.join(', ')}`);
      info('重新开启系统代理后生效: easy-proxy proxy on');
    });

  bypassCmd
    .command('add <domain>')
    .description('添加一个跳过域名')
    .action((domain) => {
      const proxyConfig = require('../proxy-config');
      const config = proxyConfig.loadConfig();
      const list = config.bypassDomains
        ? config.bypassDomains.slice()
        : proxyConfig.getDefaultBypass().slice();
      if (list.indexOf(domain) >= 0) {
        warn(`已存在: ${domain}`);
        return;
      }
      list.push(domain);
      proxyConfig.saveConfig({ bypassDomains: list });
      ok(`已添加: ${domain}`);
      info('重新开启系统代理后生效: easy-proxy proxy on');
    });

  bypassCmd
    .command('remove <domain>')
    .description('移除一个跳过域名')
    .action((domain) => {
      const proxyConfig = require('../proxy-config');
      const config = proxyConfig.loadConfig();
      if (!config.bypassDomains) {
        warn('未自定义跳过列表，当前使用默认列表');
        return;
      }
      const index = config.bypassDomains.indexOf(domain);
      if (index < 0) {
        warn(`未找到: ${domain}`);
        return;
      }
      config.bypassDomains.splice(index, 1);
      proxyConfig.saveConfig({ bypassDomains: config.bypassDomains });
      ok(`已移除: ${domain}`);
      info('重新开启系统代理后生效: easy-proxy proxy on');
    });

  bypassCmd
    .command('reset')
    .description('重置为默认跳过列表')
    .action(() => {
      const proxyConfig = require('../proxy-config');
      proxyConfig.saveConfig({ bypassDomains: null });
      ok('已重置为默认列表');
      proxyConfig.getDefaultBypass().forEach((d) => {
        info(`  ${d}`);
      });
      info('重新开启系统代理后生效: easy-proxy proxy on');
    });
}

module.exports = {
  registerProxy,
  enableSystemProxy,
  disableSystemProxy,
};
