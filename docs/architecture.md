# 加速原理与技术说明

本文档详细说明 whistle.easy-proxy 的工作原理和技术实现细节。

## 目录

- [整体架构](#整体架构)
- [IP 选择策略](#ip-选择策略)
- [为什么 SNI 改写默认关闭](#为什么-sni-改写默认关闭)
- [HTTPS 上游代理深度技术分析](#https-上游代理深度技术分析)
- [配置热重载机制](#配置热重载机制)
- [配置验证规则](#配置验证规则)

---

## 整体架构

```
用户请求 github.com
    ↓
┌─ whistle host:// 规则（覆盖 95% 场景）──────────┐
│  DoH 解析真实 IP（绕过 DNS 污染）               │
│  映射到降速域名，走国内 CDN 或最优路由           │
└────────────────────────────────────────────────┘
    ↓（可选）
┌─ SNI 改写钩子（覆盖剩余 5% 场景）──────────────┐
│  直连真实 IP                                    │
│  改写 ClientHello SNI → 绕过 GFW SNI 检测       │
└────────────────────────────────────────────────┘
    ↓
TCP 隧道 → IP 直连 + TLS 握手
```

## IP 选择策略

每个域名有多个候选 IP 来源，按优先级排列：

1. **手动覆盖（Override）** — 用户通过 CLI 或 Web 面板手动指定的 IP，最高优先级
2. **DoH 解析** — 通过 Google/Cloudflare/阿里/DNSPod 的 DoH 服务获取真实 IP
3. **精选预设（Curated）** — 内置的已知可用 IP 列表
4. **缓存（Cached）** — 上次成功解析的 IP，TTL 10 分钟

通过 Web 面板「测速」功能可以对比所有候选 IP 的 TCP 延迟，一目了然。

## 为什么 SNI 改写默认关闭

大部分 GitHub 域名可以通过 whistle `host://` 规则直接映射到真实 IP 完成访问。只有少数域名（如特定 GitHub Pages 子域名）会在直连时被 GFW 通过 SNI 检测拦截。SNI 改写钩子只在这些场景下才需要开启，默认关闭以最小化影响面。

## HTTPS 上游代理深度技术分析

> 这是 whistle 插件架构的深度技术问题。本插件从首个版本起就已正确处理。

### 现象

- 配置上游代理后，HTTP 网站可以正常转发
- HTTPS 网站（如 Google、YouTube 等）超时或返回 502
- 系统返回 "DNS Lookup Failed" 或直接超时

### 技术根因

whistle 插件系统有两种 hook 方式，它们的行为有本质区别：

| Hook 类型 | 对 HTTPS 流量的影响 | `req.setReqRules()` 行为 | `proxy://` 规则生效 |
|-----------|---------------------|--------------------------|-------------------|
| `exports.server` | ❌ 启用插件隧道处理管道 | 被覆盖为 `noop` (空函数) | ❌ 不生效 |
| `exports.init` | ✅ 使用 whistle 原生隧道处理 | 正常生效 | ✅ 生效 |

### 为什么会这样

1. 当插件导出 `exports.server` 时，whistle 认为插件需要"深度参与" HTTP/HTTPS 流量处理
2. whistle 为此启用了完整的**插件隧道处理管道**（Plugin Tunnel Pipe）
3. 在此模式下，`req.setReqRules()`、`req.setResRules()` 等方法被覆盖为 **noop（空函数）**
4. 因此，所有通过 `req.setReqRules()` 设置的 `proxy://` 规则**完全不生效**
5. 没有代理规则时，whistle 尝试直接 DNS 解析被墙域名，导致 "DNS Lookup Failed" 或超时

### 修复方案

```javascript
// ❌ 错误做法：使用 server hook
exports.server = (server, options) => {
  server.on('request', (req, res, next) => {
    // 这里调用 req.setReqRules() 不会生效！
    req.setReqRules('google.com proxy://...'); // ❌ 被忽略
    next();
  });
};

// ✅ 正确做法：使用 init hook
exports.init = (server, options) => {
  // init hook 接收完全相同的参数 (server, options)
  // 但不会启用插件隧道处理管道
  server.on('request', (req, res, next) => {
    req.setReqRules('google.com proxy://...'); // ✅ 正常生效
    next();
  });
};
```

### 注意事项

- **规则格式**：上游代理规则必须使用 `proxy://` 协议格式，而不是 `http://` 或 `https://`
- **同步机制**：EasyProxy 使用 `upstream-proxies` 独立规则集，不会与用户自定义规则冲突

### 验证方法

```bash
# 1. 检查规则集是否启用
easy-proxy rule list | grep -A 2 upstream-proxies

# 2. 确认规则内容是否使用 proxy:// 格式
curl -s http://127.0.0.1:8899/cgi-bin/rules/list | \
  python3 -c "import sys, json; data = json.load(sys.stdin); [print(r['data']) for r in data['list'] if r['name'] == 'upstream-proxies']"

# 3. 测试 HTTPS 连接
curl -v -x http://127.0.0.1:8899 https://www.google.com --max-time 10
```

## 配置热重载机制

通过 Web 面板修改配置会立即生效（无需重启 whistle）。支持以下方式修改配置：

1. **Web 面板**：通过管理面板修改 — 立即生效 ✅
2. **CLI 命令**：通过 `easy-proxy` 命令修改 — 写入配置文件，对新启动的 whistle 进程生效
3. **直接编辑**：直接编辑 `~/.easy-proxy/config.json` — 下次启动 whistle 时加载

> **注意**：CLI 和直接编辑配置文件不会触发热重载。正在运行的 whistle 进程需要重启或通过 Web 面板修改才能生效。

## 配置验证规则

配置加载时会自动验证格式，验证失败时会输出警告但不会阻止加载。验证规则：

- `enabled` 必须是布尔值
- `doh` 必须是对象，其子字段 `bootstrapIp`、`host`、`path` 必须是字符串，`port` 必须是数字
- `ipCacheTtl` 必须是数字
- `sniRewrite` 必须是对象，其子字段 `enabled` 必须是布尔值，`defaultSni` 必须是字符串，`sniMap` 必须是对象
- `hosts` 必须是数组
- `upstreamProxies` 必须是数组
- `proxyBypassDomains` 必须是数组或 `null`
- `interceptEnabled` 必须是布尔值
- `interceptRules` 必须是对象
