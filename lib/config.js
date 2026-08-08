const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { debug } = require('./debug');

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.easy-proxy');
const CONFIG_FILE = 'config.json';
const CONFIG_PATH = path.join(CONFIG_DIR, CONFIG_FILE);

const defaultRules = require('./plugin/default-rules');

const DEFAULT_CONFIG = {
  enabled: true,
  interceptEnabled: true,
  interceptRules: defaultRules,
  doh: { bootstrapIp: '8.8.8.8', host: 'dns.google', path: '/resolve', port: 443 },
  ipCacheTtl: 600,
  sniRewrite: { enabled: false, defaultSni: null, sniMap: {} },
  hosts: [],
  upstreamProxies: [],
  proxyBypassDomains: null,
};

function ensureDir() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (e) {
    debug('ensureDir failed:', e.message);
  }
}

/**
 * 读取配置文件。文件是唯一数据源，whistle storage 仅做同步备份。
 */
function loadConfig(options) {
  ensureDir();

  let fileConfig = null;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    debug('loadConfig: parse config file failed:', e.message);
    fileConfig = null;
  }

  if (fileConfig) {
    // 有文件 → 同步到 whistle storage（备份）
    try {
      if (options?.storage) {
        options.storage.setProperty('config', JSON.stringify(fileConfig));
      }
    } catch (e) {
      debug('loadConfig: sync to whistle storage failed:', e.message);
    }
    const merged = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), fileConfig);
    const errors = validateConfig(merged);
    if (errors.length > 0) {
      console.warn('配置验证警告:', errors.join(', '));
    }
    return merged;
  }

  // 文件不存在 → 尝试从 whistle storage 恢复
  let stored = null;
  if (options?.storage) {
    try {
      const raw = options.storage.getProperty('config');
      if (raw) stored = JSON.parse(raw);
    } catch (e) {
      debug('loadConfig: read from whistle storage failed:', e.message);
    }
  }

  if (stored) {
    try {
      ensureDir();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(stored, null, 2));
    } catch (e) {
      debug('loadConfig: restore config from whistle storage to file failed:', e.message);
    }
  }

  return deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), stored || {});
}

function saveConfig(options, config) {
  ensureDir();
  const text = JSON.stringify(config, null, 2);
  try {
    if (options?.storage) {
      options.storage.setProperty('config', text);
    }
  } catch (e) {
    debug('saveConfig: sync to whistle storage failed:', e.message);
  }
  try {
    fs.writeFileSync(CONFIG_PATH, text);
  } catch (e) {
    debug('saveConfig: write config file failed:', e.message);
  }
}

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = Object.assign({}, base);
    Object.keys(over || {}).forEach((k) => {
      out[k] = k in out ? deepMerge(out[k], over[k]) : over[k];
    });
    return out;
  }
  return over === undefined ? base : over;
}

function validateConfig(config) {
  const errors = [];

  if (typeof config.enabled !== 'boolean') {
    errors.push('enabled 必须是布尔值');
  }

  if (config.doh) {
    if (typeof config.doh !== 'object') {
      errors.push('doh 必须是对象');
    } else {
      if (config.doh.bootstrapIp && typeof config.doh.bootstrapIp !== 'string') {
        errors.push('doh.bootstrapIp 必须是字符串');
      }
      if (config.doh.host && typeof config.doh.host !== 'string') {
        errors.push('doh.host 必须是字符串');
      }
      if (config.doh.path && typeof config.doh.path !== 'string') {
        errors.push('doh.path 必须是字符串');
      }
      if (config.doh.port && typeof config.doh.port !== 'number') {
        errors.push('doh.port 必须是数字');
      }
    }
  }

  if (config.ipCacheTtl && typeof config.ipCacheTtl !== 'number') {
    errors.push('ipCacheTtl 必须是数字');
  }

  if (config.sniRewrite) {
    if (typeof config.sniRewrite !== 'object') {
      errors.push('sniRewrite 必须是对象');
    } else {
      if (config.sniRewrite.enabled && typeof config.sniRewrite.enabled !== 'boolean') {
        errors.push('sniRewrite.enabled 必须是布尔值');
      }
      if (config.sniRewrite.defaultSni && typeof config.sniRewrite.defaultSni !== 'string') {
        errors.push('sniRewrite.defaultSni 必须是字符串');
      }
      if (config.sniRewrite.sniMap && typeof config.sniRewrite.sniMap !== 'object') {
        errors.push('sniRewrite.sniMap 必须是对象');
      }
    }
  }

  if (config.hosts && !Array.isArray(config.hosts)) {
    errors.push('hosts 必须是数组');
  }

  if (config.upstreamProxies && !Array.isArray(config.upstreamProxies)) {
    errors.push('upstreamProxies 必须是数组');
  }

  if (config.proxyBypassDomains && !Array.isArray(config.proxyBypassDomains)) {
    errors.push('proxyBypassDomains 必须是数组');
  }

  if (config.interceptEnabled !== undefined && typeof config.interceptEnabled !== 'boolean') {
    errors.push('interceptEnabled 必须是布尔值');
  }

  if (config.interceptRules !== undefined && config.interceptRules !== null) {
    if (typeof config.interceptRules !== 'object' || Array.isArray(config.interceptRules)) {
      errors.push('interceptRules 必须是对象');
    }
  }

  return errors;
}

// 从 rules-file.js 重新导出规则集操作
const { listRulesets, getRuleset, saveRuleset, deleteRuleset } = require('./cli/rules-file');

module.exports = {
  DEFAULT_CONFIG,
  CONFIG_PATH,
  loadConfig,
  saveConfig,
  deepMerge,
  validateConfig,
  listRulesets,
  getRuleset,
  saveRuleset,
  deleteRuleset,
};
