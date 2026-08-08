const http = require('node:http');
const {
  listRulesets: listOfflineRulesetsRaw,
  getRuleset,
  saveRuleset,
  deleteRuleset,
} = require('../config');

const SYSTEM_GROUP = '\rEasyProxy 系统规则';
const USER_GROUP = '\rEasyProxy 自定义规则';

function loadOfflineRulesets() {
  return listOfflineRulesetsRaw().filter((r) => r.name !== 'default');
}

function getOfflineDefaultRules() {
  const r = getRuleset('default');
  return r ? r.content : '';
}

function saveOfflineDefaultRules(content) {
  const _r = getRuleset('default');
  saveRuleset('default', content, true, '');
}

/**
 * 从环境变量构建 whistle 连接选项
 */
function getOptions() {
  const port = parseInt(process.env.W2_PORT || '8899', 10);
  const host = process.env.W2_HOST || '127.0.0.1';
  const username = process.env.W2_USERNAME;
  const password = process.env.W2_PASSWORD;
  const auth =
    username && password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : null;
  return { host, port, auth };
}

/**
 * 发送 HTTP 请求到 whistle
 */
function request(method, path, body, options) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (options.auth) headers.Authorization = options.auth;
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const req = http.request(
      {
        hostname: options.host,
        port: options.port,
        path: path,
        method: method,
        headers: headers,
      },
      (res) => {
        var data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`whistle 返回 HTTP ${res.statusCode}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on('error', () => {
      reject(
        new Error(
          '无法连接 whistle (' +
            options.host +
            ':' +
            options.port +
            ') — 请先执行 easy-proxy start --init'
        )
      );
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * 列出所有规则集
 * 返回: { ec, enabledCount, defaultRulesIsDisabled, defaultRules, list: [{name, data, selected}] }
 */
async function listRulesets() {
  const opts = getOptions();
  const raw = await request('GET', '/cgi-bin/rules/list', null, opts);
  try {
    var data = JSON.parse(raw);
  } catch (_e) {
    throw new Error(`whistle API 返回无效 JSON: ${raw.substring(0, 100)}`);
  }
  if (data.ec !== 0) throw new Error('whistle API 返回错误');
  return data;
}

/**
 * 创建分组（whistle 分组以 \r 开头）
 */
async function createGroup(name) {
  const opts = getOptions();
  await request('POST', '/cgi-bin/rules/add', `name=${encodeURIComponent(name)}`, opts);
}

/**
 * 添加或更新规则集（非 Default）
 * 可选 groupName 参数将规则集放入指定分组
 */
async function addRuleset(name, content, groupName) {
  const opts = getOptions();
  let body = `name=${encodeURIComponent(name)}&value=${encodeURIComponent(content)}`;
  if (groupName) body += `&groupName=${encodeURIComponent(groupName)}`;
  const raw = await request('POST', '/cgi-bin/rules/add', body, opts);
  return JSON.parse(raw);
}

/**
 * 在 whistle 中启用多选模式，使启用新规则集时不会自动取消其他规则集的选中状态
 */
async function enableMultipleChoice() {
  const opts = getOptions();
  await request('POST', '/cgi-bin/rules/allow-multiple-choice', 'allowMultipleChoice=1', opts);
}

/**
 * 启用规则集（非 Default）
 * 启用前先确保多选模式已开启，避免覆盖已有选中状态
 */
async function selectRuleset(name, content) {
  const opts = getOptions();
  await enableMultipleChoice();
  const body = `name=${encodeURIComponent(name)}&value=${encodeURIComponent(content || '')}`;
  const raw = await request('POST', '/cgi-bin/rules/select', body, opts);
  return JSON.parse(raw);
}

/**
 * 禁用规则集（非 Default）
 * unselect 会先 add（确保存在）再 unselect
 */
async function unselectRuleset(name, content) {
  const opts = getOptions();
  const body = `name=${encodeURIComponent(name)}&value=${encodeURIComponent(content || '')}`;
  const raw = await request('POST', '/cgi-bin/rules/unselect', body, opts);
  return JSON.parse(raw);
}

/**
 * 启用 Default 规则集
 */
async function enableDefault() {
  const opts = getOptions();
  const raw = await request('POST', '/cgi-bin/rules/enable-default', '', opts);
  return JSON.parse(raw);
}

/**
 * 禁用 Default 规则集
 */
async function disableDefault() {
  const opts = getOptions();
  const raw = await request('POST', '/cgi-bin/rules/disable-default', '', opts);
  return JSON.parse(raw);
}

/**
 * 删除规则集（非 Default，Default 不可删除）
 */
async function removeRuleset(name) {
  const opts = getOptions();
  const body = `name=${encodeURIComponent(name)}`;
  const raw = await request('POST', '/cgi-bin/rules/remove', body, opts);
  return JSON.parse(raw);
}

async function syncOfflineRulesToWhistle() {
  const offlineRules = loadOfflineRulesets();
  const defaultRules = getOfflineDefaultRules();
  if (offlineRules.length === 0 && !defaultRules) {
    return 0;
  }

  let synced = 0;
  await createGroup(USER_GROUP);

  if (defaultRules) {
    await addRuleset('Default', defaultRules);
    synced++;
  }

  for (const rule of offlineRules) {
    if (rule.name === 'Default') continue;
    await addRuleset(rule.name, rule.content, rule.group || USER_GROUP);
    if (rule.enabled) {
      await selectRuleset(rule.name, rule.content);
    } else {
      await unselectRuleset(rule.name, rule.content);
    }
    synced++;
  }

  return synced;
}

module.exports = {
  getOptions,
  listRulesets,
  addRuleset,
  selectRuleset,
  unselectRuleset,
  enableDefault,
  disableDefault,
  removeRuleset,
  createGroup,

  loadOfflineRulesets,
  getOfflineDefaultRules,
  saveOfflineDefaultRules,
  syncOfflineRulesToWhistle,

  SYSTEM_GROUP,
  USER_GROUP,
};
