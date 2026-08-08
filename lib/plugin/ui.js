const resolver = require('./resolver');
const defaultHosts = require('./default-hosts');
const { saveConfig } = require('../config');
const { debug } = require('../debug');

function sendJson(client, obj, status) {
  const body = JSON.stringify(obj);
  client.statusCode = status || 200;
  client.setHeader('content-type', 'application/json; charset=utf-8');
  client.setHeader('cache-control', 'no-store');
  client.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        debug('API body parse error:', e.message);
        resolve({});
      }
    });
    req.on('error', (e) => {
      debug('API request error:', e.message);
      resolve({});
    });
  });
}

function isTarget(host) {
  if (!host) return false;
  for (const d of defaultHosts.domains) {
    if (d === host) return true;
    if (d.startsWith('*.') && host.endsWith(d.slice(1))) return true;
  }
  return false;
}

async function handleApi(req, client, options, config) {
  const url = (req.url || '/').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  // ---- Status & config ----
  if (url === '/api/status') {
    return sendJson(client, {
      enabled: config.enabled,
      sniRewrite: config.sniRewrite,
      doh: config.doh,
      hosts: config.hosts,
      cached: resolver.snapshot(),
    });
  }

  // ---- Host list with IP & latency ----
  if (url === '/api/hosts') {
    const rows = [];
    for (const d of defaultHosts.domains) {
      const hosts = d.startsWith('*.') ? [d] : [d];
      for (const h of hosts) {
        const ip = resolver.resolve(h);
        let latency = null;
        if (ip) latency = await resolver.measureLatency(ip);
        rows.push({ host: h, ip, latency, target: isTarget(h) });
      }
    }
    return sendJson(client, { hosts: rows });
  }

  // ---- Speed test ----
  if (url === '/api/speed-test' && method === 'POST') {
    const body = await readBody(req);
    const host = body.host;
    if (!host) return sendJson(client, { error: 'host is required' }, 400);

    const candidates = await resolver.getAllCandidates(host);
    const results = await Promise.all(
      candidates.map(async (c) => {
        const latency = await resolver.measureLatency(c.ip);
        return { ip: c.ip, source: c.source, latency };
      })
    );

    results.sort((a, b) => {
      if (a.latency === -1 && b.latency === -1) return 0;
      if (a.latency === -1) return 1;
      if (b.latency === -1) return -1;
      return a.latency - b.latency;
    });

    return sendJson(client, { host, results });
  }

  // ---- Refresh DNS cache ----
  if (url === '/api/refresh' && method === 'POST') {
    const body = await readBody(req);
    if (body.host) {
      await resolver.refresh(body.host);
    } else {
      for (const d of defaultHosts.domains) {
        if (!d.startsWith('*.')) await resolver.refresh(d);
      }
    }
    return sendJson(client, { ok: true, cached: resolver.snapshot() });
  }

  // ---- Toggle acceleration ----
  if (url === '/api/toggle' && method === 'POST') {
    const body = await readBody(req);
    config.enabled = !!body.enabled;
    saveConfig(options, config);
    return sendJson(client, { ok: true, enabled: config.enabled });
  }

  // ---- Toggle SNI rewrite ----
  if (url === '/api/toggle-sni' && method === 'POST') {
    const body = await readBody(req);
    config.sniRewrite.enabled = !!body.enabled;
    if (typeof body.defaultSni !== 'undefined')
      config.sniRewrite.defaultSni = body.defaultSni || null;
    saveConfig(options, config);
    return sendJson(client, { ok: true, sniRewrite: config.sniRewrite });
  }

  // ---- SNI mapping ----
  if (url === '/api/sni' && method === 'POST') {
    const body = await readBody(req);
    if (body.host) {
      if (body.sni) config.sniRewrite.sniMap[body.host] = body.sni;
      else delete config.sniRewrite.sniMap[body.host];
      saveConfig(options, config);
    }
    return sendJson(client, { ok: true, sniMap: config.sniRewrite.sniMap });
  }

  // ---- Add/update host override ----
  if (url === '/api/host' && method === 'POST') {
    const body = await readBody(req);
    if (body.pattern && body.ip) {
      const i = config.hosts.findIndex((h) => h.pattern === body.pattern);
      if (i >= 0) config.hosts[i].ip = body.ip;
      else config.hosts.push({ pattern: body.pattern, ip: body.ip });
      saveConfig(options, config);
    }
    return sendJson(client, { ok: true, hosts: config.hosts });
  }

  // ---- Remove host override ----
  if (url === '/api/host-remove' && method === 'POST') {
    const body = await readBody(req);
    if (body.pattern) {
      config.hosts = config.hosts.filter((h) => h.pattern !== body.pattern);
      saveConfig(options, config);
    }
    return sendJson(client, { ok: true, hosts: config.hosts });
  }

  // ---- Network utility APIs ----
  if (url === '/api/network/ip') {
    const { getLocalIp } = require('../network-utils');
    return sendJson(client, { ip: getLocalIp() });
  }

  if (url === '/api/network/delay') {
    const port = req.url && new URL(`http://x${req.url}`).searchParams.get('port');
    const { checkDelay } = require('../network-utils');
    try {
      const delay = await checkDelay(port ? parseInt(port, 10) : undefined);
      return sendJson(client, { delay });
    } catch (e) {
      return sendJson(client, { error: e.message }, 500);
    }
  }

  // ---- Intercept rules APIs ----
  if (url === '/api/intercept/status') {
    const rules = config.interceptRules || {};
    const hostCount = Object.keys(rules).length;
    let pathCount = 0;
    for (const h of Object.keys(rules)) {
      pathCount += Object.keys(rules[h] || {}).length;
    }
    return sendJson(client, {
      enabled: config.interceptEnabled !== false,
      hostCount: hostCount,
      pathCount: pathCount,
    });
  }

  if (url === '/api/intercept/rules') {
    return sendJson(client, { rules: config.interceptRules || {} });
  }

  if (url === '/api/intercept/toggle' && method === 'POST') {
    const body = await readBody(req);
    config.interceptEnabled = !!body.enabled;
    saveConfig(options, config);
    return sendJson(client, { ok: true, enabled: config.interceptEnabled });
  }

  return sendJson(client, { error: 'not found' }, 404);
}

