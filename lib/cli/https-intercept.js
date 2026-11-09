/**
 * HTTPS 证书拦截（解密）自动白名单。
 *
 * whistle 全局开关 interceptHttpsConnects 决定 CONNECT 是否被 MITM：关闭时 HTTPS
 * 只做隧道转发、不改证书。为了「规则能用、又不去解密无关流量」，这里从已启用的规则
 * 自动推导需要解密的域名：
 *   - 带请求/响应改写规则的 matcher（host / redirect / resHeaders / 插件协议等）→ 解密
 *   - 纯隧道转发协议（proxy:// tunnel:// socks:// pac://）→ 不解密
 * 推导结果写入 whistle 规则集 easy-proxy-https-whitelist，用户不需要手工维护。
 * config.httpsIntercept.whitelist 仅补录「没有规则但想看流量」的域名；
 * enabled=true 时退回全局解密，白名单规则集自动清空。
 */
const { loadConfig } = require('../config');
const { debug } = require('../debug');
const api = require('./rule-api');

const RULESET_NAME = 'easy-proxy-https-whitelist';
const GROUP_NAME = '\rEasyProxy 系统规则';
// 纯隧道/转发协议：这些规则不需要解密，解密只会多一层开销
const TUNNEL_ONLY = /^(proxy|tunnel|socks|pac|upstream):\/\//i;

/**
 * 规则 matcher 可能是「域名+路径」，但解密判定发生在 CONNECT 阶段（只有 host:port），
 * 带路径的 matcher 匹配不上，这里统一收敛成主机部分；正则规则原样保留。
 */
function toHostPattern(matcher) {
  if (matcher[0] === '/') return matcher;
  const host = matcher
    .replace(/^[a-z][\w+.-]*:\/\//i, '') // 去掉 matcher 自带的协议
    .split('/')[0];
  return host || matcher;
}

/**
 * 从规则文本提取需要解密的 matcher（规则行第一个字段）。
 */
function collectMatchers(text) {
  const out = [];
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    // 只有 operator 没有 matcher 的行（如 enable://capture）不参与推导
    if (parts.length < 2) continue;
    const ops = parts.slice(1);
    if (ops.every((op) => TUNNEL_ONLY.test(op))) continue;
    out.push(toHostPattern(parts[0]));
  }
  return out;
}

/**
 * 汇总白名单：已启用规则推导出的域名 + config.httpsIntercept.whitelist 补录。
 */
async function collectWhitelist(conf) {
  const data = await api.listRulesets();
  const texts = (data.list || [])
    .filter((r) => r.selected && r.name !== RULESET_NAME)
    .map((r) => r.data || '');
  if (!data.defaultRulesIsDisabled && data.defaultRules) texts.push(data.defaultRules);
  const hosts = texts.reduce((acc, text) => acc.concat(collectMatchers(text)), []);
  for (const domain of conf.whitelist || []) {
    if (String(domain || '').trim()) hosts.push(String(domain).trim());
  }
  return [...new Set(hosts)];
}

/**
 * 校正全局开关 + 重写白名单规则集。幂等，规则变更后随时可再调。
 */
async function syncHttpsIntercept() {
  const conf = loadConfig(null).httpsIntercept || {};
  const enabled = conf.enabled === true;
  await api.setHttpsIntercept(enabled);

  if (enabled) {
    // 全局已解密，白名单规则集没有意义
    await api.removeRuleset(RULESET_NAME);
    return { enabled: true, hosts: [] };
  }

  const hosts = await collectWhitelist(conf);
  if (hosts.length === 0) {
    await api.removeRuleset(RULESET_NAME);
    return { enabled: false, hosts: [] };
  }

  const content = [
    '# EasyProxy HTTPS 解密白名单（按已启用规则自动生成，请勿手工编辑）',
    ...hosts.map((matcher) => `${matcher} enable://intercept`),
  ].join('\n');
  await api.createGroup(GROUP_NAME);
  await api.addRuleset(RULESET_NAME, content, GROUP_NAME);
  await api.selectRuleset(RULESET_NAME, content);
  return { enabled: false, hosts };
}

/**
 * 规则变更后调用：失败只记录 debug，不打断命令主流程。
 */
async function syncHttpsInterceptQuietly() {
  try {
    return await syncHttpsIntercept();
  } catch (e) {
    debug('syncHttpsIntercept failed:', e.message);
    return null;
  }
}

module.exports = {
  RULESET_NAME,
  collectMatchers,
  syncHttpsIntercept,
  syncHttpsInterceptQuietly,
};
