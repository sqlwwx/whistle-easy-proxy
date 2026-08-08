const _fs = require('node:fs');
const _path = require('node:path');

const { loadConfig, saveConfig } = require('../config');

const RULESET_NAME = 'upstream-proxies';

function loadProxies() {
  try {
    const config = loadConfig(null);
    return Array.isArray(config.upstreamProxies) ? config.upstreamProxies : [];
  } catch (e) {
    console.warn('读取上游代理配置失败:', e.message);
    return [];
  }
}

function saveProxies(proxies) {
  try {
    const config = loadConfig(null);
    config.upstreamProxies = proxies;
    saveConfig(null, config);
  } catch (e) {
    console.warn('保存上游代理配置失败:', e.message);
  }
}

/**
 * 将代理 URL 转换为 whistle 代理格式
 * 使用 proxy:// 协议格式，支持 HTTP 和 HTTPS CONNECT 隧道
 */
function toProxyProtocol(url) {
  return url.replace(/^https?:\/\//, 'proxy://');
}

/**
 * 根据配置生成 whistle 规则文本
 */
function generateRules(proxies) {
  const lines = ['# EasyProxy 上游代理规则（自动生成，请勿手动编辑）'];
  let hasRules = false;
  proxies.forEach((proxy) => {
    const proxyUrl = toProxyProtocol(proxy.url);
    proxy.domains.forEach((domain) => {
      lines.push(`${domain} ${proxyUrl}`);
      hasRules = true;
    });
  });
  if (!hasRules) {
    lines.push('# (暂无规则 — 使用 easy-proxy proxy upstream edit 添加)');
  }
  return lines.join('\n');
}

/**
 * 同步上游代理规则到 whistle
 * 需要 whistle 运行中，通过 rule-api 写入规则集到系统规则分组
 */
async function syncToWhistle(ruleApi, proxies) {
  const list = proxies || loadProxies();
  const rules = generateRules(list);
  await ruleApi.createGroup(ruleApi.SYSTEM_GROUP);
  await ruleApi.addRuleset(RULESET_NAME, rules, ruleApi.SYSTEM_GROUP);
  await ruleApi.selectRuleset(RULESET_NAME, rules);
}

module.exports = {
  RULESET_NAME,
  loadProxies,
  saveProxies,
  toProxyProtocol,
  generateRules,
  syncToWhistle,
};
