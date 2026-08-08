# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-01
**Commit:** 0818aa7
**Branch:** master

## OVERVIEW
whistle.easy-proxy — whistle 代理插件 + CLI 工具，提供 GitHub 加速、SNI 改写、Hosts 管理、上游代理、拦截规则等功能。纯 JavaScript 实现，Node.js >= 24.0.0。

## STRUCTURE
```
./
├── bin/                  # CLI 入口脚本 (15 行，仅编排)
├── lib/                  # 核心代码
│   ├── cli/              # CLI 子模块
│   │   ├── commands/     # 按命令拆分的独立模块 (12 个文件)
│   │   ├── helpers.js    # 通用工具函数
│   │   ├── debug.js      # 调试日志工具
│   │   ├── rule-api.js   # Whistle API 封装
│   │   ├── rules-file.js # 离线规则集文件操作
│   │   ├── upstream-proxy.js  # 上游代理管理
│   │   ├── proxy-config.js    # Bypass 域名配置
│   │   └── bypass-domains.js  # 默认 Bypass 列表
│   └── plugin/           # whistle 插件逻辑
├── index.js              # 插件主入口
└── package.json          # 项目配置
```

## 架构特征

### 📁 目录结构
| 标准做法 | 本项目 | 说明 |
|----------|--------|------|
| `src/` 源码目录 | `lib/` | 使用 `lib/` 而非 `src/`（whistle 插件社区约定） |
| 插件入口在 `src/` 下 | 根目录 `index.js` | 插件入口放置在根目录（whistle 插件标准） |
| CLI 主流程与实现分离 | ✅ 已完成 | bin/easy-proxy.js 仅 15 行做编排，具体实现在 lib/cli/commands/ |

### ⚙️ 架构设计
1. **双入口共享核心模块**:
   - `index.js`（插件）和 `bin/easy-proxy.js`（CLI）同时 `require('./lib/config')`
   - 配置模块同时服务两个独立运行时

2. **扁平模块架构**:
   - 无复杂的 `domain/`、`infra/`、`application/` 分层
   - 按功能职责扁平放置在 `lib/` 和 `lib/plugin/` 下
   - **设计意图**: 保持简单，适应 whistle 插件的约束环境

3. **插件即 CLI**:
   - 同一个 npm 包既是 whistle 插件又是 CLI 工具
   - 通过 `package.json` 的 `bin` 和 whistle 的插件机制双暴露

4. **单一职责已落地** ✅:
   - `config.js` 只做配置读写
   - `rules-file.js` 独立处理离线规则集文件操作
   - 每个 CLI 命令独立文件

### 📦 依赖与构建
- **无 TypeScript**: 纯 JavaScript 实现（Node.js >= 24.0.0）
- **零开发依赖**: 无 ESLint、Prettier、测试框架
- **无构建步骤**: 源码直接运行，无需编译转译
- **无 package.json scripts**: 缺少 `test`、`lint`、`build` 等标准脚本

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| 插件主逻辑 | `index.js` | whistle 插件入口、HTTP 拦截、规则生成 |
| GitHub 加速/DoH | `lib/plugin/resolver.js` | DNS 解析、IP 选择策略 |
| SNI 改写 | `lib/plugin/sni-agent.js` | TLS ClientHello 修改 |
| CLI 入口 | `bin/easy-proxy.js` | 仅编排 (15 行)，注册所有命令 |
| CLI 命令实现 | `lib/cli/commands/` | 12 个独立命令文件，按功能拆分 |
| 配置管理 | `lib/config.js` | 加载/保存、热重载、校验 |
| 离线规则集文件 | `lib/cli/rules-file.js` | 规则集文件 CRUD |
| 规则生成 | `lib/plugin/rule-generator.js` | whistle host 规则生成 |
| 规则引擎 | `lib/plugin/rule-engine.js` | 拦截规则执行 |
| Web UI API | `lib/plugin/ui.js` | 管理面板后端接口 |
| 默认 Hosts | `lib/plugin/default-hosts.js` | 内置域名列表 |
| 默认拦截规则 | `lib/plugin/default-rules.js` | 内置拦截规则 |
| Whistle API 封装 | `lib/cli/rule-api.js` | 规则集 CRUD、选中/取消 |
| 上游代理 | `lib/cli/upstream-proxy.js` | 代理配置、域名绑定、同步到 whistle |
| Bypass 域名 | `lib/cli/proxy-config.js` / `bypass-domains.js` | 跳过代理列表管理 |
| 证书检查 | `lib/cert-check.js` | 安装状态、有效期、信任检查 |
| 代理检查 | `lib/proxy-check.js` | 系统代理状态验证 |
| 网络工具 | `lib/network-utils.js` | IP 获取、延迟检测 |
| 调试日志 | `lib/debug.js` | 统一 debug 输出工具 |
| CLI 通用工具 | `lib/cli/helpers.js` | 状态检查、输出格式化 |

