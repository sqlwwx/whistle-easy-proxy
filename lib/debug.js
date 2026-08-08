/**
 * 简单的 debug 日志工具
 * 通过环境变量 EASY_PROXY_DEBUG=1 开启
 */

const DEBUG_ENABLED = process.env.EASY_PROXY_DEBUG === '1';

function debug(...args) {
  if (DEBUG_ENABLED) {
    console.error('[DEBUG]', ...args);
  }
}

module.exports = {
  debug,
  DEBUG_ENABLED,
};
