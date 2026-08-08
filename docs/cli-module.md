# CLI MODULE KNOWLEDGE BASE

**Generated:** 2026-08-01
**Commit:** 0818aa7
**Scope:** lib/cli/

## OVERVIEW
命令行工具子模块 — 按命令拆分的独立实现、Whistle API 封装、上游代理管理、Bypass 域名配置、离线规则集文件操作。

## STRUCTURE
```
lib/cli/
├── commands/          # 按命令拆分的独立模块 (12 个文件)
│   ├── start.js       # start/stop/w2 命令
│   ├── accel.js       # GitHub 加速 + SNI 改写
│   ├── host.js        # Hosts 手动覆盖
│   ├── rule.js        # Whistle 规则集管理
│   ├── proxy.js       # 系统代理 + 上游代理 + Bypass
│   ├── cert.js        # 证书安装与检查
│   ├── health.js      # 综合健康检查
│   ├── status.js      # EasyProxy 状态
│   ├── network.js     # 网络工具 (IP/延迟检测)
│   ├── config-cmd.js  # 配置管理
│   ├── intercept.js   # 拦截规则管理
│   └── index.js       # 命令注册入口
├── helpers.js         # 通用工具函数
├── debug.js           # 调试日志工具
├── rule-api.js        # Whistle API 封装
├── rules-file.js      # 离线规则集文件操作
├── upstream-proxy.js  # 上游代理管理
├── proxy-config.js    # Bypass 域名配置
└── bypass-domains.js  # 默认 Bypass 列表
```

## WHERE TO LOOK
| Task | File |
|------|------|
| CLI 命令注册 | `commands/index.js` | `registerAllCommands()` 入口 |
| Whistle 规则集 CRUD | `rule-api.js` | HTTP API 封装 |
| 离线规则集文件操作 | `rules-file.js` | 文件系统读写 |
| 上游代理管理 | `upstream-proxy.js` | 配置、域名绑定、同步到 whistle |
| Bypass 域名配置 | `proxy-config.js` | 跳过代理列表管理 |
| 默认 Bypass 列表 | `bypass-domains.js` | 内置域名列表 |
| 通用工具 | `helpers.js` | whistle 状态检查、输出格式化 |
| 调试日志 | `debug.js` | 统一 debug 输出工具 |

## CONVENTIONS
- **静默同步**: whistle 未运行时跳过规则同步，不报错
- **规则集分组**: 使用首字符 ASCII 13（回车符）标记分组边界
- **系统 vs 用户**: `upstream-proxies` 为系统规则集，用户规则在自定义组
- **命令分层**: proxy 命令有子命令（on/off/bypass/upstream），使用 commander 的 `.command()` 链式调用
- **多选模式**: 启用规则集前自动开启 whistle 多选模式，避免取消其他规则

## RULE-API.JS METHODS
- `listRulesets()` — 获取所有规则集状态（whistle API）
- `addRuleset(name, content, group?)` — 创建/更新规则集
- `removeRuleset(name)` — 删除规则集
- `selectRuleset(name, value)` — 启用规则集（先开多选模式）
- `unselectRuleset(name, value)` — 禁用规则集
- `enableDefault()` / `disableDefault()` — 切换默认规则
- `createGroup(name)` — 创建规则分组
- `syncOfflineRulesToWhistle()` — 同步本地规则到 whistle

## OFFLINE RULES METHODS (rules-file.js)
- `loadOfflineRulesets()` — 加载所有离线规则集
- `getOfflineRuleset(name)` — 读取单个规则集
- `saveOfflineRuleset(name, content, enabled, group)` — 保存规则集
- `deleteOfflineRuleset(name)` — 删除规则集
- `getOfflineDefaultRules()` / `saveOfflineDefaultRules(content)` — Default 规则操作

## UPSTREAM-PROXY.JS FLOW
1. 配置保存在 `~/.easy-proxy/config.json`
2. 每个代理可绑定多个域名
3. `syncToWhistle()` 自动生成 `proxy://` 规则
4. 启动 whistle 时自动同步，未运行时可手动 `easy-proxy proxy upstream sync`

## 开发原则审视

### ✅ 做得好的地方
| 原则 | 表现 |
|------|------|
| **单一职责** ✅ 优秀 | 每个命令独立文件；rule-api.js 只做 API 封装；upstream-proxy.js 只做代理管理；helpers.js 只做通用工具 |
| **零前置 IO** ✅ 已优化 | `getWhistleStatus()` 有 1 秒内存缓存，避免频繁 execSync 调用 |
| **对贡献开放** | 函数命名清晰，模块边界明确，易于扩展新 CLI 命令 |
| **优雅降级** | whistle 未运行时跳过同步而非抛出错误 |

### ⚠️ 注意事项
- **静默同步**: "whistle 未运行时跳过规则同步"是好的降级策略，但应给用户更明确的提示（如 `info: whistle 未运行，跳过同步`）
- **命令一致性**: 新增命令时应遵循 `checkWhistleRunning()` / `warnWhistleNotRunning()` 的模式，保持用户体验一致
