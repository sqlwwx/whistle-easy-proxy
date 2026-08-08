/**
 * 上游代理配置编辑器解析模块
 * 纯函数：parse / format / validate / buildEditContent
 *
 * 文本格式约定：
 *   - 每个代理占一块，第1行=名称，第2行=URL，第3行起=域名列表
 *   - 多个代理之间用空行分隔
 *   - 以 # 开头的行是注释（整行），会被忽略
 *   - 支持 \r\n 和 \n 换行
 */

// ---- 工具函数 ----

/**
 * 域名去重（不区分大小写，保留首次出现的原写形式）
 * @param {string[]} domains
 * @returns {string[]}
 */
function dedupeDomains(domains) {
  const seen = new Set();
  const result = [];
  for (const d of domains) {
    const key = d.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(d);
    }
  }
  return result;
}

/**
 * 将文本分割为「原始行号 + 内容」的数组，同时处理 \r\n 和注释过滤
 * 保留原始行号用于错误提示
 * @param {string} text
 * @returns {Array<{lineNo: number, content: string}>}
 */
function splitLinesWithNumbers(text) {
  const rawLines = text.replace(/\r/g, '').split('\n');
  const result = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    // 过滤整行注释
    if (line.startsWith('#')) continue;
    result.push({ lineNo: i + 1, content: line });
  }
  return result;
}

// ---- 核心函数 ----

/**
 * 解析文本格式的上游代理配置
 * @param {string} text - 编辑器中的文本内容
 * @returns {Array<{name: string, url: string, domains: string[]}>}
 * @throws {Error} 格式错误时抛出，错误信息包含具体位置和原因
 */
function parse(text) {
  if (!text || !text.trim()) return [];

  const lines = splitLinesWithNumbers(text);
  const proxies = [];
  let i = 0;

  while (i < lines.length) {
    // 跳过连续空行
    if (lines[i].content === '') {
      i++;
      continue;
    }

    // 第 1 行：代理名称
    const nameLine = lines[i];
    const name = nameLine.content;
    if (!name) {
      throw new Error(`第 ${nameLine.lineNo} 行: 代理名称不能为空`);
    }
    i++;

    // 第 2 行：代理 URL
    if (i >= lines.length || lines[i].content === '') {
      throw new Error(`第 ${nameLine.lineNo} 行: 代理 "${name}" 缺少 URL`);
    }
    const urlLine = lines[i];
    const url = urlLine.content;
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`第 ${urlLine.lineNo} 行: 代理 URL 必须以 http:// 或 https:// 开头`);
    }
    i++;

    // 第 3 行起：域名列表（直到空行或结尾）
    const domains = [];
    while (i < lines.length && lines[i].content !== '') {
      const domain = lines[i].content;
      domains.push(domain);
      i++;
    }

    proxies.push({
      name,
      url,
      domains: dedupeDomains(domains),
    });
  }

  // 名称唯一性校验（不区分大小写）
  const nameSet = new Set();
  for (const p of proxies) {
    const key = p.name.toLowerCase();
    if (nameSet.has(key)) {
      throw new Error(`代理名称重复: "${p.name}"（名称不区分大小写）`);
    }
    nameSet.add(key);
  }

  return proxies;
}

/**
 * 将代理数组格式化为文本（不含注释头部）
 * @param {Array<{name: string, url: string, domains: string[]}>} proxies
 * @returns {string}
 */
function format(proxies) {
  if (!proxies || proxies.length === 0) return '';

  const blocks = proxies.map((p) => {
    const lines = [p.name, p.url];
    if (p.domains && p.domains.length > 0) {
      lines.push(...p.domains);
    }
    return lines.join('\n');
  });

  return blocks.join('\n\n');
}

/**
 * 校验代理数组合法性
 * @param {Array<{name: string, url: string, domains: string[]}>} proxies
 * @returns {Array} 返回校验后的 proxies（域名已去重）
 * @throws {Error} 校验失败时抛出
 */
function validate(proxies) {
  if (!Array.isArray(proxies)) {
    throw new Error('代理配置必须是数组');
  }

  const nameSet = new Set();

  return proxies.map((proxy, idx) => {
    const position = `第 ${idx + 1} 个代理`;

    // 名称校验
    const name = (proxy.name || '').trim();
    if (!name) {
      throw new Error(`${position}: 代理名称不能为空`);
    }

    // URL 校验
    const url = (proxy.url || '').trim();
    if (!url) {
      throw new Error(`${position}: 代理 URL 不能为空`);
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`${position}: 代理 URL 必须以 http:// 或 https:// 开头`);
    }

    // 名称唯一性（不区分大小写）
    const key = name.toLowerCase();
    if (nameSet.has(key)) {
      throw new Error(`代理名称重复: "${name}"（名称不区分大小写）`);
    }
    nameSet.add(key);

    // 域名 trim + 去重
    const domains = dedupeDomains(
      (proxy.domains || []).map((d) => (d || '').trim()).filter(Boolean),
    );

    return { name, url, domains };
  });
}

/**
 * 构建编辑器内容（带注释头部 + 当前配置）
 * @param {Array<{name: string, url: string, domains: string[]}>} proxies
 * @returns {string}
 */
function buildEditContent(proxies) {
  const header = [
    '# EasyProxy 上游代理配置',
    '# 格式说明：',
    '#   - 每个代理占一块，第一行是代理名称，第二行是代理地址，第三行起是域名列表',
    '#   - 多个代理之间用空行分隔',
    '#   - 以 # 开头的行是注释，会被忽略',
    '# 示例：',
    '#   corp-proxy',
    '#   http://10.0.0.1:8080',
    '#   github.com',
    '#   google.com',
    '#',
    '#   home-proxy',
    '#   http://192.168.1.100:3128',
    '#   internal.company.com',
  ].join('\n');

  const body = format(proxies);
  if (!body) return header + '\n';
  return header + '\n\n' + body;
}

module.exports = {
  parse,
  format,
  validate,
  buildEditContent,
};
