/**
 * 拦截规则匹配引擎
 *
 * 负责 host + path 模式匹配，返回合并后的动作集合。
 * 支持: 精确匹配、通配符 (*.example.com / *example.com)、正则表达式。
 * 支持正则命名捕获组，用于 proxy_backup 模板变量替换。
 */

// ---- URL 工具 ----

function extractHost(fullUrl) {
  if (!fullUrl) return null;
  try {
    let u = fullUrl;
    if (!/^https?:\/\//i.test(u)) u = `http://${u.replace(/^\/\//, '')}`;
    const url = new URL(u);
    return url.hostname;
  } catch (_e) {
    const m = /(?:https?:\/\/)?([^/:?]+)/i.exec(fullUrl);
    return m ? m[1] : null;
  }
}

function extractPath(fullUrl) {
  if (!fullUrl) return '/';
  try {
    let u = fullUrl;
    if (!/^https?:\/\//i.test(u)) u = `http://${u.replace(/^\/\//, '')}`;
    const url = new URL(u);
    return url.pathname + url.search;
  } catch (_e) {
    const m = /https?:\/\/[^/]+(\/[^\s]*)/i.exec(fullUrl);
    return m ? m[1] : '/';
  }
}

// ---- Host 匹配 ----

/**
 * 判断 hostPattern 是否为正则表达式。
 * 以 ^ 开头、或包含正则元字符 ([, ], (, ), {, }, |, +, ?, <, =) 视为正则。
 */
function isRegexPattern(pattern) {
  if (!pattern) return false;
  // 以 ^ 开头一定是正则
  if (pattern[0] === '^') return true;
  // 包含典型正则元字符（但不是简单的 * 通配符）
  if (/[\\[\](){}|+?<=>!]/.test(pattern)) return true;
  return false;
}

/**
 * 匹配 host 模式。返回 { matched: bool, groups: object|null }。
 * groups 包含正则命名捕获组（用于 proxy_backup 模板替换）。
 */
function matchHost(hostPattern, host) {
  if (!hostPattern || !host) return { matched: false, groups: null };

  // 正则匹配
  if (isRegexPattern(hostPattern)) {
    try {
      const re = new RegExp(hostPattern);
      const m = re.exec(host);
      if (m) {
        return { matched: true, groups: m.groups || null };
      }
      return { matched: false, groups: null };
    } catch (_e) {
      return { matched: false, groups: null };
    }
  }

  // 精确匹配
  if (hostPattern === host) {
    return { matched: true, groups: null };
  }

  // 通配符: *.example.com → 匹配 sub.example.com
  if (hostPattern.startsWith('*.')) {
    const suffix = hostPattern.slice(1); // .example.com
    return { matched: host.endsWith(suffix), groups: null };
  }

  // 通配符: *example.com → 匹配 example.com / sub.example.com /anythingexample.com
  if (hostPattern.startsWith('*')) {
    const rest = hostPattern.slice(1);
    return { matched: host.endsWith(rest) || host === rest, groups: null };
  }

  // clients*.google.com → 通配符在中间
  if (hostPattern.indexOf('*') >= 0) {
    // 转为正则: 将 * 替换为 .*, 转义其他特殊字符
    const reStr = `^${hostPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`;
    try {
      const re = new RegExp(reStr);
      return { matched: re.test(host), groups: null };
    } catch (_e) {
      return { matched: false, groups: null };
    }
  }

  return { matched: false, groups: null };
}

// ---- Path 匹配 ----

/**
 * 匹配 path 模式。返回 bool。
 * "*" 匹配所有路径；其他视为正则。
 */
function matchPath(pathPattern, path) {
  if (!pathPattern) return false;

  // * 匹配所有
  if (pathPattern === '*') return true;

  // 正则匹配
  try {
    const re = new RegExp(pathPattern);
    return re.test(path);
  } catch (_e) {
    // 正则编译失败，尝试精确匹配
    return path === pathPattern;
  }
}

// ---- 核心匹配函数 ----

/**
 * 对给定 host 和 path，在规则集中查找所有匹配的规则。
 * 合并所有匹配的 path pattern 的动作（后匹配的覆盖先匹配的）。
 *
 * @param {string} host - 请求主机名
 * @param {string} path - 请求路径 (含 query string)
 * @param {object} rules - 拦截规则 { hostPattern: { pathPattern: { actions } } }
 * @returns {object|null} { actions: {...}, groups: {...}|null, matches: [...] } 或 null
 */
function matchRules(host, path, rules) {
  if (!rules || typeof rules !== 'object') return null;

  const mergedActions = {};
  const matchedList = [];
  let captureGroups = null;

  for (const hostPattern of Object.keys(rules)) {
    const hostResult = matchHost(hostPattern, host);
    if (!hostResult.matched) continue;

    const pathRules = rules[hostPattern];
    if (!pathRules || typeof pathRules !== 'object') continue;

    // 记录正则捕获组（取最后一个匹配的，通常只有一个正则 host pattern 匹配）
    if (hostResult.groups) {
      captureGroups = hostResult.groups;
    }

    for (const pathPattern of Object.keys(pathRules)) {
      if (!matchPath(pathPattern, path)) continue;

      const actions = pathRules[pathPattern];
      if (!actions || typeof actions !== 'object') continue;

      matchedList.push({
        hostPattern,
        pathPattern,
        actions: { ...actions },
      });

      // 合并动作（后匹配覆盖先匹配，但只合并非 undefined 的字段）
      for (const key of Object.keys(actions)) {
        if (actions[key] !== undefined) {
          mergedActions[key] = actions[key];
        }
      }
    }
  }

  // 过滤掉纯文档字段，得到实际动作
  const docFields = ['desc', 'remark', 'test'];
  const realActions = {};
  for (const key of Object.keys(mergedActions)) {
    if (docFields.indexOf(key) < 0) {
      realActions[key] = mergedActions[key];
    }
  }

  if (Object.keys(realActions).length === 0) return null;

  return {
    actions: realActions,
    groups: captureGroups,
    matches: matchedList,
  };
}

// ---- 模板变量替换 ----

/**
 * 将 ${var} 模板变量用捕获组的值替换。
 * 例如: "${pre}.gvt1.com" + groups: { pre: "rr1" } → "rr1.gvt1.com"
 */
function substituteTemplate(str, groups) {
  if (!str || !groups) return str;
  return str.replace(/\$\{(\w+)\}/g, (match, name) => {
    return groups[name] !== undefined ? groups[name] : match;
  });
}

// ---- 提取所有域名模式 ----

/**
 * 从规则中提取所有唯一的 host 模式，用于生成 whistle 路由规则。
 */
function extractHostPatterns(rules) {
  const set = new Set();
  if (!rules || typeof rules !== 'object') return [];
  for (const hostPattern of Object.keys(rules)) {
    set.add(hostPattern);
  }
  return Array.from(set);
}

module.exports = {
  extractHost,
  extractPath,
  isRegexPattern,
  matchHost,
  matchPath,
  matchRules,
  substituteTemplate,
  extractHostPatterns,
};
