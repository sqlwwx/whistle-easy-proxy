const https = require('node:https');
const net = require('node:net');
const { debug } = require('../debug');
const defaultHosts = require('./default-hosts');

let CONFIG = null;

// host -> { ip, ts, all }
const cache = new Map();

function setConfig(config) {
  CONFIG = config;
}

function ttl() {
  return (CONFIG?.ipCacheTtl ? CONFIG.ipCacheTtl : 600) * 1000;
}

function fresh(host) {
  const e = cache.get(host);
  if (e && Date.now() - e.ts < ttl()) return e.ip;
  return null;
}

/**
 * DoH (RFC 8484 JSON) resolve real IPv4.
 * Direct-connects bootstrap IP with servername = DoH hostname,
 * so it's immune to client-side DNS pollution and avoids GFW SNI detection.
 */
function dohResolve(host) {
  const doh = CONFIG?.doh || {
    bootstrapIp: '8.8.8.8',
    host: 'dns.google',
    path: '/resolve',
    port: 443,
  };
  const qs = `?name=${encodeURIComponent(host)}&type=A`;
  const reqOpts = {
    host: doh.bootstrapIp,
    port: doh.port || 443,
    servername: doh.host,
    path: doh.path + qs,
    method: 'GET',
    headers: {
      Host: doh.host,
      Accept: 'application/dns-json',
    },
    lookup: (_h, _o, cb) => cb(null, doh.bootstrapIp, 4),
    timeout: 5000,
  };

  return new Promise((resolve, reject) => {
    try {
      const req = https.request(reqOpts, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.Status !== 0 || !Array.isArray(json.Answer)) {
              return resolve([]);
            }
            const ips = json.Answer.filter((a) => a.type === 1).map((a) => a.data);
            resolve(ips);
          } catch (e) {
            reject(new Error(`DoH response parse error: ${e.message}`));
          }
        });
      });
      req.on('error', (e) => reject(new Error(`DoH request error: ${e.message}`)));
      req.on('timeout', () => req.destroy(new Error('DoH timeout')));
      req.end();
    } catch (e) {
      reject(new Error(`DoH setup error: ${e.message}`));
    }
  });
}

async function refresh(host) {
  try {
    const ips = await dohResolve(host);
    if (ips?.length) {
      cache.set(host, { ip: ips[0], ts: Date.now(), all: ips });
      return ips[0];
    }
  } catch (e) {
    debug('DoH resolve failed for', `${host}:`, e.message);
    // DoH failed, keep old cache or fallback
  }
  const curated = defaultHosts.curated[host];
  if (curated?.length) {
    cache.set(host, { ip: curated[0], ts: Date.now(), all: curated });
    return curated[0];
  }
  return null;
}

/**
 * 将 DoH 解析结果缓存到内存（供 rule-actions 的 SNI 处理器调用）。
 * 用于非 GitHub 域名的 IP 缓存。
 */
function cacheDohResult(host, ips) {
  if (!ips?.length) return;
  cache.set(host, { ip: ips[0], ts: Date.now(), all: ips });
}

function userOverride(host) {
  if (!CONFIG || !Array.isArray(CONFIG.hosts)) return null;
  for (const h of CONFIG.hosts) {
    if (h.pattern === host && h.ip) return h.ip;
  }
  return null;
}

/**
 * Synchronous best-IP resolution: user override > cache > curated fallback.
 * Triggers async DoH refresh in background.
 */
function resolve(host) {
  const ov = userOverride(host);
  if (ov) return ov;

  const cached = fresh(host);
  if (cached) return cached;

  const curated = defaultHosts.curated[host];
  const fallback = curated?.length ? curated[0] : null;

  refresh(host).catch((e) => {
    debug('Background refresh failed for', `${host}:`, e.message);
  });

  return fallback;
}

/**
 * TCP connection latency in ms.
 */
function measureLatency(ip, port) {
  port = port || 443;
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const sock = net.connect({ host: ip, port }, () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      sock.destroy();
      resolve(Math.round(ms * 100) / 100);
    });
    sock.on('error', () => resolve(-1));
    sock.setTimeout(3000, () => {
      sock.destroy();
      resolve(-1);
    });
  });
}

function clearCache() {
  cache.clear();
}

function snapshot() {
  const out = {};
  cache.forEach((v, k) => (out[k] = v));
  return out;
}

/**
 * Get all candidate IPs for a host with source labels.
 * Returns [{ ip, source: 'doh'|'curated'|'override'|'cached', latency: null }]
 */
async function getAllCandidates(host) {
  const seen = new Set();
  const candidates = [];

  const ov = userOverride(host);
  if (ov && !seen.has(ov)) {
    seen.add(ov);
    candidates.push({ ip: ov, source: 'override', latency: null });
  }

  try {
    const dohIps = await dohResolve(host);
    if (dohIps?.length) {
      cache.set(host, { ip: dohIps[0], ts: Date.now(), all: dohIps });
      for (const ip of dohIps) {
        if (!seen.has(ip)) {
          seen.add(ip);
          candidates.push({ ip, source: 'doh', latency: null });
        }
      }
    }
  } catch (e) {
    debug('getAllCandidates DoH failed for', `${host}:`, e.message);
  }

  const cachedEntry = cache.get(host);
  if (cachedEntry?.all) {
    for (const ip of cachedEntry.all) {
      if (!seen.has(ip)) {
        seen.add(ip);
        candidates.push({ ip, source: 'cached', latency: null });
      }
    }
  }

  const curated = defaultHosts.curated[host];
  if (curated?.length) {
    for (const ip of curated) {
      if (!seen.has(ip)) {
        seen.add(ip);
        candidates.push({ ip, source: 'curated', latency: null });
      }
    }
  }

  return candidates;
}

module.exports = {
  setConfig,
  resolve,
  refresh,
  cacheDohResult,
  measureLatency,
  clearCache,
  snapshot,
  dohResolve,
  getAllCandidates,
};
