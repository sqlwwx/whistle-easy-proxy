/**
 * 上游代理配置编辑器解析模块
 * 纯函数：parse / format / validate / buildEditContent
 *
 * 文本格式约定：
 *   - 每个代理占一块，第1行=名称，第2行=URL，第3行起=域名列表
 *   - 多个代理之间用空行分隔
 *   - 以 # 开头的行是注释（整行），会被忽略
 *   - URL 行前加 # 注释（如 `# http://...`）可停用该代理，块结构保留，重新编辑时仍显示
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
 * 将文本分割为「原始行号 + 内容 + 是否注释」的数组，同时处理 \r\n
 * 保留注释行（标记 isComment），用于识别「注释掉的代理地址」来停用代理
 * 保留原始行号用于错误提示
 * @param {string} text
 * @returns {Array<{lineNo: number, content: string, isComment: boolean}>}
 */
function splitLinesWithNumbers(text) {
  const rawLines = text.replace(/\r/g, '').split('\n');
  const result = [];
  for (let i = 0; i < rawLines.length; i++) {
    const content = rawLines[i].trim();
    result.push({ lineNo: i + 1, content, isComment: content.startsWith('#') });
  }
  return result;
}

// ---- 核心函数 ----

/**
 * 解析文本格式的上游代理配置
 * @param {string} text - 编辑器中的文本内容
 * @returns {Array<{name: string, url: string, domains: string[], disabled?: boolean}>}
 * @throws {Error} 格式错误时抛出，错误信息包含具体位置和原因
 */
function parse(text) {
  if (!text || !text.trim()) return [];

  const lines = splitLinesWithNumbers(text);
  const proxies = [];
  let i = 0;

  while (i < lines.length) {
    // 跳过连续空行和注释行（块开始前的注释）
    while (i < lines.length && (lines[i].content === '' || lines[i].isComment)) {
      i++;
    }
    if (i >= lines.length) break;

    // 第 1 行：代理名称
    const nameLine = lines[i];
    const name = nameLine.content;
    i++;

    // 第 2 行起：地址行 + 域名行（直到空行或结尾）
    // 地址行：以 http(s):// 开头的行；被 # 注释的为备用地址，未注释的为生效地址
    // 域名行：其他非空、非注释的行
    const addresses = [];
    const domains = [];
    while (i < lines.length && lines[i].content !== '') {
      const line = lines[i];
      if (line.isComment) {
        const candidate = line.content.replace(/^#+\s*/, '');
        if (/^https?:\/\//i.test(candidate)) {
          addresses.push({ value: candidate, disabled: true });
        }
        // 普通注释行忽略
      } else if (/^https?:\/\//i.test(line.content)) {
        addresses.push({ value: line.content, disabled: false });
      } else {
        domains.push(line.content);
      }
      i++;
    }

    const activeUrls = addresses.filter((a) => !a.disabled);
    const disabledUrls = addresses.filter((a) => a.disabled).map((a) => a.value);
    if (activeUrls.length === 0 && disabledUrls.length === 0) {
      throw new Error(`第 ${nameLine.lineNo} 行: 代理 "${name}" 缺少 URL`);
    }
    if (activeUrls.length > 1) {
      throw new Error(
        `第 ${nameLine.lineNo} 行: 代理 "${name}" 有多个生效地址，只能有一个（其余用 # 注释）`
      );
    }

    // 未注释地址为生效地址；全被注释则整个代理停用
    const disabled = activeUrls.length === 0;
    const url = activeUrls.length > 0 ? activeUrls[0].value : disabledUrls[0];

    proxies.push({
      name,
      url,
      domains: dedupeDomains(domains),
      ...(disabledUrls.length > 0 ? { disabledUrls } : {}),
      ...(disabled ? { disabled: true } : {}),
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
 * 地址输出顺序：备用地址（disabledUrls，以 `# ` 前缀）→ 生效地址（url，仅非停用）
 * 停用的代理（disabled）其地址全部以 `# ` 前缀输出，重新解析后可恢复
 * @param {Array<{name: string, url: string, domains: string[], disabled?: boolean, disabledUrls?: string[]}>} proxies
 * @returns {string}
 */
function format(proxies) {
  if (!proxies || proxies.length === 0) return '';

  const blocks = proxies.map((p) => {
    const addrLines = (p.disabledUrls || []).map((u) => `# ${u}`);
    if (p.disabled) {
      // 兼容旧数据：无 disabledUrls 时，用 url 作为注释地址输出
      if (addrLines.length === 0 && p.url) addrLines.push(`# ${p.url}`);
    } else if (p.url) {
      addrLines.push(p.url);
    }
    const lines = [p.name, ...addrLines];
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
      (proxy.domains || []).map((d) => (d || '').trim()).filter(Boolean)
    );

    // 备用地址 trim + 去重
    const disabledUrls = dedupeDomains(
      (proxy.disabledUrls || []).map((d) => (d || '').trim()).filter(Boolean)
    );

    return {
      name,
      url,
      domains,
      ...(disabledUrls.length > 0 ? { disabledUrls } : {}),
      ...(proxy.disabled ? { disabled: true } : {}),
    };
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
    '#   - 每个代理占一块，第一行是代理名称，其后是代理地址行（可多行），最后是域名列表',
    '#   - 地址行以 http:// 或 https:// 开头；# 注释掉的为备用地址，未注释的为生效地址',
    '#   - 多个代理之间用空行分隔',
    '#   - 以 # 开头的行是注释，会被忽略',
    '#   - 所有地址都被注释 = 停用该代理（块会保留，可随时恢复）',
    '# 示例：',
    '#   corp-proxy',
    '#   http://10.0.0.1:8080',
    '#   github.com',
    '#   google.com',
    '#',
    '#   home-proxy',
    '#   # http://192.168.1.100:3128',
    '#   http://192.168.1.101:3128',
    '#   internal.company.com',
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
