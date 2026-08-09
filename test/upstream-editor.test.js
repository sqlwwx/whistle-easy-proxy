const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parse, format, validate, buildEditContent } = require('../lib/cli/upstream-editor');

// 1. parse 单代理
test('parse 单代理：名称、URL、域名正确解析', () => {
  const text = 'corp\nhttp://10.0.0.1:8080\ngithub.com';
  const result = parse(text);
  assert.deepEqual(result, [
    { name: 'corp', url: 'http://10.0.0.1:8080', domains: ['github.com'] },
  ]);
});

// 2. parse 多代理（空行分隔）
test('parse 多代理：空行分隔，域名归属正确', () => {
  const text = [
    'corp',
    'http://10.0.0.1:8080',
    'github.com',
    'google.com',
    '',
    'home',
    'http://192.168.1.100:3128',
    'internal.company.com',
  ].join('\n');
  const result = parse(text);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'corp');
  assert.deepEqual(result[0].domains, ['github.com', 'google.com']);
  assert.equal(result[1].name, 'home');
  assert.deepEqual(result[1].domains, ['internal.company.com']);
});

// 3. parse 过滤 # 注释行
test('parse 过滤 # 注释行：任意位置的注释行都被忽略', () => {
  const text = [
    '# 这是注释',
    'corp',
    '# 这也是注释',
    'http://10.0.0.1:8080',
    'github.com',
    '# 末尾注释',
  ].join('\n');
  const result = parse(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'corp');
  assert.equal(result[0].url, 'http://10.0.0.1:8080');
  assert.deepEqual(result[0].domains, ['github.com']);
});

// 4. parse 空字符串 → 空数组
test('parse 空字符串返回空数组', () => {
  assert.deepEqual(parse(''), []);
});

// 5. parse 只有注释 → 空数组
test('parse 全是注释行返回空数组', () => {
  const text = '# 注释1\n# 注释2\n  # 缩进注释';
  assert.deepEqual(parse(text), []);
});

// 6. parse 多个连续空行
test('parse 多个连续空行视为一个分隔符，不产生空代理', () => {
  const text =
    'corp\nhttp://10.0.0.1:8080\ngithub.com\n\n\n\nhome\nhttp://192.168.1.100:3128\ninternal.com';
  const result = parse(text);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'corp');
  assert.equal(result[1].name, 'home');
});

// 7. parse 代理名称为空 → 抛错
test('parse 代理名称为空时抛出带位置信息的错误', () => {
  assert.throws(() => parse('\nhttp://10.0.0.1:8080\ngithub.com'), /名称|name|第.*行/i);
  assert.throws(() => parse('   \nhttp://10.0.0.1:8080\ngithub.com'), /名称|name|第.*行/i);
});

// 8. parse 代理 URL 为空或无协议前缀 → 抛错
test('parse 代理 URL 为空或无协议前缀时抛错', () => {
  // URL 为空
  assert.throws(() => parse('corp\n\ngithub.com'), /URL|url|协议|第.*行/i);
  // 无 http:// 或 https:// 前缀
  assert.throws(() => parse('corp\n10.0.0.1:8080\ngithub.com'), /URL|url|协议|第.*行/i);
  // ftp 前缀不支持
  assert.throws(() => parse('corp\nftp://10.0.0.1:8080\ngithub.com'), /URL|url|协议|第.*行/i);
});

// 9. parse 重名代理 → 抛错
test('parse 重名代理时抛出重复名称错误', () => {
  const text = 'corp\nhttp://10.0.0.1:8080\ngithub.com\n\ncorp\nhttp://10.0.0.2:8080\ngoogle.com';
  assert.throws(() => parse(text), /重复|重名|duplicate|already/i);
});

// 10. format 与 parse 互为逆操作（round-trip）
test('format(parse(text)) 与原始文本规范化后一致', () => {
  const original = [
    'corp',
    'http://10.0.0.1:8080',
    'github.com',
    'google.com',
    '',
    'home',
    'http://192.168.1.100:3128',
    'internal.company.com',
  ].join('\n');
  const parsed = parse(original);
  const formatted = format(parsed);
  assert.equal(formatted, original);
  // 二次 round-trip 也应该一致
  assert.deepEqual(parse(formatted), parsed);
});

// 11. format 空数组 → 空字符串
test('format 空数组返回空字符串', () => {
  assert.equal(format([]), '');
});

// 12. 域名 trim + 去重
test('域名 trim 前后空格 + 同一代理下去重', () => {
  const text = 'corp\nhttp://10.0.0.1:8080\n  github.com  \ngithub.com\n  GITHUB.COM  ';
  const result = parse(text);
  assert.equal(result.length, 1);
  // trim 后去重，保留顺序，只留一个
  assert.deepEqual(result[0].domains, ['github.com']);
});

