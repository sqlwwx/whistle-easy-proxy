const { localW2Path, ok, err, info } = require('../helpers');

function registerCert(program) {
  const certCmd = program.command('cert').description('证书管理');

  certCmd
    .command('install')
    .description('安装根证书（调用 w2 ca）')
    .option('-f, --force', '强制重新生成证书')
    .action((opts) => {
      const { execSync } = require('node:child_process');
      try {
        if (opts.force) {
          info('强制重新生成证书...');
        }
        execSync(`"${localW2Path}" ca`, { stdio: 'inherit' });
        ok('证书安装完成');
      } catch (e) {
        err(`证书安装失败: ${e.message}`);
        process.exit(1);
      }
    });

  certCmd
    .command('check')
    .description('检查证书安装状态和有效期')
    .action(async () => {
      const { checkCertStatus } = require('../../cert-check');
      await checkCertStatus();
    });
}

module.exports = {
  registerCert,
};
