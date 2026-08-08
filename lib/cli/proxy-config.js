const { loadConfig, saveConfig } = require('../config');
const { DEFAULT_BYPASS_DOMAINS } = require('./bypass-domains');

function loadProxyConfig() {
  try {
    const config = loadConfig(null);
    return {
      bypassDomains: Array.isArray(config.proxyBypassDomains) ? config.proxyBypassDomains : null,
    };
  } catch (e) {
    console.warn('读取代理配置失败:', e.message);
    return { bypassDomains: null };
  }
}

function saveProxyConfig(proxyConfig) {
  try {
    const config = loadConfig(null);
    config.proxyBypassDomains = proxyConfig.bypassDomains;
    saveConfig(null, config);
  } catch (e) {
    console.warn('保存代理配置失败:', e.message);
  }
}

function getEffectiveBypass() {
  const { bypassDomains } = loadProxyConfig();
  return bypassDomains?.length > 0 ? bypassDomains : DEFAULT_BYPASS_DOMAINS;
}

function getDefaultBypass() {
  return DEFAULT_BYPASS_DOMAINS;
}

module.exports = {
  DEFAULT_BYPASS_DOMAINS,
  loadConfig: loadProxyConfig,
  saveConfig: saveProxyConfig,
  getEffectiveBypass,
  getDefaultBypass,
};
