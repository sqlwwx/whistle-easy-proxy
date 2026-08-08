/**
 * 从拦截规则生成 whistle rules.txt 内容。
 *
 * 将每个 host 模式转为 whistle 规则格式:
 *   - 精确域名:  example.com easy-proxy://
 *   - 通配符:    *.example.com easy-proxy://  / *example.com easy-proxy://
 *   - 中间通配:  client*.google.com → /^client.*\.google\.com$/ easy-proxy://
 *   - 正则:      /^pattern$/ easy-proxy://
 */

function isRegexPattern(pattern) {
  if (!pattern) return false;
  if (pattern[0] === '^') return true;
  if (/[\\[\](){}|+?<=>!]/.test(pattern)) return true;
  return false;
}

function hasMiddleWildcard(pattern) {
  // * 不在开头且不是 *. 形式
  if (!pattern || pattern[0] === '*') return false;
  return pattern.indexOf('*') >= 0;
}

function wildcardToRegex(pattern) {
  // 转为 /^...$/ 正则: 转义特殊字符, * → .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return `/^${escaped}$/`;
}

function hostPatternToRule(hostPattern) {
  if (isRegexPattern(hostPattern)) {
    return `/${hostPattern}/ easy-proxy://`;
  }
  if (hasMiddleWildcard(hostPattern)) {
    return `${wildcardToRegex(hostPattern)} easy-proxy://`;
  }
  return `${hostPattern} easy-proxy://`;
}

/**
 * 从拦截规则对象生成 rules.txt 文本。
 */
function generateRulesTxt(rules) {
  const lines = [
    '# EasyProxy — auto-loaded global rules',
    '# Routes interception-rule domains to the easy-proxy plugin protocol,',
    '# which triggers server hook for SNI rewrite / proxy / cache / headers / etc.',
    '# No manual configuration needed. Remove lines to disable per-domain.',
    '',
  ];

  const seen = new Set();
  const categories = {
    GitHub: [],
    Google: [],
    'Microsoft / Docker': [],
    Pixiv: [],
    YouTube: [],
    Steam: [],
    'CDN / 镜像': [],
    其他: [],
  };

  function categorize(pattern) {
    if (/github|githubusercontent|githubassets|gravatar/.test(pattern)) return 'GitHub';
    if (
      /google|googleapis|googleusercontent|gstatic|googlevideo|ggpht|ytimg|recaptcha/.test(pattern)
    )
      return 'Google';
    if (/docker|microsoft|windows/.test(pattern)) return 'Microsoft / Docker';
    if (/pixiv|pximg|nikke/.test(pattern)) return 'Pixiv';
    if (/youtube|youtu\.be|nocookie/.test(pattern)) return 'YouTube';
    if (/steam/.test(pattern)) return 'Steam';
    if (
      /jsdelivr|greasyfork|huggingface|vuejs|elastic|launchpad|openwrt|maven|npm|gvt|loli|ustclug|fastgit|aks\.moe|pai233|incept/.test(
        pattern
      )
    )
      return 'CDN / 镜像';
    return '其他';
  }

  for (const hostPattern of Object.keys(rules || {})) {
    if (seen.has(hostPattern)) continue;
    seen.add(hostPattern);
    const cat = categorize(hostPattern);
    categories[cat].push(hostPatternToRule(hostPattern));
  }

  for (const cat of Object.keys(categories)) {
    if (categories[cat].length === 0) continue;
    lines.push(`# ${cat}`);
    lines.push.apply(lines, categories[cat]);
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { generateRulesTxt, hostPatternToRule };
