const { loadConfig, saveConfig } = require('../config');
const { debug } = require('../debug');

const localW2Path = require.resolve('whistle/bin/whistle.js');

// ---- Config helpers ----
function readConfig() {
  return loadConfig(null);
}
function writeConfig(config) {
  saveConfig(null, config);
}

function ensureSni(config) {
  if (!config.sniRewrite) config.sniRewrite = { enabled: false, defaultSni: null, sniMap: {} };
  if (!config.sniRewrite.sniMap) config.sniRewrite.sniMap = {};
}

// ---- Output helpers ----
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};
const info = (m) => console.log(`${c.blue}ℹ${c.reset}`, m);
const ok = (m) => console.log(`${c.green}✔${c.reset}`, m);
const warn = (m) => console.log(`${c.yellow}⚠${c.reset}`, m);
const err = (m) => console.error(`${c.red}✖${c.reset}`, m);
const title = (m) => console.log(c.bold + c.blue + m + c.reset);
const sep = () => console.log(c.gray + '─'.repeat(40) + c.reset);

// ---- whistle status helper with cache ----
let _statusCache = null;
let _statusTs = 0;

function getWhistleStatus() {
  // 1秒缓存，避免频繁调用 execSync
  if (Date.now() - _statusTs < 1000 && _statusCache) {
    return _statusCache;
  }

  const { execSync } = require('node:child_process');
  try {
    const out = execSync(`"${localW2Path}" status 2>&1`, { encoding: 'utf-8' });
    if (/is running/i.test(out) && !/No running/i.test(out)) {
      let port = null;
      const m1 = out.match(/PORT\((\d+)\)/i);
      if (m1) port = parseInt(m1[1], 10);
      if (!port) {
        const m2 = out.match(/127\.0\.0\.1:(\d+)/);
        if (m2) port = parseInt(m2[1], 10);
      }
      _statusCache = { running: true, port: port };
      _statusTs = Date.now();
      return _statusCache;
    }
  } catch (_e) {
    /* w2 不存在或返回非 0 */
  }
  _statusCache = { running: false, port: null };
  _statusTs = Date.now();
  return _statusCache;
}

function checkWhistleRunning() {
  const ws = getWhistleStatus();
  if (!ws.running) {
    err('whistle 未运行，请先执行 easy-proxy start --init');
    process.exit(1);
  }
}

function warnWhistleNotRunning() {
  const ws = getWhistleStatus();
  if (!ws.running) {
    warn('whistle 未运行，规则仅本地保存，下次启动自动同步');
  }
  return ws.running;
}

// ---- $EDITOR helper ----
function editInEditor(initialContent, name) {
  const fs = require('node:fs');
  const os = require('node:os');
  const { execSync } = require('node:child_process');
  const path = require('node:path');
  const tmpFile = path.join(os.tmpdir(), `easy-proxy-rule-${name}-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, initialContent || '', 'utf-8');
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  try {
    execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
    return fs.readFileSync(tmpFile, 'utf-8');
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {
      debug('Failed to cleanup temp file:', tmpFile, e.message);
    }
  }
}

// ---- confirm helper ----
function promptConfirm(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf-8');
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.trim().toLowerCase() === 'y');
    });
  });
}

module.exports = {
  localW2Path,
  readConfig,
  writeConfig,
  ensureSni,
  c,
  info,
  ok,
  warn,
  err,
  title,
  sep,
  getWhistleStatus,
  checkWhistleRunning,
  warnWhistleNotRunning,
  editInEditor,
  promptConfirm,
  debug,
};
