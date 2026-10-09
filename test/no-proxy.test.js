const { test } = require('node:test');
const assert = require('node:assert');
const { bypassToNoProxy } = require('../lib/cert-check');

test('*.x.com 前导通配转为后缀匹配', () => {
  const out = bypassToNoProxy(['*.bilibili.com', '*.apple.com']);
  assert.ok(out.includes('.bilibili.com'));
  assert.ok(out.includes('.apple.com'));
  assert.ok(!out.includes('*'));
});

test('私网通配转为 CIDR', () => {
  const out = bypassToNoProxy(['10.*.*.*', '172.16.*.*', '192.168.*.*', '127.*.*.*']);
  assert.ok(out.includes('10.0.0.0/8'));
  // 172.16~31 聚合成一个 /12，不逐条出现
  assert.ok(out.includes('172.16.0.0/12'));
  assert.ok(!out.includes('172.17'));
  assert.ok(out.includes('192.168.0.0/16'));
  assert.ok(out.includes('127.0.0.0/8'));
});

test('纯域名/IP 原样保留', () => {
  const out = bypassToNoProxy(['github.com', '44.239.165.12', 'www.deepl.com']);
  assert.ok(out.includes('github.com'));
  assert.ok(out.includes('44.239.165.12'));
});

test('中缀通配（NO_PROXY 表达不了）丢弃', () => {
  const out = bypassToNoProxy(['*china*', '*.ghproxy.*']);
  assert.ok(!out.includes('china'));
  assert.ok(!out.includes('ghproxy'));
});

test('localhost 恒在列表首位且去重', () => {
  const out = bypassToNoProxy(['localhost', 'localhost']);
  const parts = out.split(',');
  assert.strictEqual(parts[0], 'localhost');
  assert.strictEqual(parts.filter((p) => p === 'localhost').length, 1);
});

test('真实 DEFAULT_BYPASS_DOMAINS 转换无星号残留', () => {
  const { DEFAULT_BYPASS_DOMAINS } = require('../lib/cli/bypass-domains');
  const out = bypassToNoProxy(DEFAULT_BYPASS_DOMAINS);
  assert.ok(!/\*/.test(out), 'NO_PROXY 不应含通配符: ' + out);
  assert.ok(out.split(',').length > 20, '转换条目数应接近原列表');
});
