/**
 * 系统代理状态检查模块
 * 检查系统代理是否指向 whistle（127.0.0.1:port）
 *
 * macOS: 通过 scutil --proxy 查询
 * Windows: 通过 reg query 查询注册表
 */

const { exec } = require('node:child_process');
const os = require('node:os');

const IS_MACOS = os.platform() === 'darwin';
const IS_WINDOWS = os.platform() === 'win32';

/**
 * 检查系统代理是否指向指定端口
 * @param {number} port - whistle 端口
 * @returns {Promise<boolean>}
 */
function checkSystemProxy(port) {
  return new Promise((resolve) => {
    if (!IS_MACOS && !IS_WINDOWS) {
      resolve(false);
      return;
    }

    if (IS_MACOS) {
      exec('scutil --proxy', (error, stdout) => {
        if (error || !stdout) {
          resolve(false);
          return;
        }
        var output = stdout.toString();
        // 无网络连接时 scutil 返回空字典
        if (output.trim() === '<dictionary> {\n}') {
          resolve(false);
          return;
        }
        var portStr = `${port}`;
        var httpEnable = /HTTPEnable\s*:\s*1/.test(output);
        var httpPort = new RegExp(`HTTPPort\\s*:\\s*${portStr}`).test(output);
        var httpProxy = /HTTPProxy\s*:\s*127\.0\.0\.1/.test(output);
        var httpsEnable = /HTTPSEnable\s*:\s*1/.test(output);
        var httpsPort = new RegExp(`HTTPSPort\\s*:\\s*${portStr}`).test(output);
        var httpsProxy = /HTTPSProxy\s*:\s*127\.0\.0\.1/.test(output);
        resolve(httpEnable && httpPort && httpProxy && httpsEnable && httpsPort && httpsProxy);
      });
      return;
    }

    // Windows: 通过注册表查询
    var query =
      'reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"';
    exec(query, (error, stdout) => {
      if (error || !stdout) {
        resolve(false);
        return;
      }
      var output = stdout.toString();
      var proxyEnabled = /ProxyEnable\s+REG_DWORD\s+0x1/.test(output);
      var proxyMatch = new RegExp(`ProxyServer\\s+REG_SZ\\s+127\\.0\\.0\\.1:${port}`).test(output);
      resolve(proxyEnabled && proxyMatch);
    });
  });
}

module.exports = { checkSystemProxy };
