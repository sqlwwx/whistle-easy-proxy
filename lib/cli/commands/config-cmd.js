const { CONFIG_PATH } = require('../../config');
const { readConfig, info, ok, warn, err, title, sep } = require('../helpers');

function registerConfig(program) {
  const configCmd = program.command('config').description('配置管理');

  configCmd
    .command('show')
    .description('显示当前配置')
    .action(() => {
      const cfg = readConfig();
      title('当前配置');
      sep();
      console.log(JSON.stringify(cfg, null, 2));
      sep();
      info(`配置文件: ${CONFIG_PATH}`);
    });

  configCmd
    .command('path')
    .description('显示配置文件路径')
    .action(() => {
      info(`配置文件: ${CONFIG_PATH}`);
    });

  configCmd
    .command('edit')
    .description('编辑配置文件（打开 $EDITOR）')
    .action(() => {
      const fs = require('node:fs');
      const { execSync } = require('node:child_process');
      const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
      try {
        execSync(`${editor} "${CONFIG_PATH}"`, { stdio: 'inherit' });
        // 验证配置
        try {
          JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
          ok('配置文件已更新');
        } catch (e) {
          warn(`配置文件格式错误: ${e.message}`);
        }
      } catch (e) {
        err(`编辑配置失败: ${e.message}`);
      }
    });
}

module.exports = {
  registerConfig,
};
