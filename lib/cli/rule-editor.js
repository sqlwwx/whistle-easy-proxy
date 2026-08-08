/**
 * Whistle 规则编辑器解析模块
 * 纯函数：parse / validate / buildEditContent
 *
 * 规则格式约定（whistle 原生）：
 *   - 每行一条规则：pattern operator://value
 *   - 空行和以 # 开头的注释行会被忽略
 *   - 支持 \r\n 和 \n 换行
 *   - operator 不区分大小写
 */

// whistle 已知 operator 列表（用于语法校验，不区分大小写）
// 参考官方文档：https://wproxy.org/whistle/rules/
const KNOWN_OPERATORS = new Set([
  // 特殊规则
  '@',
  '%',
  // Map Local
  'file',
  'xfile',
  'tpl',
  'xtpl',
  'rawfile',
  'xrawfile',
  // Map Remote
  'https',
  'http',
  'wss',
  'ws',
  'tunnel',
  // DNS Spoofing
  'host',
  'xhost',
  'proxy',
  'http-proxy',
  'xproxy',
  'xhttp-proxy',
  'https-proxy',
  'xhttps-proxy',
  'socks',
  'xsocks',
  'pac',
  'sni',
  'snicallback',
  'tlscallback',
  'tls_options',
  'tlsoptions',
  // Rewrite Request
  'urlparams',
  'pathreplace',
  'method',
  'tlsoptions',
  'reqheaders',
  'forwardedfor',
  'ua',
  'auth',
  'cache',
  'referer',
  'reqtype',
  'reqcharset',
  'reqcookies',
  'reqcors',
  'reqbody',
  'reqmerge',
  'reqprepend',
  'reqappend',
  'reqreplace',
  'reqwrite',
  'reqwriteraw',
  'reqrules',
  'reqscript',
  // Rewrite Response
  'statuscode',
  'replacestatus',
  'redirect',
  'locationhref',
  'resheaders',
  'responsefor',
  'restype',
  'rescharset',
  'rescookies',
  'attachment',
  'rescors',
  'resbody',
  'resmerge',
  'resprepend',
  'resappend',
  'resreplace',
  'htmlprepend',
  'htmlbody',
  'htmlappend',
  'cssprepend',
  'cssbody',
  'cssappend',
  'jsprepend',
  'jsbody',
  'jsappend',
  'trailers',
  'reswrite',
  'reswriteraw',
  'resrules',
  'resscript',
  'framescript',
  // General
  'pipe',
  'delete',
  'headerreplace',
  // Throttle
  'reqdelay',
  'resdelay',
  'reqspeed',
  'resspeed',
  // Tools
  'weinre',
  'log',
  'filter',
  // Settings
  'style',
  'enable',
  'disable',
  'lineprops',
  'abort',
  // Filters
  'excludefilter',
  'includefilter',
  'ignore',
  'skip',
  // 插件协议
  'easy-proxy',
  'whistle.easy-proxy',
]);

/**
 * 提取行中的 operator（小写形式），不存在则返回 null
 * 格式：pattern operator://value 或 operator://value
 * @param {string} line
 * @returns {string|null}
 */
function extractOperator(line) {
  const m = line.match(/(\S+):\/\//);
  return m ? m[1].toLowerCase() : null;
}

/**
 * 将文本分割为「原始行号 + 内容」的数组，同时处理 \r\n 和注释过滤
 * 保留原始行号用于错误提示
 * @param {string} text
 * @returns {Array<{lineNo: number, content: string, raw: string}>}
 */
function splitLinesWithNumbers(text) {
  const rawLines = text.replace(/\r/g, '').split('\n');
  const result = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    // 过滤整行注释和空行
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    result.push({ lineNo: i + 1, content: trimmed, raw: line });
  }
  return result;
}

/**
 * 解析单条规则，返回 { pattern, operator, value, raw }
 * 解析失败抛出带行号的错误
 * @param {{lineNo: number, content: string, raw: string}} lineInfo
 * @returns {{pattern: string, operator: string, value: string, raw: string}}
 */
function parseLine(lineInfo) {
  const { lineNo, content } = lineInfo;

  // 检查是否有 operator:// 结构
  const op = extractOperator(content);
  if (!op) {
    throw new Error(`第 ${lineNo} 行: 缺少操作符（operator://），如 host://、sni://、proxy://`);
  }

  const opIndex = content.indexOf('://');
  const beforeOp = content.substring(0, opIndex).trim();
  const afterOp = content.substring(opIndex + 3).trim();

  // beforeOp 可能是 pattern + operator 或只有 operator
  // 规则：如果 beforeOp 包含空格，则最后一个词是 operator，前面是 pattern
  // 否则 beforeOp 就是 operator（没有 pattern 的全局规则，如 enable://）
  let pattern = '';
  let operator = '';

  const parts = beforeOp.split(/\s+/);
  if (parts.length === 1) {
    // 没有 pattern，全局规则
    operator = parts[0];
  } else {
    operator = parts[parts.length - 1];
    pattern = parts.slice(0, -1).join(' ');
  }

  operator = operator.toLowerCase();

  // 校验 operator 是否是已知的（警告级别，不强制拒绝 —— 允许用户用插件或新特性）
  // 这里只做基本格式校验
  if (!/^[a-z][a-z0-9-]*$/i.test(operator)) {
    throw new Error(`第 ${lineNo} 行: 操作符格式无效 "${operator}"`);
  }

  return {
    pattern,
    operator,
    value: afterOp,
    raw: lineInfo.raw,
  };
}