## CONVENTIONS
- **源码目录**: `lib/`（非标准 `src/`，whistle 插件社区约定）
- **入口文件**: 根目录 `index.js`（whistle 插件标准做法）
- **用户配置**: `~/.easy-proxy/config.json`（不在项目源码中，跨安装持久化）
- **配置热重载**: 所有模块启动文件监听，修改后自动生效
- **存储策略**: 文件是唯一数据源，whistle storage 仅做同步备份
- **无 Linter/Formatter**: 纯 JS 项目，无 ESLint/Prettier 配置
- **编码风格（从源码推断）**: 2 空格缩进、单引号、无分号、中文注释、`'use strict'` 开头
- **测试策略**: 无传统测试框架，采用"嵌入式验证策略"
- **零开发依赖**: 仅 3 个运行时依赖，无 devDependencies
- **防御式编程**: 全链路 try-catch + 优雅降级，优先保证服务可用性
- **无 CI/CD**: 项目目前无 GitHub Actions 或其他 CI 配置
- **零 npm scripts**: package.json 无 scripts 字段，无标准命令入口

## ANTI-PATTERNS (THIS PROJECT)
- **无明确禁止模式标记**: 代码库未使用 `DO NOT`/`NEVER`/`ALWAYS` 标记反模式
- **.gitignore 不完整**: 仅忽略 `.omo/`，缺少 `node_modules/`、`*.log` 等标准忽略项
- **无 package.json scripts**: 缺少 `test`、`lint`、`build` 等标准脚本字段
- **无 Linter/Formatter**: 纯 JS 项目，无 ESLint/Prettier 配置
- **剩余静默错误**: 部分文件仍有 `catch (e) { /* ignore */ }`，但 config.js 已改用 debug 日志
- **Promise 错误吞噬**: `lib/plugin/resolver.js` 中 `refresh(host).catch(() => {})` 未记录日志

## UNIQUE STYLES
- **规则分组标记**: 规则集名首字符 ASCII 13（回车符）作为组边界标记
- **系统 vs 用户规则**: `upstream-proxies` 系统组 vs 用户自定义组
- **静默同步**: whistle 未运行时跳过规则同步，不报错
- **降级域名映射**: 将复杂域名映射到易路由的国内 CDN 域名

## COMMANDS
```bash
# 开发
npm link            # 链接到全局（开发插件时需要）

# 常用
easy-proxy start --init      # 启动 whistle（自动设代理+装证书）
easy-proxy stop              # 停止 whistle
easy-proxy accel on          # 开启 GitHub 加速
easy-proxy accel sni on      # 启用 SNI 改写
easy-proxy proxy on          # 开启系统代理
easy-proxy cert install      # 安装根证书
easy-proxy health            # 综合健康检查

# 管理
easy-proxy host add <域名> <IP>
easy-proxy rule list
easy-proxy proxy upstream edit                # 编辑上游代理配置
```

## TEST STRATEGY
项目采用**"嵌入式验证策略"（测试即功能）**替代传统单元测试框架：

| 机制 | 位置 | 说明 |
|------|------|------|
| 配置验证 | `lib/config.js` | `validateConfig()` 运行时类型检查，**9 项配置校验** |
| 规则自校验 | `lib/plugin/rule-engine.js` | Host/Path 模式匹配内置边界条件处理 |
| 规则内嵌测试 URL | `lib/plugin/default-rules.js` | 每条规则可选 `test`/`desc`/`remark` 字段，执行时忽略 |
| CLI 健康检查 | `lib/cli/commands/` | `health`/`status`/`network delay` / `cert check` 等 **8 个诊断命令** |
| 断言式输出 | `lib/cli/helpers.js` | ✔ ok / ✖ err / ⚠ warn / ℹ info **四级输出** |
| 降级式错误处理 | 全局 | 全链路 try-catch + 优雅降级，失败时静默回退 |
| 网络延迟检测 | `lib/network-utils.js` | TCP 连接延迟测量，DoH 失败降级到预设 IP |

**设计哲学**: "测试即功能" - 健康检查、状态诊断作为面向用户的 CLI 功能提供。用户使用的每个诊断命令就是系统测试。没有独立于代码的测试套件，验证逻辑直接内建于生产代码中。

## CI/CD STATUS
- **无 GitHub Actions**: 未配置自动化测试、构建、发布流程
- **无其他 CI 系统**: 无 Travis/CircleCI/GitLab CI/Jenkins 配置
- **零构建工具**: 无 Make、无编译、无转译（纯 JavaScript）
- **零开发依赖**: package.json 无 `devDependencies` 字段
- **手动发布**: 手动 npm publish

**项目设计哲学**: 完全没有 CI/CD 配置和构建系统。采用"测试即功能"的嵌入式测试策略，通过 CLI 健康检查命令替代传统单元测试框架，不依赖外部 CI 系统。

## 开发原则审视 (基于 Matteo Collina 开放式工程原则)

### ✅ 做得好的地方

