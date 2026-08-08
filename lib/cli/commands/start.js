const { localW2Path, ok, err, info, debug } = require('../helpers');
const { enableSystemProxy, disableSystemProxy } = require('./proxy');

function registerStart(program) {
  program
    .command('start')
    .description('启动 whistle（自动设置代理和安装证书）')
    .option('--init', '初始化（安装证书 + 设置代理）')
    .action(async (opts) => {
      const { execSync } = require('node:child_process');
      try {
        const args = opts.init ? 'start --init' : 'start';
        execSync(`"${localW2Path}" ${args}`, { stdio: 'inherit' });
        ok('whistle 已启动');

        try {
          enableSystemProxy();
        } catch (e) {
          err(`开启系统代理失败: ${e.message}`);
        }

        const upstream = require('../upstream-proxy');
        const proxies = upstream.loadProxies();
        if (proxies.length > 0) {
          info('同步上游代理规则...');
          try {
            await upstream.syncToWhistle(require('../rule-api'), proxies);
            ok(`已同步 ${proxies.length} 个上游代理规则`);
          } catch (e) {
            err(`上游代理规则同步失败: ${e.message}`);
          }
        }

        const api = require('../rule-api');
        const rules = api.loadOfflineRulesets();
        if (rules.length > 0) {
          info('同步自定义规则...');
          let count = 0;
          for (const r of rules) {
            try {
              await api.addRuleset(r.name, r.content, r.group);
              if (r.enabled) await api.selectRuleset(r.name, r.content);
              count++;
            } catch (e) {
              debug('Rule sync skipped (duplicate):', r.name, e.message);
            }
          }
          if (count > 0) ok(`已同步 ${count} 个自定义规则`);
        }
      } catch (e) {
        err(`启动 whistle 失败: ${e.message}`);
        process.exit(1);
      }
    });
}

function registerStop(program) {
  program
    .command('stop')
    .description('停止 whistle')
    .action(() => {
      const { execSync } = require('node:child_process');
      try {
        try {
          disableSystemProxy();
        } catch (e) {
          err(`关闭系统代理失败: ${e.message}`);
        }
        execSync(`"${localW2Path}" stop`, { stdio: 'inherit' });
        ok('whistle 已停止');
      } catch (e) {
        err(`停止 whistle 失败: ${e.message}`);
        process.exit(1);
      }
    });
}

function registerW2(program) {
  program
    .command('w2')
    .description('直接执行 w2 命令')
    .arguments('[args...]')
    .action((args) => {
      const { execSync } = require('node:child_process');
      try {
        execSync(`"${localW2Path}" ${args.join(' ')}`, { stdio: 'inherit' });
      } catch (e) {
        err(`w2 命令执行失败: ${e.message}`);
        process.exit(1);
      }
    });
}

module.exports = {
  registerStart,
  registerStop,
  registerW2,
};
