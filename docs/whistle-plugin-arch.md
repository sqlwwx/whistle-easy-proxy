# Whistle 插件架构深度解析

> **重要发现**：whistle 插件的 `exports.server` hook 会严重影响 HTTPS 代理规则的行为。
>
> 这是 whistle 设计上的一个隐藏陷阱，几乎没有官方文档说明。

## 目录

- [问题现象](#问题现象)
- [根本原因分析](#根本原因分析)
- [Hook 类型对比](#hook-类型对比)
- [源码级验证](#源码级验证)
- [修复方案](#修复方案)
- [最佳实践](#最佳实践)

---

## 问题现象

### 症状

配置上游代理后，出现以下问题：

1. **HTTP 网站正常**：`http://example.com` 可以正常通过代理访问
2. **HTTPS 网站超时/502**：`https://google.com` 超时或返回 502
3. **"DNS Lookup Failed"**：部分场景下出现 DNS 解析失败错误

### 复现步骤

```bash
# 1. 添加上游代理（打开编辑器配置代理和域名）
easy-proxy proxy upstream edit
# （编辑器中输入代理名称、URL 和绑定域名，保存即可）

# 2. 启动 whistle
easy-proxy start

# 3. 测试 HTTP ✅ 正常
curl -x http://127.0.0.1:8899 http://example.com  # 200 OK

# 4. 测试 HTTPS ❌ 超时
curl -x http://127.0.0.1:8899 https://google.com  # 超时/502
```

---

## 根本原因分析

### 关键发现

whistle 插件系统中存在两种初始化方式，它们对 `req.setReqRules()` 的行为有本质影响：

| Hook 类型 | 启用隧道管道 | `req.setReqRules()` 行为 | `proxy://` 规则生效 |
|-----------|------------|--------------------------|-------------------|
| `exports.server` | ✅ 启用 | 被覆盖为 **noop (空函数)** | ❌ **不生效** |
| `exports.init` | ❌ 不启用 | **正常工作** | ✅ **生效** |

### 深入机制

#### 1. 检测到 `exports.server` 后的 whistle 行为

当插件导出 `exports.server` 时，whistle 会：

1. 标记此插件需要"完全控制" HTTP/HTTPS 流量
2. 启用**插件隧道处理管道**（Tunnel Pipe）
3. 加载一系列 tunnel hooks 来处理 HTTPS CONNECT 请求

#### 2. Tunnel Hook 中的覆盖逻辑

在 `whistle/lib/plugins/load-plugin.js` 的 `server.on('connect')` 事件中：

```javascript
// line 2439-2443 (approximate)
case PLUGIN_HOOKS.TUNNEL:
  if (tunnelServer) {
    initConnectReq(req, socket);
    req.sendEstablished(function () {
      var reqRules;
      // ⚠️  关键问题：setReqRules 被覆盖为 noop
      req.setRules = req.setReqRules = socket.setReqRules = function (rules) {
        reqRules = rules;  // 仅在本地存储，不传给 whistle 核心
        return true;
      };
      socket.setRules = req.setResRules = socket.setResRules = noop;
      // ...
    });
  }
```

**后果**：
- 插件代码中调用 `req.setReqRules('google.com proxy://...')` **不会报错**
- 但规则只存在于闭包变量 `reqRules` 中
- **whistle 核心永远收不到这个规则**
- 最终 whistle 尝试**直连** google.com → 超时/被墙

#### 3. `exports.init` 的优势

`exports.init` hook 有以下特点：
1. 接收的参数完全相同：`(server, options)`
2. 可以用完全相同的方式：`server.on('request', handler)`
3. **不会**触发 tunnel hooks 的加载
4. **不会**覆盖 `req.setReqRules()` 方法
5. 规则可以正常传递到 whistle 核心

---

## Hook 类型对比

### 功能对比表

| 功能 | `exports.init` | `exports.server` |
|------|---------------|-----------------|
| 接收 server 对象 | ✅ | ✅ |
| 接收 options 对象 | ✅ | ✅ |
| 可以监听 `request` 事件 | ✅ | ✅ |
| 可以监听 `upgrade` 事件 | ✅ | ✅ |
| `req.setReqRules()` 生效 | ✅ | ❌ |
| 可以设置 upstream proxy 规则 | ✅ | ❌ |
| HTTPS CONNECT 走代理规则 | ✅ | ❌ |
| 可以启用 tunnel 相关 hooks | ❌ | ✅ |
| 可以做 HTTPS 解密中间人 | ❌ | ✅ |

### 适用场景

#### 使用 `exports.init` 的场景（推荐）

- 规则管理类插件（添加/管理代理规则）
- DNS 解析类插件（如 DoH）
- Hosts 管理类插件
- 不需要解密 HTTPS 流量的插件
- **需要使用 `proxy://` 上游代理的插件**

#### 使用 `exports.server` 的场景（谨慎）

- 需要做 HTTPS 解密/中间人
- 需要修改 HTTPS 请求/响应内容
- 需要精细控制 TLS 握手
- 需要自定义隧道协议处理

---

## 源码级验证

### 1. 检测 `hasServer` 的逻辑

```javascript
// whistle/lib/plugins/load-plugin.js line 1701-1723
var hasServer =
  execAuth ||
  sniCallback ||
  startServer ||           // ← exports.server
  startStatsServer ||
  startResStatsServer ||
  startUIServer ||
  startRulesServer ||
  startResRulesServer ||
  startTunnelRulesServer ||
  startTunnelServer ||     // ← 隧道服务器
  startReqRead ||
  startReqWrite ||
  startResRead ||
  startResWrite ||
  // ... 更多 tunnel hooks
```

### 2. 覆盖 `setReqRules` 的具体位置

```javascript
// whistle/lib/plugins/load-plugin.js line 2439-2442
req.setRules = req.setReqRules = socket.setReqRules = function (rules) {
  reqRules = rules;  // 仅存储在闭包中，不传递给核心
  return true;
};
socket.setRules = req.setResRules = socket.setResRules = noop;
```

### 3. 为什么 HTTP 还能工作？

HTTP 请求不经过 CONNECT 隧道，走的是普通 HTTP 处理管道：

```
浏览器 → CONNECT 不适用 → HTTP 处理管道 → 规则正常应用 → 上游代理
```

而 HTTPS 走：
```
浏览器 → CONNECT 请求 → Tunnel Hook 处理 → setReqRules 被覆盖 → 规则丢失 → 直连 → 超时/被墙
```

---

## 修复方案

### EasyProxy 中的具体修复

```javascript
// ❌ 修复前 (index.js)
exports.server = (server, options) => {
  const config = loadConfig(options);
  resolver.setConfig(config);

  server.on('request', (req, client, next) => {
    handleProxy(req, client, next, options, config);
    // 这里设置的 proxy:// 规则不会生效 ❌
  });
};

// ✅ 修复后 (index.js)
exports.init = (server, options) => {
  const config = loadConfig(options);
  resolver.setConfig(config);

  server.on('request', (req, client, next) => {
    handleProxy(req, client, next, options, config);
    // 这里设置的 proxy:// 规则正常生效 ✅
  });
};
```

### 上游代理规则格式修复

```javascript
// ❌ 修复前
function toProxyProtocol(url) {
  return url.replace(/^https:\/\//, 'http://');  // 保留 http:// 格式
}

// ✅ 修复后
function toProxyProtocol(url) {
  return url.replace(/^https?:\/\//, 'proxy://');  // 统一为 proxy:// 格式
}
```

---

## 最佳实践

### 插件开发建议

1. **优先使用 `exports.init`**
   - 除非你真的需要做 HTTPS 中间人
   - 否则一律用 `init` hook

2. **需要 `server` hook 时的注意事项**
   - 理解你的规则不会自动应用
   - 需要自己通过 `req.request()` 手动处理代理逻辑
   - 不要依赖 `req.setReqRules()` 设置 `proxy://` 规则

3. **上游代理插件**
   - 千万不要用 `exports.server`
   - 一定要用 `exports.init`
   - 规则必须用 `proxy://` 格式

### 调试技巧

1. **验证规则是否生效**

```bash
# 查看当前所有规则集及选中状态
curl -s http://127.0.0.1:8899/cgi-bin/rules/list | python3 -m json.tool
```

2. **检查规则是否应用到具体请求**

```bash
# 在 whistle Web 面板查看抓包结果
open http://127.0.0.1:8899/
```

3. **绕过 whistle 直接测试代理**

```bash
# 直接测试上游代理（验证代理本身可用）
curl -x http://127.0.0.1:7890 https://google.com
```

---

## 参考信息

### whistle 版本

此行为在 whistle v2.10.6 - v2.10.7 版本中验证存在。
更早版本可能存在相同问题，后续版本可能也会保持此行为。

### 相关文件

```
whistle/lib/plugins/load-plugin.js
  └── server.on('connect', ...)  # line 2407 附近
      └── req.setReqRules = function(rules) { reqRules = rules }  # line 2439
```

---

## 为什么会有这个设计？

whistle 这样设计的可能原因：

1. **隔离**：插件自己管理的隧道请求，应该由插件自己决定如何转发
2. **灵活性**：插件可以完全控制连接的建立过程
3. **安全性**：防止插件无意中转发敏感流量

但是，没有文档说明这个行为导致了：
- 插件开发者难以发现问题
- 调试成本极高
- 需要深入源码才能理解

---

**总结**：开发 whistle 插件时，除非你明确知道自己需要做 HTTPS 中间人，否则永远使用 `exports.init`，不要使用 `exports.server`。
