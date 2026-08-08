/**
 * 拦截规则动作执行器
 *
 * 根据匹配到的动作集合，执行对应的拦截行为：
 *   abort / success / redirect → 直接返回响应
 *   sni                        → 解析 IP + SNI 改写直连
 *   proxy                      → host 映射（whistle host://）
 *   requestReplace             → 请求头修改
 *   responseReplace            → 响应头修改
 *   cacheDays                  → 响应缓存（TTL 轮转 key）
 *   tampermonkeyScript/script  → HTML 注入脚本
 *   status                     → HTTP 状态码
 *   proxy_backup               → 备用代理（模板变量替换）
 */

const dns = require('node:dns');
const sniAgent = require('./sni-agent');

// ---- 系统 DNS 解析（非 GitHub 域名兜底） ----

function resolveSystemDns(host) {
  return new Promise((resolve) => {
    dns.resolve4(host, (err, addresses) => {
      if (err || !addresses || !addresses.length) resolve(null);
      else resolve(addresses[0]);
    });
  });
}

// ---- 请求头 / 响应头处理 ----

/**
 * 将 headers 对象中的特殊值标准化。
 * "[remove]" → 空字符串（whistle 中空值表示删除头）
 */
function normalizeHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const key of Object.keys(headers)) {
    const val = headers[key];
    if (val === '[remove]') {
      out[key] = '';
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * 直接修改 whistle req 的请求头（用于 SNI forward 前的请求头篡改）
 */
function applyRequestHeadersToReq(req, headers) {
  const normalized = normalizeHeaders(headers);
  for (const key of Object.keys(normalized)) {
    const lower = key.toLowerCase();
    if (normalized[key] === '') {
      delete req.headers[lower];
    } else {
      req.headers[lower] = normalized[key];
    }
  }
}

/**
 * 修改上游响应头（用于 SNI forward 后的响应头篡改）
 */
function applyResponseHeadersToRes(res, headers) {
  const normalized = normalizeHeaders(headers);
  if (!res?.headers) return;
  for (const key of Object.keys(normalized)) {
    const lower = key.toLowerCase();
    if (normalized[key] === '') {
      delete res.headers[lower];
    } else {
      res.headers[lower] = normalized[key];
    }
  }
}

// ---- 构建 whistle 原生规则 ----

/**
 * 将动作集合转为 whistle 原生规则文本行数组。
 * 用于 proxy / 纯 header 修改 / cache / script 注入等场景。
 */
function buildWhistleRules(actions, host, _groups) {
  const rules = [];

  // 请求头修改
  if (actions.requestReplace?.headers) {
    const headers = normalizeHeaders(actions.requestReplace.headers);
    if (Object.keys(headers).length > 0) {
      rules.push(`reqHeaders://${JSON.stringify(headers)}`);
    }
  }

  // 响应头修改
  if (actions.responseReplace) {
    const respHeaders = {};
    if (actions.responseReplace.headers) {
      Object.assign(respHeaders, normalizeHeaders(actions.responseReplace.headers));
    }
    if (actions.responseReplace.doDownload) {
      respHeaders['content-disposition'] = 'attachment';
    }
    if (Object.keys(respHeaders).length > 0) {
      rules.push(`resHeaders://${JSON.stringify(respHeaders)}`);
    }
  }

  // 缓存 (TTL 轮转 key: 每 cacheDays 天换一个 key)
  if (actions.cacheDays && actions.cacheDays > 0) {
    const period = Math.floor(Date.now() / (actions.cacheDays * 86400000));
    rules.push(`cache://${host}_${period}`);
  }

  // 状态码
  if (actions.status) {
    rules.push(`status://${actions.status}`);
  }

  // 脚本注入
  const scripts = [];
  if (actions.tampermonkeyScript) scripts.push(actions.tampermonkeyScript);
  if (actions.script) scripts.push(actions.script);
  if (scripts.length > 0) {
    const html = scripts.map((s) => `<script src="${s}"></script>`).join('');
    // whistle resAppend:// 内联内容用 base64 编码
    rules.push(`resAppend://${Buffer.from(html).toString('base64')}`);
  }

  return rules;
}

// ---- 动作处理器 ----

/**
 * 主入口：根据匹配结果执行动作。
 *
 * @param {object} req       whistle PluginServerRequest
 * @param {object} client    whistle ServerResponse
 * @param {function} next    pass-through 回调
 * @param {object} matched   matchRules 返回值 { actions, groups, matches }
 * @param {object} ctx       { host, path, config, resolver }
 * @returns {Promise|undefined}
 */
async function applyActions(req, client, next, matched, ctx) {
  const actions = matched.actions || {};
  const groups = matched.groups || null;
  const host = ctx.host;

  // --- 1. abort（中断请求）---
  if (actions.abort === true) {
    client.statusCode = actions.status || 204;
    client.end();
    return;
  }

  // --- 2. success（直接返回成功响应）---
  if (actions.success !== undefined) {
    handleSuccess(client, actions);
    return;
  }

  // --- 3. redirect（重定向）---
  if (actions.redirect) {
    client.statusCode = 302;
    client.setHeader('location', actions.redirect);
    client.end();
    return;
  }

  // --- 4. sni（SNI 改写直连）---
  if (actions.sni !== undefined) {
    return await handleSni(req, client, next, actions, groups, ctx);
  }

  // --- 5. proxy（host 映射）---
  if (actions.proxy) {
    return handleProxyAction(req, client, next, actions, host, groups);
  }

  // --- 6. 其他动作（纯 header / cache / script，走 whistle 原生规则）---
  const rules = buildWhistleRules(actions, host, groups);
  if (rules.length > 0) {
    req.setReqRules(rules.join('\n'));
  }
  req.passThrough();
}

// ---- success 处理器 ----

function handleSuccess(client, actions) {
  const success = actions.success;
  let body = '';
  let contentType = 'text/plain; charset=utf-8';

  if (success === true) {
    // 简单成功
    body = '';
  } else if (typeof success === 'object') {
    if (success.script) {
      body = success.script;
      contentType = 'application/javascript; charset=utf-8';
    } else if (success.body) {
      body = success.body;
    }
  } else if (typeof success === 'string') {
    body = success;
  }

  client.statusCode = actions.status || 200;
  client.setHeader('content-type', contentType);
  client.setHeader('content-length', Buffer.byteLength(body));
  client.end(body);
}

// ---- SNI 处理器 ----

async function handleSni(req, _client, next, actions, groups, ctx) {
  const host = ctx.host;
  const sniValue = actions.sni;

  // sni: "none" → 不改写 SNI，仅做直连（或配合其他动作走 whistle 规则）
  if (sniValue === 'none') {
    const otherActions = Object.assign({}, actions);
    delete otherActions.sni;
    const rules = buildWhistleRules(otherActions, host, groups);
    if (rules.length > 0) {
      req.setReqRules(rules.join('\n'));
    }
    req.passThrough();
    return;
  }

  // 解析 IP: 先用已有 resolver（GitHub 域名有缓存/curated），再 DoH，最后系统 DNS
  let ip = null;
  if (ctx.resolver && typeof ctx.resolver.resolve === 'function') {
    ip = ctx.resolver.resolve(host);
  }
  if (!ip && ctx.resolver && typeof ctx.resolver.dohResolve === 'function') {
    try {
      const ips = await ctx.resolver.dohResolve(host);
      if (ips?.length) {
        ip = ips[0];
        // 缓存结果
        if (typeof ctx.resolver.cacheDohResult === 'function') {
          ctx.resolver.cacheDohResult(host, ips);
        }
      }
    } catch (_e) {
      /* DoH 失败 */
    }
  }
  if (!ip) {
    ip = await resolveSystemDns(host);
  }
  if (!ip) {
    // 无法解析 IP，放行
    return next();
  }

  // 请求头篡改（SNI forward 前修改原始请求头）
  if (actions.requestReplace?.headers) {
    applyRequestHeadersToReq(req, actions.requestReplace.headers);
  }
  if (actions.requestReplace?.doDownload) {
    // 请求侧 doDownload: 无实际请求头修改需要
  }

  // 响应头篡改回调
  let onResponse = null;
  if (actions.responseReplace) {
    const respHeaders = {};
    if (actions.responseReplace.headers) {
      Object.assign(respHeaders, normalizeHeaders(actions.responseReplace.headers));
    }
    if (actions.responseReplace.doDownload) {
      respHeaders['content-disposition'] = 'attachment';
    }
    if (Object.keys(respHeaders).length > 0) {
      onResponse = (res) => {
        applyResponseHeadersToRes(res, respHeaders);
      };
    }
  }

  // proxy_backup 模板替换（记录备用代理，当前版本仅记录不自动切换）
  if (actions.proxy_backup && groups) {
    // 替换模板变量 ${var}
    const _backup = require('./rule-engine').substituteTemplate(actions.proxy_backup, groups);
    // TODO: 实现主连接失败后自动切换到 proxy_backup
    // 当前版本: 仅记录，不自动切换
  }

  // SNI 直连转发
  sniAgent.forward(
    req,
    {
      domain: host,
      ip: ip,
      port: 443,
      servername: sniValue,
    },
    onResponse
  );
}

// ---- proxy 处理器 ----

function handleProxyAction(req, _client, _next, actions, host, groups) {
  const proxyHost = actions.proxy;

  // 构建 whistle 规则
  const rules = [`${host} host://${proxyHost}`];

  // 附加其他动作（header 修改、cache 等）
  const otherActions = Object.assign({}, actions);
  delete otherActions.proxy;
  delete otherActions.backup;
  delete otherActions.desc;
  delete otherActions.remark;
  delete otherActions.test;

  const extraRules = buildWhistleRules(otherActions, host, groups);
  for (let i = 0; i < extraRules.length; i++) {
    rules.push(extraRules[i]);
  }

  // backup 主机列表（当前版本仅记录，不自动切换）
  // TODO: 实现主代理失败后自动尝试 backup 主机

  req.setReqRules(rules.join('\n'));
  req.passThrough();
}

module.exports = {
  applyActions,
  buildWhistleRules,
  normalizeHeaders,
  handleSuccess,
  resolveSystemDns,
};
