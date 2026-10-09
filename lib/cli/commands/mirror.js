const { readConfig, writeConfig, c, info, ok, err, title, sep } = require('../helpers');

// 镜像开关状态存在主配置 config.json 的 mirrors 字段: { npm: true, pip: false, ... }
function loadMirrorState() {
  const cfg = readConfig();
  return cfg.mirrors || {};
}

function saveMirrorState(state) {
  const cfg = readConfig();
  cfg.mirrors = state;
  writeConfig(cfg);
}

function registerMirror(program) {
  const mirrorCmd = program.command('mirror').description('开发镜像源加速（npm/pip/go 等，302 重定向到国内镜像）');

  mirrorCmd
    .command('status')
    .description('查看镜像源状态')
    .action(() => {
      const { MIRROR_RULESETS } = require('../mirror-rulesets');
      const state = loadMirrorState();
      title('镜像源加速');
      sep();
      for (const name of Object.keys(MIRROR_RULESETS)) {
        const on = state[name] === true;
        info(`${on ? `${c.green}✓ 开启` : `${c.red}✗ 关闭`}${c.reset}  ${name}`);
      }
      sep();
      info('开关立即同步到 whistle（需 whistle 运行中）');
    });

  mirrorCmd
    .command('list')
    .description('查看镜像规则内容')
    .action(() => {
      const { MIRROR_RULESETS } = require('../mirror-rulesets');
      title('内置镜像规则');
      sep();
      for (const [name, rule] of Object.entries(MIRROR_RULESETS)) {
        info(`${c.bold}${name}${c.reset}`);
        rule
          .split('\n')
          .filter((l) => !l.startsWith('#'))
          .forEach((l) => info(`  ${l}`));
      }
      sep();
    });

  mirrorCmd
    .command('on [name]')
    .description('启用镜像（无参数=全部启用）')
    .action(async (name) => {
      const { MIRROR_RULESETS } = require('../mirror-rulesets');
      if (name && !MIRROR_RULESETS[name]) {
        err(`未知镜像: ${name}（可用: ${Object.keys(MIRROR_RULESETS).join(', ')}）`);
        return;
      }
      const state = loadMirrorState();
      if (name) state[name] = true;
      else for (const k of Object.keys(MIRROR_RULESETS)) state[k] = true;
      saveMirrorState(state);

      const { syncMirrors } = require('../mirror-sync');
      try {
        await syncMirrors();
        ok(name ? `镜像 ${name} 已开启` : '所有镜像已开启');
      } catch (e) {
        info('whistle 未运行，配置已保存，下次 start 自动生效');
      }
    });

  mirrorCmd
    .command('off [name]')
    .description('关闭镜像（无参数=全部关闭）')
    .action(async (name) => {
      const { MIRROR_RULESETS } = require('../mirror-rulesets');
      if (name && !MIRROR_RULESETS[name]) {
        err(`未知镜像: ${name}（可用: ${Object.keys(MIRROR_RULESETS).join(', ')}）`);
        return;
      }
      const state = loadMirrorState();
      if (name) delete state[name];
      else for (const k of Object.keys(MIRROR_RULESETS)) delete state[k];
      saveMirrorState(state);

      const { syncMirrors } = require('../mirror-sync');
      try {
        await syncMirrors();
        ok(name ? `镜像 ${name} 已关闭` : '所有镜像已关闭');
      } catch (_e) {
        info('whistle 未运行，配置已保存，下次 start 自动生效');
      }
    });
}

module.exports = {
  registerMirror,
  loadMirrorState,
};