// 额外：validate 函数
test('validate 校验合法代理数组并返回去重结果', () => {
  const proxies = [
    { name: 'corp', url: 'http://10.0.0.1:8080', domains: ['github.com', 'github.com'] },
  ];
  const result = validate(proxies);
  assert.deepEqual(result[0].domains, ['github.com']);
});

test('validate 名称为空抛错', () => {
  assert.throws(() => validate([{ name: '', url: 'http://x.com', domains: [] }]), /名称|name/i);
});

test('validate URL 无效抛错', () => {
  assert.throws(() => validate([{ name: 'a', url: 'ftp://x.com', domains: [] }]), /URL|url|协议/i);
});

test('validate 重名抛错', () => {
  assert.throws(
    () =>
      validate([
        { name: 'a', url: 'http://x.com', domains: [] },
        { name: 'A', url: 'http://y.com', domains: [] },
      ]),
    /重复|重名|duplicate/i
  );
});

// 14. parse 注释掉地址行 → 停用代理（disabled: true，块结构保留）
test('parse 注释掉地址行：标记为停用并保留名称与域名', () => {
  const text = [
    'corp',
    '# http://10.0.0.1:8080',
    'github.com',
    '',
    'git',
    'http://proxy-b.com:8080',
    'google.com',
  ].join('\n');
  const result = parse(text);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    name: 'corp',
    url: 'http://10.0.0.1:8080',
    domains: ['github.com'],
    disabledUrls: ['http://10.0.0.1:8080'],
    disabled: true,
  });
  assert.equal(result[1].disabled, undefined);
});

// 15. parse 注释掉的旧地址 + 新的生效地址 → 切换地址（未注释的生效）
test('parse 注释旧地址 + 新地址：生效地址为未注释的那个', () => {
  const text = ['corp', '# http://10.0.0.1:8080', 'http://127.0.0.1:8080', 'github.com'].join('\n');
  const result = parse(text);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    name: 'corp',
    url: 'http://127.0.0.1:8080',
    domains: ['github.com'],
    disabledUrls: ['http://10.0.0.1:8080'],
  });
});

// 16. parse 多个生效地址 → 抛错
test('parse 多个生效地址时抛出错误', () => {
  const text = 'corp\nhttp://10.0.0.1:8080\nhttp://127.0.0.1:8080\ngithub.com';
  assert.throws(() => parse(text), /多个生效地址|只能有一个/i);
});

// 17. parse 非 URL 的注释行不影响解析
test('parse 非 URL 注释行仍被忽略，不影响代理解析', () => {
  const text = 'corp\n# 随意注释\nhttp://10.0.0.1:8080\ngithub.com';
  const result = parse(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'corp');
  assert.equal(result[0].url, 'http://10.0.0.1:8080');
  assert.equal(result[0].disabled, undefined);
});

// 18. format 停用代理以 # 前缀输出，round-trip 保留
test('format 停用代理地址加 # 前缀，parse 后可恢复', () => {
  const text = 'corp\n# http://10.0.0.1:8080\ngithub.com';
  const parsed = parse(text);
  const formatted = format(parsed);
  assert.equal(formatted, text);
  // 二次 round-trip 一致
  assert.deepEqual(parse(formatted), parsed);
});

// 19. format 多地址切换 round-trip 保留
test('format 多地址切换：注释旧地址 + 生效新地址 round-trip 保留', () => {
  const text = 'corp\n# http://10.0.0.1:8080\nhttp://127.0.0.1:8080\ngithub.com';
  const parsed = parse(text);
  assert.equal(parsed[0].url, 'http://127.0.0.1:8080');
  const formatted = format(parsed);
  assert.equal(formatted, text);
  assert.deepEqual(parse(formatted), parsed);
});

// 20. validate 保留 disabled 与 disabledUrls 标记
test('validate 保留 disabled 与 disabledUrls 标记', () => {
  const proxies = [
    {
      name: 'corp',
      url: 'http://127.0.0.1:8080',
      domains: ['github.com'],
      disabledUrls: ['http://10.0.0.1:8080'],
    },
  ];
  const result = validate(proxies);
  assert.deepEqual(result[0].disabledUrls, ['http://10.0.0.1:8080']);
  assert.equal(result[0].disabled, undefined);
});

// 21. buildEditContent 说明文案包含停用代理的用法
test('buildEditContent 头部说明包含停用代理的用法', () => {
  const content = buildEditContent([]);
  assert.match(content, /停用该代理/);
});

// 额外：buildEditContent 包含注释头部
test('buildEditContent 包含注释头部和配置内容', () => {
  const proxies = [{ name: 'corp', url: 'http://10.0.0.1:8080', domains: ['github.com'] }];
  const content = buildEditContent(proxies);
  assert.match(content, /EasyProxy/);
  assert.match(content, /格式说明/);
  assert.match(content, /corp/);
  assert.match(content, /github\.com/);
  // 注释头部和正文之间有空行（最后一行注释后空一行再接正文）
  assert.match(content, /#   internal\.company\.com\n\ncorp/);
});
