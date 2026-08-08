# PLUGIN MODULE KNOWLEDGE BASE

**Generated:** 2026-08-01
**Commit:** 0818aa7
**Scope:** lib/plugin/

## OVERVIEW
Whistle 插件核心逻辑 — HTTP 拦截、DNS 解析、规则生成、SNI 改写、拦截规则执行、Web 管理面板 API。

## STRUCTURE
```
lib/plugin/
├── resolver.js        # DoH 解析 + IP 选择策略 + 延迟测速
├── sni-agent.js       # SNI TLS ClientHello 改写
├── rule-generator.js  # Whistle Host 规则生成
├── rule-engine.js     # 拦截规则匹配与执行
├── rule-actions.js    # 拦截规则动作定义 (JSONP/重定向等)
├── ui.js              # Web 管理面板 API
├── default-hosts.js   # 默认 GitHub 加速域名列表
└── default-rules.js   # 内置拦截规则 (带 test/desc 元数据)
```

## WHERE TO LOOK
| Task | File |
|------|------|
| DoH 解析/IP 选择 | `resolver.js` | 多源 IP 获取、延迟测速、缓存管理 |
| SNI TLS 改写 | `sni-agent.js` | 修改 ClientHello SNI、绕过 SNI 检测 |
| Host 规则生成 | `rule-generator.js` | whistle host:// 规则生成器 |
| 拦截规则执行 | `rule-engine.js` | 域名/路径模式匹配、动作分发 |
| 规则动作定义 | `rule-actions.js` | JSONP 过滤、重定向等具体动作 |
| Web UI API | `ui.js` | 管理面板后端 HTTP 接口 |
| 默认加速域名 | `default-hosts.js` | GitHub 相关域名列表 |
| 默认拦截规则 | `default-rules.js` | 80+ 条内置拦截规则 |

## CONVENTIONS
- **规则优先级**: Hosts 手动覆盖 > DoH 解析 > 精选预设 > 缓存
- **IP 缓存 TTL**: 10 分钟，可通过配置 `ipCacheTtl` 修改
- **热重载**: 配置文件修改后所有模块自动重新加载（通过文件监听实现）
- **异步刷新**: resolver.js 同步返回缓存/预设值，后台异步刷新 DoH，不阻塞请求
- **优雅降级**: DoH 失败时降级到预设 IP，确保可用性

## FLOW
1. 请求进入 whistle → 规则生成器匹配域名
2. resolver.js 同步返回缓存/预设 IP → 后台异步刷新 DoH
3. IP 选择策略：延迟测速选最优候选 IP
4. 如需 SNI 改写 → sni-agent.js 修改 TLS ClientHello
5. 拦截规则引擎匹配路径 → 执行 rule-actions.js 定义的动作
6. Web UI 通过 ui.js 暴露的 API 管理配置

## IP SELECTION STRATEGY
```
优先级从高到低:
1. 手动覆盖 (config.hosts) → 用户指定的域名→IP映射
2. DoH 解析 (DNS over HTTPS) → 通过 dns.google 获取真实 IP
3. 精选预设 (curated) → 内置的已知可用 IP 列表
4. 缓存 (cached) → 上次成功解析的 IP
```

## 开发原则审视

### ✅ 做得好的地方
| 原则 | 表现 |
|------|------|
| **单一职责** ✅ 优秀 | 每个文件职责高度内聚：resolver.js 只做 DoH/IP 选择，sni-agent.js 只做 TLS 改写，rule-engine.js 只做规则匹配 |
| **优化常见场景** ✅ 优秀 | resolver.js 同步返回缓存/预设值，后台异步刷新 DoH，避免常见请求被网络 IO 阻塞 |
| **先跑通再优化** ✅ 优秀 | DoH 失败时优雅降级到 curated 预设 IP，确保功能可用性优先 |
| **靠测量不靠猜** | 内置 TCP 延迟测量，为每个域名自动选择最快 IP |
| **不破坏现有用户** | 配置升级通过 deepMerge 实现，新增字段有合理默认值 |

### ⚠️ 待改进项
- **Promise 错误吞噬**: resolver.js 中 `refresh(host).catch(() => {})` - Promise 错误被静默吞噬，建议添加 debug 日志
- **错误日志**: ui.js 和 sni-agent.js 中仍有静默 catch 块，建议添加 debug 日志提升可观测性
- **测试覆盖**: 规则引擎匹配逻辑较复杂，可考虑添加更详细的测试用例（嵌入式或外部）
