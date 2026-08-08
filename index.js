const { loadConfig } = require('./lib/config');
const resolver = require('./lib/plugin/resolver');
const ui = require('./lib/plugin/ui');
const sni = require('./lib/plugin/sni-agent');
const ruleEngine = require('./lib/plugin/rule-engine');
const ruleActions = require('./lib/plugin/rule-actions');

function extractHost(fullUrl) {
  if (!fullUrl) return null;
  try {
    let u = fullUrl;
    if (!/^https?:\/\//i.test(u)) u = `http://${u.replace(/^\/\//, '')}`;
    const url = new URL(u);
    return url.hostname;
  } catch (_e) {
    const m = /(?:https?:\/\/)?([^/:]+)/i.exec(fullUrl);
    return m ? m[1] : null;
  }
}

async function handleProxy(req, client, next, _options, config) {
  const oreq = req.originalReq || {};
  const fullUrl = oreq.fullUrl || oreq.url || req.url || '';
  const host = extractHost(fullUrl);
  if (!host) return next();

  const path = ruleEngine.extractPath(fullUrl);

  // 1. 拦截规则（高优先级）
  if (config.interceptEnabled !== false) {
    const rules = config.interceptRules || require('./lib/plugin/default-rules');
    const matched = ruleEngine.matchRules(host, path, rules);
    if (matched) {
      const ctx = { host: host, path: path, config: config, resolver: resolver, sni: sni };
      try {
        await ruleActions.applyActions(req, client, next, matched, ctx);
      } catch (_e) {
        // 动作执行失败，放行
        if (typeof next === 'function') return next();
      }
      return;
    }
  }

  // 2. GitHub 加速：DoH 解析真实 IP，绕过 DNS 污染
  if (!config.enabled) return next();
  if (!ui.isTarget(host)) return next();

  const ip = resolver.resolve(host);
  if (!ip) return next();

  // 可选：SNI 改写模式，直连真实 IP，改写 ClientHello SNI
  if (config.sniRewrite?.enabled) {
    const sniVal = config.sniRewrite.sniMap?.[host] || config.sniRewrite.defaultSni || host;
    return sni.forward(req, { domain: host, ip, port: 443, servername: sniVal });
  }

  // 默认：whistle host:// 映射（推荐方式）
  req.setReqRules(`${host} host://${ip}`);
  req.passThrough();
}

// === Whistle plugin exports ===

// UI server hook: management dashboard + REST API
exports.uiServer = (server, options) => {
  const config = loadConfig(options);
  resolver.setConfig(config);

  server.on('request', (req, client) => {
    try {
      handleUi(req, client, options, config);
    } catch (_e) {
      client.statusCode = 500;
      client.end('Internal Server Error');
    }
  });
};

function isUiRequest(req) {
  const oreq = req.originalReq || {};
  if (oreq.isUIRequest) return true;
  const url = req.url || '';
  return url.startsWith('/plugin.') || url.startsWith('/api/') || url === '/' || url === '';
}

function handleUi(req, client, options, config) {
  const url = (req.url || '/').split('?')[0];
  if (url.startsWith('/api/')) {
    return ui.handleApi(req, client, options, config);
  }
  client.statusCode = 200;
  client.setHeader('content-type', 'text/html; charset=utf-8');
  client.end(ui.renderDashboard(config));
}

// 使用 init hook 而不是 server hook，避免 whistle 的隧道处理干扰
// 这是关键修复：exports.server 会导致 whistle 的 HTTPS 隧道代理规则（如 proxy://）失效
// 而 exports.init 有相同的参数和功能，但不会干扰 HTTPS 代理
exports.init = (server, options) => {
  const config = loadConfig(options);
  resolver.setConfig(config);

  server.on('request', (req, client, next) => {
    try {
      if (isUiRequest(req)) return handleUi(req, client, options, config);
    } catch (_e) {
      /* fall through */
    }
    handleProxy(req, client, next, options, config).catch(() => {
      if (typeof next === 'function') return next();
    });
  });

  server.on('upgrade', (_req, _client, next) => {
    if (typeof next === 'function') next();
  });
};

// Expose for CLI usage
exports.extractHost = extractHost;
exports.config = { loadConfig, saveConfig: require('./lib/config').saveConfig };
exports.resolver = resolver;
exports.ruleEngine = ruleEngine;
exports.ruleActions = ruleActions;