/**
 * 解析 whistle 规则文本
 * @param {string} text - 编辑器中的文本内容
 * @returns {Array<{pattern: string, operator: string, value: string, raw: string}>}
 * @throws {Error} 格式错误时抛出，错误信息包含具体位置和原因
 */
function parse(text) {
  if (!text || !text.trim()) return [];

  const lines = splitLinesWithNumbers(text);
  const rules = [];

  for (const lineInfo of lines) {
    const rule = parseLine(lineInfo);
    rules.push(rule);
  }

  return rules;
}

/**
 * 将规则数组格式化为文本（不含注释头部）
 * @param {Array<{pattern: string, operator: string, value: string}>} rules
 * @returns {string}
 */
function format(rules) {
  if (!rules || rules.length === 0) return '';

  return rules
    .map((r) => {
      const pattern = r.pattern ? `${r.pattern} ` : '';
      return `${pattern}${r.operator}://${r.value}`;
    })
    .join('\n');
}

/**
 * 校验规则合法性
 * @param {Array<{pattern: string, operator: string, value: string}>} rules
 * @returns {Array} 返回校验后的 rules
 * @throws {Error} 校验失败时抛出
 */
function validate(rules) {
  if (!Array.isArray(rules)) {
    throw new Error('规则必须是数组');
  }

  return rules.map((rule, idx) => {
    const position = `第 ${idx + 1} 条规则`;

    const operator = (rule.operator || '').trim().toLowerCase();
    if (!operator) {
      throw new Error(`${position}: 操作符不能为空`);
    }
    if (!/^[a-z][a-z0-9-]*$/i.test(operator)) {
      throw new Error(`${position}: 操作符格式无效 "${operator}"`);
    }

    const value = rule.value !== undefined ? String(rule.value) : '';
    // value 可以为空（如 abort:// 无值也合法）

    const pattern = (rule.pattern || '').trim();

    return { pattern, operator, value };
  });
}

/**
 * 检查规则中是否包含未知 operator，返回警告信息数组
 * （不阻塞保存，仅用于提示）
 * @param {Array<{pattern: string, operator: string, value: string}>} rules
 * @returns {Array<{lineNo: number, operator: string}>}
 */
function findUnknownOperators(rules) {
  const warnings = [];
  for (let i = 0; i < rules.length; i++) {
    const op = rules[i].operator.toLowerCase();
    if (!KNOWN_OPERATORS.has(op)) {
      warnings.push({ lineNo: i + 1, operator: rules[i].operator });
    }
  }
  return warnings;
}

/**
 * 构建编辑器内容（带注释头部 + 当前规则）
 * @param {string} currentContent - 当前规则文本
 * @returns {string}
 */
function buildEditContent(currentContent) {
  const topHint = [
    '# Whistle 规则 — EasyProxy 编辑器',
    '# 格式: pattern operator://value   完整文档: https://wproxy.org/whistle/rules/',
    '# 空行和 # 开头的行是注释，会被忽略。下方有语法参考和常用样例。',
  ].join('\n');

  const bottomRef = [
    '# ─── 语法参考（不会被保存，编辑时可忽略） ───',
    '#',
    '# Pattern 匹配模式：',
    '#   example.com              域名匹配（所有端口/协议）',
    '#   example.com:8080         指定端口',
    '#   example.com/api          路径前缀匹配',
    '#   $example.com/api         路径精确匹配',
    '#   ^*.example.com           通配符匹配（^ 前缀开启）',
    '#   /\\.example\\./            正则匹配',
    '#   完整语法: https://wproxy.org/docs/rules/pattern.html',
    '#',
    '# 常用 Operator（完整列表: https://wproxy.org/docs/rules/protocols.html）',
    '#   host://1.2.3.4              DNS/Host 改写',
    '#   sni://example.com           SNI 改写',
    '#   proxy://1.2.3.4:8080        HTTP 代理转发',
    '#   https-proxy://host:8443     HTTPS 代理',
    '#   socks://host:1080           SOCKS 代理',
    '#   redirect://https://x.com    302 重定向',
    '#   statusCode://404            修改状态码',
    '#   reqHeaders://{...}          修改请求头（JSON）',
    '#   resHeaders://{...}          修改响应头（JSON）',
    '#   reqBody://... / resBody://...  替换请求/响应体',
    '#   file:///path/to/file        本地文件替换响应',
    '#   xfile:///path/to/dir        目录替换',
    '#   resDelay://1000             响应延迟（毫秒）',
    '#   resSpeed://100k             响应限速（k/m/g）',
    '#   abort://                    中断请求',
    '#   enable://capture / disable://gzip',
    '#',
    '# 常用样例：',
    '#   GitHub 加速:  github.com host://20.205.243.166',
    '#   SNI 改写:     api.example.com sni://origin.example.com',
    '#   上游代理:     *.google.com proxy://127.0.0.1:7890',
    '#   本地 Mock:    /api/v1/user file:///Users/xxx/mock/user.json',
    '#   允许跨域:     /api/* resHeaders://{"access-control-allow-origin":"*"}',
    '#   延迟测试:     /slow/* resDelay://3000',
    '#   正则匹配:     /\\.example\\./ host://127.0.0.1',
    '# ─────────────────────────────────────────────────',
  ].join('\n');

  const body = (currentContent || '').trim();
  if (!body) return topHint + '\n\n' + bottomRef + '\n';
  return topHint + '\n\n' + body + '\n\n' + bottomRef + '\n';
}

module.exports = {
  parse,
  format,
  validate,
  findUnknownOperators,
  buildEditContent,
  KNOWN_OPERATORS,
};
