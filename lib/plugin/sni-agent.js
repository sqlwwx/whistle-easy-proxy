const https = require('node:https');
const { debug } = require('../debug');

/**
 * Custom https.Agent for SNI-aware forwarding.
 *
 * Key technique: set `host` to real IP (direct connect, no DNS needed),
 * `servername` to desired SNI value (can be rewritten to bypass GFW detection).
 * whistle's req.request() natively supports this — no custom lookup needed.
 */
function createSniAgent(opts) {
  opts = opts || {};
  return new https.Agent({
    keepAlive: opts.keepAlive !== false,
    maxFreeSockets: 256,
    rejectUnauthorized: opts.rejectUnauthorized === undefined ? true : opts.rejectUnauthorized,
  });
}

/**
 * Forward request via direct-connect IP + custom SNI in whistle server hook.
 * req.request() makes whistle auto-write upstream response to client (preserves packet capture).
 *
 * @param {object} req        whistle PluginServerRequest
 * @param {object} params     { domain, ip, port, servername, ca, rejectUnauthorized }
 * @param {function} [onResponse]  可选，收到上游响应后、写入 client 前的回调，用于修改响应头
 */
function forward(req, params, onResponse) {
  const { domain, ip, port, servername, ca, rejectUnauthorized } = params;
  const agent = createSniAgent({ rejectUnauthorized });

  const opts = {
    host: ip,
    port: port || 443,
    servername: servername || domain,
    agent,
    isHttps: true,
  };
  if (ca) opts.ca = ca;

  const ret = req.request(opts, (res) => {
    if (typeof onResponse === 'function') {
      try {
        onResponse(res);
      } catch (e) {
        debug('SNI onResponse callback error:', e.message);
      }
    }
    if (res && typeof res.resume === 'function') res.resume();
  });
  return ret;
}

module.exports = { createSniAgent, forward };