function renderDashboard(config) {
  const sniOn = config.sniRewrite.enabled;
  const hostsOverride = config.hosts || [];
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>EasyProxy · GitHub 直连加速</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #f6f7f9; color: #1f2329; }
  header { background: #2b6cff; color: #fff; padding: 14px 20px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 16px; margin: 0; }
  .wrap { padding: 18px 20px; max-width: 1080px; margin: 0 auto; }
  .card { background: #fff; border: 1px solid #e6e8eb; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .switch { position: relative; width: 44px; height: 24px; }
  .switch input { display: none; }
  .slider { position: absolute; inset: 0; background: #ccc; border-radius: 24px; transition: .2s; }
  .slider:before { content: ""; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
  .switch input:checked + .slider { background: #2b6cff; }
  .switch input:checked + .slider:before { transform: translateX(20px); }
  button { background: #2b6cff; color: #fff; border: 0; border-radius: 6px; padding: 7px 14px; cursor: pointer; font-size: 13px; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.ghost { background: #eef1f5; color: #2b6cff; }
  button.danger { background: #fff; color: #d93025; border: 1px solid #d93025; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eef0f3; }
  th { color: #6b7280; font-weight: 600; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; }
  .tag.on { background: #e6f4ea; color: #1e8e3e; }
  .tag.off { background: #fdecea; color: #d93025; }
  .tag.src-doh { background: #e8f0fe; color: #1a73e8; }
  .tag.src-curated { background: #fce8e6; color: #c5221f; }
  .tag.src-override { background: #e6f4ea; color: #1e8e3e; }
  .tag.src-cached { background: #f1f3f5; color: #5f6368; }
  .muted { color: #8a9099; font-size: 12px; }
  input[type=text] { padding: 6px 8px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 13px; }
  .hint { background: #fff8e6; border: 1px solid #ffe2a8; color: #8a6d3b; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  code { background: #f1f3f5; padding: 1px 5px; border-radius: 4px; }
  .speed-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 100; }
  .speed-modal.open { display: flex; align-items: center; justify-content: center; }
  .speed-panel { background: #fff; border-radius: 12px; padding: 20px; max-width: 640px; width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,.15); }
  .speed-panel h3 { margin: 0 0 12px; font-size: 15px; }
  .speed-panel table { margin-top: 8px; }
  .best-row { background: #e6f4ea; }
  .fail-row { color: #d93025; }
  .overlay-list { margin-top: 8px; }
  .overlay-list .item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
</style>
</head>
<body>
<header><h1>EasyProxy · GitHub 直连加速</h1></header>
<div class="wrap">
  <div class="hint">
    内核默认用 <b>whistle</b> 覆盖 95% 场景（DoH 解析真实 IP + <code>host://</code> 映射，绕过 DNS 污染）。
    <b>SNI 改写</b> 是可选的进阶拦截钩子（连真实 IP、改写 ClientHello 的 SNI 以绕过 GFW SNI 检测），默认关闭。
  </div>

  <!-- Controls -->
  <div class="card">
    <div class="row" style="justify-content: space-between;">
      <div class="row">
        <label class="switch"><input type="checkbox" id="enabled" ${config.enabled ? 'checked' : ''}/><span class="slider"></span></label>
        <strong>加速总开关</strong>
      </div>
      <div class="row">
        <label class="switch"><input type="checkbox" id="sni" ${sniOn ? 'checked' : ''}/><span class="slider"></span></label>
        <strong>SNI 改写钩子</strong>
        <span class="tag ${sniOn ? 'on' : 'off'}">${sniOn ? '已启用' : '已关闭'}</span>
      </div>
      <button class="ghost" id="refreshAll">刷新全部 IP</button>
    </div>
  </div>

  <!-- Domain list -->
  <div class="card">
    <div class="row" style="justify-content: space-between; margin-bottom: 10px;">
      <strong>域名 → 解析 IP / 延迟</strong>
      <span class="muted">点击「测速」对比所有候选 IP，一键选择最优</span>
    </div>
    <table>
      <thead><tr><th>域名</th><th>当前 IP</th><th>延迟(ms)</th><th>SNI 映射</th><th>操作</th></tr></thead>
      <tbody id="hosts"></tbody>
    </table>
  </div>

  <!-- Manual overrides -->
  <div class="card">
    <strong>手动覆盖</strong>
    <div class="row" style="margin-top: 10px;">
      <input type="text" id="pat" placeholder="域名，如 github.com" />
      <input type="text" id="ip" placeholder="IP，如 20.205.243.166" />
      <button id="addHost">添加 host 覆盖</button>
      <span class="muted">优先级高于 DoH / 兜底</span>
    </div>
    ${
      hostsOverride.length > 0
        ? '<div class="overlay-list"><span class="muted">当前覆盖：</span>' +
          hostsOverride
            .map(
              (h) =>
                '<div class="item"><code>' +
                h.pattern +
                '</code> → <code>' +
                h.ip +
                '</code>' +
                '<button class="danger" style="padding:3px 8px;font-size:12px;" data-rm="' +
                h.pattern +
                '">删除</button></div>'
            )
            .join('') +
          '</div>'
        : ''
    }
    <div class="row" style="margin-top: 12px;">
      <input type="text" id="sniHost" placeholder="域名" />
      <input type="text" id="sniVal" placeholder="改写后的 SNI" />
      <button id="addSni">设置 SNI 映射</button>
    </div>
  </div>
</div>

<!-- Speed test modal -->
<div class="speed-modal" id="speedModal">
  <div class="speed-panel">
    <div class="row" style="justify-content:space-between;">
      <h3 id="speedTitle">Speed Test</h3>
      <button class="ghost" id="closeSpeed">关闭</button>
    </div>
    <div id="speedContent"><span class="muted">正在测速...</span></div>
  </div>
</div>

<script>
const BASE = '/plugin.easy-proxy';
const api = (p, opt) => fetch(BASE + p, opt).then(r => r.json());

async function load() {
  const [{ hosts }, status] = await Promise.all([api('/api/hosts'), api('/api/status')]);
  const tb = document.getElementById('hosts');
  tb.innerHTML = '';
  hosts.forEach(h => {
    const tr = document.createElement('tr');
    const sniVal = status.sniRewrite.sniMap[h.host] || '—';
    const isOverride = status.hosts && status.hosts.some(o => o.pattern === h.host);
    const ipDisplay = h.ip
      ? (isOverride ? '<span class="tag src-override">覆盖</span> ' + h.ip : h.ip)
      : '<span class="muted">未解析</span>';
    const latDisplay = h.latency == null ? '—' : (h.latency === -1 ? '<span class="fail-row">超时</span>' : h.latency);
    const sniDisplay = sniVal === '—' ? '<span class="muted">—</span>' : sniVal;
    tr.innerHTML = '<td>' + h.host + '</td><td>' + ipDisplay +
      '</td><td>' + latDisplay + '</td><td>' + sniDisplay + '</td>' +
      '<td><button class="ghost" data-h="' + h.host + '">刷新</button> ' +
      '<button class="ghost" data-speed="' + h.host + '">测速</button></td>';
    tb.appendChild(tr);
  });
  tb.querySelectorAll('button[data-h]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    await api('/api/refresh', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ host: b.dataset.h }) });
    load();
  });
  tb.querySelectorAll('button[data-speed]').forEach(b => b.onclick = () => runSpeedTest(b.dataset.speed));
}

async function runSpeedTest(host) {
  const modal = document.getElementById('speedModal');
  const title = document.getElementById('speedTitle');
  const content = document.getElementById('speedContent');
  title.textContent = host + ' · 测速';
  content.innerHTML = '<span class="muted">正在对所有候选 IP 测速...</span>';
  modal.classList.add('open');
  const data = await api('/api/speed-test', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ host }) });
  if (data.error) { content.innerHTML = '<span class="fail-row">测速失败: ' + data.error + '</span>'; return; }
  const best = data.results.find(r => r.latency > 0);
  let html = '<table><thead><tr><th>IP</th><th>来源</th><th>延迟(ms)</th><th>操作</th></tr></thead><tbody>';
  data.results.forEach(r => {
    const isBest = best && r.ip === best.ip && r.latency === best.latency;
    const isFail = r.latency === -1;
    const srcTag = '<span class="tag src-' + r.source + '">' + r.source + '</span>';
    html += '<tr class="' + (isBest ? 'best-row' : (isFail ? 'fail-row' : '')) + '"><td>' + r.ip + '</td><td>' + srcTag +
      '</td><td>' + (isFail ? '超时/不可达' : r.latency) + '</td>' +
      '<td>' + (isFail ? '' : '<button class="ghost" onclick="pickBest('' + host + '','' + r.ip + '')">选为覆盖</button>') + '</td></tr>';
  });
  html += '</tbody></table>';
  if (best) html += '<div style="margin-top:10px;"><span class="tag on">✓ 最优</span> ' + best.ip + ' (' + best.latency + 'ms) ' +
    '<button class="ghost" onclick="pickBest('' + host + '','' + best.ip + '')">一键选用最优</button></div>';
  content.innerHTML = html;
}

function pickBest(host, ip) {
  api('/api/host', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ pattern: host, ip }) });
  document.getElementById('speedModal').classList.remove('open');
  load();
}

document.getElementById('closeSpeed').onclick = () => document.getElementById('speedModal').classList.remove('open');
document.getElementById('speedModal').onclick = (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); };
document.getElementById('enabled').onchange = e => api('/api/toggle', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ enabled: e.target.checked }) });
document.getElementById('sni').onchange = e => api('/api/toggle-sni', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ enabled: e.target.checked }) });
document.getElementById('refreshAll').onclick = async () => { await api('/api/refresh', { method:'POST', headers:{'content-type':'application/json'}, body: '{}' }); load(); };
document.getElementById('addHost').onclick = async () => {
  const pat = document.getElementById('pat').value.trim(), ip = document.getElementById('ip').value.trim();
  if (!pat || !ip) return;
  await api('/api/host', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ pattern: pat, ip }) });
  load();
};
document.getElementById('addSni').onclick = async () => {
  const host = document.getElementById('sniHost').value.trim(), sni = document.getElementById('sniVal').value.trim();
  if (!host) return;
  await api('/api/sni', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ host, sni }) });
  load();
};
document.querySelectorAll('button[data-rm]').forEach(b => b.onclick = async () => {
  await api('/api/host-remove', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ pattern: b.dataset.rm }) });
  load();
});
load();
</script>
</body>
</html>`;
}

module.exports = { renderDashboard, handleApi, isTarget };
