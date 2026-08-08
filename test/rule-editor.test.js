const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parse,
  format,
  validate,
  findUnknownOperators,
  buildEditContent,
} = require('../lib/cli/rule-editor');

// 1. parse 单条规则（带 pattern）
test('parse 单条规则：pattern + operator + value 正确解析', () => {
  const text = 'github.com host://20.205.243.166';
  const result = parse(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].pattern, 'github.com');
  assert.equal(result[0].operator, 'host');
  assert.equal(result[0].value, '20.205.243.166');
});

// 2. parse 多条规则
test('parse 多条规则：每行一条', () => {
  const text = [
    'github.com host://20.205.243.166',
    'api.example.com sni://cdn.example.com',
    '/test/* redirect://https://example.com/new',
  ].join('\n');
  const result = parse(text);
  assert.equal(result.length, 3);
  assert.equal(result[0].operator, 'host');
  assert.equal(result[1].operator, 'sni');
  assert.equal(result[2].pattern, '/test/*');
  assert.equal(result[2].operator, 'redirect');
});

// 3. parse 空行和注释行被忽略
test('parse 空行和 # 注释行被忽略', () => {
  const text = [
    '# 这是注释',
    'github.com host://1.2.3.4',
    '',
    '# 另一行注释',
    '  # 缩进注释',
    'example.com sni://test.com',
    '',
  ].join('\n');
  const result = parse(text);
  assert.equal(result.length, 2);
  assert.equal(result[0].pattern, 'github.com');
  assert.equal(result[1].pattern, 'example.com');
});

// 4. parse 空字符串 → 空数组
test('parse 空字符串返回空数组', () => {
  assert.deepEqual(parse(''), []);
});

// 5. parse 只有注释 → 空数组
test('parse 全是注释行返回空数组', () => {
  assert.deepEqual(parse('# 注释1\n# 注释2'), []);
});

// 6. parse 缺少 operator:// → 抛错（带行号）
test('parse 缺少操作符时抛错，带行号', () => {
  assert.throws(() => parse('github.com 1.2.3.4'), /第.*行|缺少操作符/i);
});

// 7. parse 无 pattern 的全局规则
test('parse 无 pattern 的全局规则（只有 operator://value）', () => {
  const text = 'enable://capture';
  const result = parse(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].pattern, '');
  assert.equal(result[0].operator, 'enable');
  assert.equal(result[0].value, 'capture');
});

// 8. parse operator 不区分大小写
test('parse operator 不区分大小写', () => {
  const text = 'github.com HOST://1.2.3.4';
  const result = parse(text);
  assert.equal(result[0].operator, 'host');
});

// 9. parse value 为空
test('parse value 为空（如 abort://）', () => {
  const text = '/bad-path abort://';
  const result = parse(text);
  assert.equal(result[0].operator, 'abort');
  assert.equal(result[0].value, '');
});

// 10. parse 带空格的 pattern（正则）
test('parse pattern 中不含空格（whistle 规则 pattern 通常是单个 token）', () => {
  const text = '*.example.com proxy://1.2.3.4:8080';
  const result = parse(text);
  assert.equal(result[0].pattern, '*.example.com');
  assert.equal(result[0].operator, 'proxy');
  assert.equal(result[0].value, '1.2.3.4:8080');
});

// 11. format 与 parse 互为逆操作
test('format(parse(text)) 与原始文本规范化后一致', () => {
  const original = 'github.com host://1.2.3.4\nexample.com sni://test.com';
  const parsed = parse(original);
  const formatted = format(parsed);
  assert.equal(formatted, original);
  // round-trip（parse 结果带 raw 字段，比较时去掉）
  const parsed2 = parse(formatted).map(({ raw, ...rest }) => rest);
  const parsed1 = parsed.map(({ raw, ...rest }) => rest);
  assert.deepEqual(parsed2, parsed1);
});

// 12. format 空数组 → 空字符串
test('format 空数组返回空字符串', () => {
  assert.equal(format([]), '');
});

// 13. validate 校验合法规则
test('validate 校验合法规则并返回规范化结果', () => {
  const rules = [{ pattern: 'github.com', operator: 'host', value: '1.2.3.4' }];
  const result = validate(rules);
  assert.equal(result.length, 1);
  assert.equal(result[0].pattern, 'github.com');
});

// 14. validate 空 operator 抛错
test('validate 空 operator 抛错', () => {
  assert.throws(() => validate([{ pattern: 'x.com', operator: '', value: '' }]), /操作符不能为空/i);
});

// 15. validate 无效 operator 格式抛错
test('validate 无效 operator 格式抛错', () => {
  assert.throws(
    () => validate([{ pattern: 'x.com', operator: '123abc', value: '' }]),
    /操作符格式无效/i
  );
});

// 16. findUnknownOperators 识别未知操作符
test('findUnknownOperators 返回未知操作符列表', () => {
  const rules = [
    { pattern: 'x.com', operator: 'host', value: '1.2.3.4' },
    { pattern: 'y.com', operator: 'weirdop', value: 'xxx' },
  ];
  const unknown = findUnknownOperators(rules);
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].operator, 'weirdop');
  assert.equal(unknown[0].lineNo, 2);
});

// 17. findUnknownOperators 已知操作符为空
test('findUnknownOperators 全是已知操作符返回空数组', () => {
  const rules = [
    { pattern: 'x.com', operator: 'host', value: '1.2.3.4' },
    { pattern: 'y.com', operator: 'sni', value: 'test.com' },
    { pattern: 'z.com', operator: 'proxy', value: '1.2.3.4:8080' },
  ];
  assert.equal(findUnknownOperators(rules).length, 0);
});

// 18. buildEditContent 包含注释头部
test('buildEditContent 包含注释头部和规则内容', () => {
  const content = buildEditContent('github.com host://1.2.3.4');
  assert.match(content, /Whistle 规则/);
  assert.match(content, /格式:/);
  assert.match(content, /github\.com host:\/\/1\.2\.3\.4/);
  // 规则在顶部提示和底部参考之间
  assert.match(content, /下方有语法参考/);
  assert.match(content, /语法参考/);
  assert.match(content, /常用样例/);
});

// 19. buildEditContent 空内容也有头部
test('buildEditContent 空内容也包含注释头部', () => {
  const content = buildEditContent('');
  assert.match(content, /Whistle 规则/);
  assert.match(content, /格式:/);
  assert.match(content, /语法参考/);
});

// 20. parse 行号准确（前面有空行/注释）
test('parse 错误行号准确（含前面的空行和注释）', () => {
  const text = '# 注释\n  \ngithub.com 没有操作符';
  try {
    parse(text);
    assert.fail('应该抛错');
  } catch (e) {
    assert.match(e.message, /第 3 行/);
  }
});