| 原则 | 表现 | 位置 |
|------|------|------|
| **简单优先** | 纯 JavaScript 实现，无编译/转译步骤；直接利用 whistle 插件机制，不重复造轮子 | 全局 |
| **先跑通，再优化** | DoH 解析失败时优雅降级到预设 IP，保证功能可用；全链路 try-catch 防御式编程 | `lib/plugin/resolver.js`, `lib/config.js` |
| **优化常见场景** | IP 缓存 TTL 10分钟，避免重复 DoH 请求；同步 resolve() 立即返回，后台异步刷新；getWhistleStatus 1秒缓存 | `lib/plugin/resolver.js`, `lib/cli/helpers.js` |
| **不破坏现有用户** | deepMerge 配置合并策略，新增字段有默认值；旧配置文件可无缝升级 | `lib/config.js` |
| **靠测量，不靠猜** | 内置 TCP 延迟测量；9 项配置验证规则；健康检查命令诊断系统状态 | `lib/plugin/resolver.js`, `lib/cli/commands/` |
| **单一职责** ✅ 显著改进 | CLI 已拆分为 12 个独立命令文件；config.js 已剥离规则集操作；rules-file.js 独立处理规则文件 | `lib/cli/commands/`, `lib/cli/rules-file.js` |
| **对贡献开放** | 代码有充分注释说明"为什么"；模块职责清晰，易于扩展新功能 | 全局 |

### ✅ 已完成改进项

| 优先级 | 任务 | 状态 | 影响 |
|--------|------|------|------|
| P0 | 拆分 bin/easy-proxy.js 到 lib/cli/commands/ | ✅ 完成 | 981 行 → 15 行，12 个独立命令文件，可维护性大幅提升 |
| P1 | 提取 config.js 规则集操作到独立文件 | ✅ 完成 | rules-file.js 已创建，config.js 职责单一化 |
| P2 | getWhistleStatus 加缓存 | ✅ 完成 | 1 秒内存缓存，避免频繁 execSync |
| P3 | 删除重复 ensureDir | ✅ 完成 | 代码整洁 |
| P4 | 添加错误日志 | ✅ 部分完成 | config.js 已改用 debug 日志 |

### ⚠️ 剩余待改进项

#### 1. Promise 错误吞噬
**问题**: `lib/plugin/resolver.js` 中 `refresh(host).catch(() => {})` - Promise 错误被静默吞噬。

**开发原则影响**: 违反"靠测量不靠猜"，DoH 刷新失败无法定位原因。

**改进建议**: 添加 debug 日志：
```javascript
refresh(host).catch((e) => debug('refresh failed:', host, e.message))
```

#### 2. 剩余静默错误
**问题**: 以下文件仍有静默 catch：
- `lib/plugin/ui.js:21` - `catch (e) { resolve({}); }`
- `lib/plugin/sni-agent.js:44` - `catch (e) { /* ignore */ }`
- `lib/cli/helpers.js:88` - `catch (e) { /* ignore */ }`
- `lib/cli/commands/start.js:38` - `catch (e) { /* ignore duplicate */ }`

**开发原则影响**: 影响可观测性，调试困难。

**改进建议**: 对这些 catch 块添加 debug 日志。

### 📊 代码质量评分 (满分10)

| 维度 | 评分 | 趋势 | 说明 |
|------|------|------|------|
| 简单性 | 8 | → | 整体架构简洁，无过度设计 |
| 单一职责 | 8 | ↑↑ | 显著改进：CLI 拆分完成，config.js 已净化 |
| 性能优化 | 8 | ↑ | DoH 缓存 + whistle 状态缓存，无明显 IO 瓶颈 |
| 向后兼容 | 9 | → | deepMerge + 默认值，升级友好 |
| 可观测性 | 7 | ↑ | 健康检查完善，config.js 有错误日志；仅剩少量静默错误 |
| 可维护性 | 8 | ↑ | 模块边界清晰，文件粒度合理，易于扩展 |
| **总分** | **8.2** | **↑** | **优秀，架构已趋成熟** |

### 🎯 后续改进路线图

| 优先级 | 任务 | 预计行数 | 影响 |
|--------|------|----------|------|
| P1 | 消除剩余 Promise 错误吞噬 | ~5 行 | 可观测性提升 |
| P2 | 为剩余静默 catch 添加 debug 日志 | ~10 行 | 调试体验提升 |
| P3 | 配置 .eslintrc.js，统一编码规范 | ~50 行 | 代码一致性提升 |
| P4 | 添加 package.json scripts 字段 | ~5 行 | 开发体验标准化 |
| P5 | 补充 .gitignore 标准忽略项 | ~10 行 | 仓库整洁度提升 |

## NOTES
- Node.js 版本必须 ≥ 24.0.0
- 配置文件路径：`~/.easy-proxy/config.json`
- Web 面板：http://local.whistlejs.com/plugin.easy-proxy/
- rules.txt 为示例规则，用户可编辑
- 纯 JavaScript 实现，无编译/转译步骤
