# whistle.easy-proxy

基于 whistle 的 GitHub 直连加速插件 — DNS 防污染 + DoH 解析 + SNI 改写 + 智能 IP 选路，一键解决国内 GitHub 访问慢/不稳定问题。

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [功能特性](#功能特性)
- [CLI 命令参考](#cli-命令参考)
- [Web 管理面板](#web-管理面板)
- [配置文件](#配置文件)
- [加速原理](#加速原理)
- [故障排查](#故障排查)
- [License](#license)

## 安装

### 前置依赖

- Node.js >= 22.0.0

### 安装方式

```bash
# 全局安装（推荐）
npm i -g whistle.easy-proxy
```

### 验证安装

```bash
# 检查 CLI 是否可用
easy-proxy --version
```

### 开发环境设置

如果你在本地开发此插件，需要将包链接到全局 whistle 的插件目录：

```bash
# 在项目根目录执行
npm link

# 然后启动 whistle
easy-proxy start --init
```

### npm 脚本命令

项目提供以下标准 npm 脚本：

```bash
# 启动 whistle 代理
npm start

# 停止 whistle 代理
npm stop

# 运行单元测试
npm test

# 运行健康检查（whistle 进程 + 系统代理 + 证书）
npm run health

# 格式化代码
npm run format

# 检查代码格式
npm run format:check
```

### 调试模式

启用 debug 日志查看详细的错误信息和内部状态：

```bash
# 开启 debug 日志
EASY_PROXY_DEBUG=1 easy-proxy start

# 示例：查看启动时的配置加载和规则同步日志
EASY_PROXY_DEBUG=1 easy-proxy start

# 示例：查看配置读写日志
EASY_PROXY_DEBUG=1 easy-proxy config show
```

**说明**：设置环境变量 `EASY_PROXY_DEBUG=1` 后，所有模块的调试日志都会输出到 stderr，包括配置加载、DoH 解析、规则同步、CLI 命令执行等。

### 代码质量检查

本项目遵循 **Matteo Collina 开放式工程原则**：

| 原则 | 说明 |
|------|------|
| **简单优先** | 纯 JavaScript 实现，无编译/转译步骤 |
| **先跑通，再优化** | DoH 失败优雅降级，全链路 try-catch 防御式编程 |
| **优化常见场景** | IP 缓存 10 分钟，getWhistleStatus 1 秒内存缓存 |
| **不破坏现有用户** | deepMerge 配置合并，新增字段有默认值 |
| **靠测量，不靠猜** | 内置 TCP 延迟测量，健康检查命令 |
| **单一职责** | 每个文件职责明确，CLI 按命令拆分 |

### 贡献指南

1. **Fork 项目**并创建特性分支
2. **本地测试**：`npm link` 后验证功能
3. **运行检查**：`npm test` 确保测试通过，`npm run format:check` 确保代码格式正确
4. **提交 PR**：请简要说明改动内容

**代码规范**：
- 纯 JavaScript（Node.js >= 22.0.0）
- 使用 [Biome](https://biomejs.dev/) 格式化代码（`npm run format`）
- 2 空格缩进
- 单引号字符串
- 使用分号结尾
- 中文注释说明「为什么」
- 每个可能失败的操作都要有异常处理
- `catch` 块至少要有 debug 日志，不要完全静默

## 快速开始

### 3 步启动

```bash
# 1. 启动 whistle（自动设系统代理 + 安装根证书）
easy-proxy start --init

# 2. 开启 GitHub 加速
easy-proxy accel on

# 3. 打开管理面板（可选）
open http://local.whistlejs.com/plugin.easy-proxy/
```

现在访问 `github.com`，流量会自动走最优线路。

### 验证加速效果

```bash
# 检查加速状态
easy-proxy accel status

# 检测网络延迟
easy-proxy network delay

# 检查代理状态
easy-proxy proxy status
```

## 功能特性

### 1. GitHub 加速

- **DNS 防污染**：通过 DoH（DNS over HTTPS）解析真实 IP
- **智能 IP 选路**：多候选 IP 自动选择最优
- **配置持久化**：配置保存在 `~/.easy-proxy/config.json`

### 2. SNI 改写

- **绕过 SNI 检测**：改写 ClientHello 中的 SNI 域名
- **可选功能**：默认关闭，仅在需要时开启
- **灵活配置**：支持默认 SNI 和域名映射

### 3. Hosts 管理

- **手动覆盖**：指定域名到 IP 的映射
- **优先级最高**：覆盖 DoH 解析和兜底 IP
- **持久化存储**：配置保存在配置文件中

### 4. 上游代理

- **代理转发**：指定域名通过上游代理转发
- **自动生成规则**：自动生成 whistle `proxy://` 规则
- **灵活绑定**：一个代理可绑定多个域名

### 5. 规则管理

- **原生支持**：直接操作 whistle 原生规则系统
- **多规则集**：支持多个独立规则集
- **启用/禁用**：可单独启用或禁用规则集

### 6. 系统代理

- **跨平台支持**：macOS 和 Windows
- **Bypass 列表**：管理不走代理的域名
- **一键切换**：快速开启/关闭系统代理

### 7. 证书管理

- **自动检测**：检查证书安装状态和有效期
- **一键安装**：调用 `w2 ca` 安装根证书
- **过期提醒**：证书即将过期时提醒

### 8. 拦截规则

- **内置规则**：默认包含 80+ 条针对 GitHub、npm、CDN 的优化规则
- **请求重定向**：将慢资源重定向到更快的 CDN
- **资源加速**：常用静态资源映射到国内 CDN
- **灵活配置**：支持自定义添加/删除规则，可按域名+路径匹配

### 9. 健康检查

- **综合检查**：whistle 进程 + 系统代理 + 证书
- **一键诊断**：快速定位问题
- **退出码**：whistle 未运行时退出码为 1

## CLI 命令参考

### Whistle 管理

```bash
easy-proxy start                 # 启动 whistle
easy-proxy start --init          # 启动 whistle（自动安装证书 + 设置代理）
easy-proxy stop                  # 停止 whistle
```

### 加速管理

```bash
easy-proxy accel on              # 开启 GitHub 加速
easy-proxy accel off             # 关闭 GitHub 加速
easy-proxy accel status          # 查看加速状态
easy-proxy accel dns             # 刷新 DNS 缓存
```

### SNI 改写管理

```bash
easy-proxy accel sni on                          # 启用 SNI 改写
easy-proxy accel sni off                         # 禁用 SNI 改写
easy-proxy accel sni status                      # 查看 SNI 改写状态
easy-proxy accel sni config                      # 查看完整 SNI 配置
easy-proxy accel sni set-default <domain>        # 设置默认 SNI 域名
easy-proxy accel sni add-map <from> <to>         # 添加 SNI 映射
easy-proxy accel sni remove-map <from>           # 删除 SNI 映射
```

**常用示例**：

```bash
# 设置默认 SNI 为 github.com
easy-proxy accel sni set-default github.com

# 将 githubassets.com 映射为 github.com 的 SNI
easy-proxy accel sni add-map githubassets.com github.com

# 查看当前 SNI 配置
easy-proxy accel sni config
```

### Hosts 管理

```bash
easy-proxy host list                  # 列出所有手动覆盖
easy-proxy host add <域名> <IP>       # 添加/更新覆盖
easy-proxy host remove <域名>         # 删除覆盖
easy-proxy host clear                 # 清空所有覆盖
```

**常用示例**：

```bash
# 手动指定 github.com 的 IP
easy-proxy host add github.com 20.205.243.166

# 查看所有覆盖
easy-proxy host list

# 删除指定覆盖
easy-proxy host remove github.com
```

### 规则管理

```bash
easy-proxy rule list                  # 列出所有规则集（含分组和启用状态）
easy-proxy rule add <名称>            # 新建规则集（打开 $EDITOR 编辑）
easy-proxy rule add <名称> <域名> <代理地址>  # 直接创建规则（无需编辑器）
easy-proxy rule edit <名称>           # 编辑规则内容（打开 $EDITOR，支持 Default）
easy-proxy rule remove <名称>         # 删除规则集（Default 不可删除）
easy-proxy rule enable <名称>         # 启用规则集
easy-proxy rule disable <名称>        # 禁用规则集
```

**规则分组**：

EasyProxy 自动将规则分为两组，便于管理：
- **EasyProxy 系统规则**：系统管理的规则（如 `upstream-proxies`）
- **EasyProxy 自定义规则**：用户手动添加的规则

使用 `easy-proxy rule list` 可查看分组后的规则列表。

**常用示例**：

```bash
# 新建一个 API 代理规则（交互式编辑器）
easy-proxy rule add api-proxy
# （编辑器中输入：api.example.com http://127.0.0.1:3000）

# 直接创建规则（无需打开编辑器）
easy-proxy rule add api-proxy api.example.com http://127.0.0.1:3000

# 启用规则
easy-proxy rule enable api-proxy

# 编辑 Default 规则
easy-proxy rule edit Default

# 查看所有规则集及状态
easy-proxy rule list
```

> 所有规则命令在执行前会自动检查 whistle 是否运行，未运行时会提示先执行 `easy-proxy start --init`。
> 启用规则时会自动开启 whistle 多选模式，确保不会意外取消其他规则的选中状态。

### 上游代理管理

```bash
easy-proxy proxy upstream edit                  # 编辑上游代理配置（打开 $EDITOR）
easy-proxy proxy upstream status                # 查看配置
easy-proxy proxy upstream sync                  # 手动同步规则到 whistle
```

**常用示例**：

```bash
# 编辑上游代理配置（打开系统编辑器）
easy-proxy proxy upstream edit
# （编辑器中按格式输入代理名称、URL 和绑定域名，保存即可）

# 查看配置
easy-proxy proxy upstream status

# 手动同步规则
easy-proxy proxy upstream sync
```

> edit 保存后会自动同步规则到 whistle（如 whistle 正在运行）。未运行时可手动执行 `sync`。

### 系统代理管理

```bash
easy-proxy proxy on              # 开启系统代理（自动带上 bypass 域名列表）
easy-proxy proxy off             # 关闭系统代理
easy-proxy proxy status          # 检查系统代理是否指向 whistle
```

### Bypass 域名管理

```bash
easy-proxy proxy bypass show                 # 查看当前跳过列表
easy-proxy proxy bypass set "a.com,b.com"    # 设置跳过列表（逗号分隔）
easy-proxy proxy bypass add "*.local"        # 添加一个跳过域名
easy-proxy proxy bypass remove "*.local"     # 移除一个跳过域名
easy-proxy proxy bypass reset                # 重置为默认列表
```

**默认跳过列表**（160+ 条，按类别分组）：

| 类别 | 代表域名 | 说明 |
|------|---------|------|
| 本地地址 | `localhost`, `127.*.*.*`, `10.*.*.*`, `172.16-31.*.*`, `192.168.*.*` | 私有网段和本地回环 |
| 国内服务 | `*.baidu.com`, `*.qq.com`, `*.aliyun.com`, `*.bilibili.com`, `*.gitee.com`, `*.feishu.cn` | 国内互联网公司，直连更快 |
| 中国域名 | `*.cn`, `*china*` | 所有 .cn 域名和含 china 的域名 |
| GitHub 镜像 | `*.ghproxy.net`, `*.kkgithub.com`, `*.ghp.ci` | GitHub 国内镜像站 |
| 微软/Office | `*.microsoft.com`, `*.office.com`, `*.windows.com`, `*.msn.com` | 微软系服务 |
| Apple | `*.apple.com`, `*.icloud.com` | Apple 服务 |
| Docker | `*.docker.com`, `*.docker.com` | Docker 相关 |
| Mozilla | `*.mozilla.org`, `*.firefox.com` | Firefox/Mozilla 服务 |
| 其他 | `*.wps.com`, `*.jd.com`, `*.360.com`, `*.10086.com` | 其他国内/直连服务 |

> 完整列表见 [lib/cli/bypass-domains.js](../blob/main/lib/cli/bypass-domains.js)。使用 `easy-proxy proxy bypass show` 可查看当前生效的列表。

> 底层通过 `w2 proxy -x "..."` 实现，修改 bypass 列表后需重新执行 `easy-proxy proxy on` 生效。

### 配置管理

```bash
easy-proxy config show             # 显示当前配置（JSON 格式）
easy-proxy config path             # 显示配置文件路径
easy-proxy config edit             # 编辑配置文件（打开 $EDITOR）
```

**功能说明**：
- `show` - 完整展示当前生效的配置，包含默认值补全
- `path` - 输出配置文件绝对路径，方便定位
- `edit` - 调用系统编辑器修改，保存后自动热重载生效

### 拦截规则管理

```bash
easy-proxy intercept status        # 查看拦截规则状态
easy-proxy intercept enable        # 启用拦截规则
easy-proxy intercept disable       # 关闭拦截规则
easy-proxy intercept list          # 列出所有拦截规则
easy-proxy intercept list --json   # 以 JSON 格式列出
easy-proxy intercept list -d <域名>  # 只显示指定域名的规则
easy-proxy intercept search <关键词>  # 搜索拦截规则
easy-proxy intercept add <host> <path> <actionJson>  # 添加拦截规则
easy-proxy intercept remove <host> [path]  # 删除拦截规则
easy-proxy intercept reset         # 重置为默认拦截规则
```

**拦截规则说明**：
- 用于拦截特定请求并执行动作（如 JSONP 过滤、重定向等）
- 默认包含 80+ 条针对 GitHub、npm、CDN 的优化规则
- 可自定义添加/删除规则，配置保存在 `config.interceptRules`

### 证书管理

```bash
easy-proxy cert install          # 安装根证书
easy-proxy cert install --force  # 强制重新生成并安装根证书
easy-proxy cert check            # 检查证书状态和有效期
```

**cert check 输出示例**：

```
证书状态
────────────────────────────────────────
ℹ 状态:     有效（剩余 3624 天）
ℹ 过期时间: 2036-06-26
ℹ 信任:     ✓ 已信任
ℹ 路径:     ~/.WhistleAppData/.whistle/certs/root.crt
```

### 健康检查

```bash
easy-proxy health                # 综合检查：whistle 进程 + 系统代理 + 证书
```

**health 输出示例**：

```
健康检查
────────────────────────────────────────
✓ Whistle 代理: 运行中 (端口: 8899)
✓ 系统代理: 已开启
✓ 证书: 有效（剩余 3624 天）
ℹ 本机 IP: 192.168.0.181
```

### 状态与诊断

```bash
easy-proxy status                     # 查看 EasyProxy 整体状态
easy-proxy network ip                 # 查看本机局域网 IP
easy-proxy network delay              # 检测直连网络延迟
easy-proxy network delay -p 8899      # 检测经过代理的网络延迟
```

## Web 管理面板

启动 whistle 后访问 `http://local.whistlejs.com/plugin.easy-proxy/`，可以：

| 功能 | 说明 |
|------|------|
| 加速总开关 | 一键开关 GitHub 加速 |
| SNI 改写钩子 | 切换 SNI 改写是否启用 |
| 域名列表 | 查看所有 GitHub 域名的解析 IP 和延迟 |
| 测速 | 对单个域名并行测试所有候选 IP（Override / DoH / Curated / Cached），对比延迟，一键选用最优 |
| 手动覆盖 | Web 界面添加/删除域名→IP 覆盖 |
| SNI 映射 | Web 界面管理 SNI 改写映射 |
| 拦截规则 | 查看和切换拦截规则总开关 |
| 刷新 IP | 刷新全部或单个域名的 DNS 解析缓存 |

### Web 面板 API

```bash
GET  /api/status          # 获取加速状态和配置
GET  /api/hosts           # 获取所有域名的解析 IP 和延迟
POST /api/speed-test      # 测速（body: { host: "github.com" }）
POST /api/refresh         # 刷新 DNS 缓存（body: { host: "github.com" } 或 {} 全部刷新）
POST /api/toggle          # 切换加速开关（body: { enabled: true/false }）
POST /api/toggle-sni      # 切换 SNI 改写（body: { enabled: true/false }）
POST /api/sni             # 设置 SNI 映射（body: { host: "xxx", sni: "yyy" }）
POST /api/host            # 添加/更新 host 覆盖（body: { pattern: "xxx", ip: "yyy" }）
POST /api/host-remove     # 删除 host 覆盖（body: { pattern: "xxx" }）
GET  /api/network/ip      # 获取本机 IP
GET  /api/network/delay   # 检测网络延迟（?port=8899 可选）
GET  /api/intercept/status  # 拦截规则状态
GET  /api/intercept/rules   # 拦截规则列表
POST /api/intercept/toggle  # 切换拦截规则开关（body: { enabled: true/false }）
```

## 配置文件

配置文件路径：`~/.easy-proxy/config.json`

```jsonc
{
  "enabled": true,              // 加速总开关
  "doh": {
    "bootstrapIp": "8.8.8.8",  // DoH 引导 IP（用于连接 DoH 服务器）
    "host": "dns.google",       // DoH 服务器域名
    "path": "/resolve",         // DoH 解析路径
    "port": 443                 // DoH 端口
  },
  "ipCacheTtl": 600,            // IP 缓存时间（秒），默认 10 分钟
  "sniRewrite": {
    "enabled": false,           // SNI 改写开关（默认关闭）
    "defaultSni": null,         // 默认 SNI 域名（如 github.com）
    "sniMap": {}                // 域名 → SNI 映射
  },
  "hosts": [],                  // 手动覆盖列表 [{pattern: "域名", ip: "IP"}]
  "upstreamProxies": [],        // 上游代理列表 [{name: "名称", url: "URL", domains: ["域名"]}]
  "proxyBypassDomains": null,   // 跳过代理的域名列表（null 表示使用默认列表）
  "interceptEnabled": true,     // 拦截规则总开关
  "interceptRules": {}           // 自定义拦截规则（省略或空对象表示使用默认 80+ 条规则）
}
```

### 配置说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 加速总开关 |
| `doh.bootstrapIp` | string | `"8.8.8.8"` | DoH 引导 IP |
| `doh.host` | string | `"dns.google"` | DoH 服务器域名 |
| `doh.path` | string | `"/resolve"` | DoH 解析路径 |
| `doh.port` | number | `443` | DoH 端口 |
| `ipCacheTtl` | number | `600` | IP 缓存时间（秒） |
| `sniRewrite.enabled` | boolean | `false` | SNI 改写开关 |
| `sniRewrite.defaultSni` | string | `null` | 默认 SNI 域名 |
| `sniRewrite.sniMap` | object | `{}` | 域名 → SNI 映射 |
| `hosts` | array | `[]` | 手动覆盖列表 |
| `upstreamProxies` | array | `[]` | 上游代理列表 |
| `proxyBypassDomains` | array | `null` | 跳过代理的域名列表 |
| `interceptEnabled` | boolean | `true` | 拦截规则总开关 |
| `interceptRules` | object | 默认 80+ 条规则 | 自定义拦截规则（嵌套对象结构：`{ hostPattern: { pathPattern: { action1: value1, ... } } }`），设为 `{}` 或省略则使用内置默认规则 |

### 配置热重载

通过 Web 面板修改配置会立即生效（无需重启 whistle）。支持以下方式修改配置：

1. **Web 面板**：通过管理面板修改 — 立即生效 ✅
2. **CLI 命令**：通过 `easy-proxy` 命令修改 — 写入配置文件，对新启动的 whistle 进程生效
3. **直接编辑**：直接编辑 `~/.easy-proxy/config.json` — 下次启动 whistle 时加载

> **注意**：CLI 和直接编辑配置文件不会触发热重载。正在运行的 whistle 进程需要重启或通过 Web 面板修改才能生效。

### 配置验证

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

## 加速原理

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

### 为什么 SNI 改写默认关闭

大部分 GitHub 域名可以通过 whistle `host://` 规则直接映射到真实 IP 完成访问。只有少数域名（如特定 GitHub Pages 子域名）会在直连时被 GFW 通过 SNI 检测拦截。SNI 改写钩子只在这些场景下才需要开启，默认关闭以最小化影响面。

### IP 选择策略

每个域名有多个候选 IP 来源，按优先级排列：

1. **手动覆盖（Override）** — 用户通过 CLI 或 Web 面板手动指定的 IP，最高优先级
2. **DoH 解析** — 通过 Google/Cloudflare/阿里/DNSPod 的 DoH 服务获取真实 IP
3. **精选预设（Curated）** — 内置的已知可用 IP 列表
4. **缓存（Cached）** — 上次成功解析的 IP，TTL 10 分钟

通过 Web 面板「测速」功能可以对比所有候选 IP 的 TCP 延迟，一目了然。

## 故障排查

### 问题：GitHub 无法访问

**可能原因**：
1. whistle 未运行
2. 系统代理未开启
3. 加速功能未启用

**排查步骤**：

```bash
# 1. 检查 whistle 状态
easy-proxy start --init

# 2. 检查 EasyProxy 状态
easy-proxy status

# 3. 检查加速状态
easy-proxy accel status

# 4. 检查系统代理
easy-proxy proxy status

# 5. 运行健康检查
easy-proxy health
```

**解决方案**：

```bash
# 1. 启动 whistle
easy-proxy start --init

# 2. 开启加速
easy-proxy accel on

# 3. 开启系统代理
easy-proxy proxy on
```

### 问题：需要查看详细调试日志

启用 debug 日志模式可以帮助定位问题：

```bash
# 查看所有日志
DEBUG=easy-proxy:* easy-proxy <命令>

# 示例：查看启动时的配置加载和规则同步日志
DEBUG=easy-proxy:* easy-proxy start

# 示例：查看 DoH 解析过程
DEBUG=easy-proxy:plugin easy-proxy accel status

# 示例：查看配置读写日志
DEBUG=easy-proxy:config easy-proxy config show
```

**常见错误日志说明**（需开启 `EASY_PROXY_DEBUG=1` 查看）：

| 日志关键词 | 含义 | 解决方法 |
|-----------|------|---------|
| `DoH resolve failed` | DoH 服务器连接失败 | 检查网络，或降级使用精选 IP |
| `Background refresh failed` | 后台 DoH 刷新失败 | 不影响使用，使用缓存 IP |
| `Rule sync skipped` | 规则集已存在，跳过同步 | 正常行为，无需处理 |
| `ensureDir failed` | 配置目录创建失败 | 检查磁盘权限 |
| `loadConfig` | 配置文件解析失败 | 检查 `~/.easy-proxy/config.json` 格式 |

### 问题：规则不生效

**可能原因**：
1. whistle 未运行
2. 规则集未启用
3. 规则语法错误

**排查步骤**：

```bash
# 1. 检查 whistle 状态
easy-proxy start --init

# 2. 查看所有规则集状态
easy-proxy rule list

# 3. 启用规则集
easy-proxy rule enable <名称>
```

### 问题：GitHub 访问慢

**可能原因**：
1. DNS 解析慢
2. IP 选择不优
3. 网络延迟高

**排查步骤**：

```bash
# 1. 刷新 DNS 缓存
easy-proxy accel dns

# 2. 检测网络延迟
easy-proxy network delay

# 3. 检测代理延迟
easy-proxy network delay -p 8899
```

**解决方案**：

```bash
# 1. 刷新 DNS 缓存
easy-proxy accel dns

# 2. 通过 Web 面板测速，选择最优 IP
open http://local.whistlejs.com/plugin.easy-proxy/

# 3. 手动指定 IP
easy-proxy host add github.com 20.205.243.166
```

### 问题：证书不受信任

**可能原因**：
1. 证书未安装到系统信任库
2. 证书已过期

**排查步骤**：

```bash
# 1. 检查证书状态
easy-proxy cert check

# 2. 检查证书信任状态
easy-proxy health
```

**解决方案**：

```bash
# 1. 重新安装证书
easy-proxy cert install

# 2. 按照提示执行 sudo 命令信任证书
```

### 问题：规则不生效

**可能原因**：
1. whistle 未运行
2. 规则未启用
3. 规则语法错误

**排查步骤**：

```bash
# 1. 检查 whistle 状态
easy-proxy start --init

# 2. 查看所有规则集
easy-proxy rule list

# 3. 检查规则是否启用
easy-proxy rule enable <名称>
```

**解决方案**：

```bash
# 1. 启动 whistle
easy-proxy start --init

# 2. 启用规则
easy-proxy rule enable <名称>

# 3. 编辑规则修复语法错误
easy-proxy rule edit <名称>
```

### 问题：上游代理不工作

**可能原因**：
1. 代理配置错误
2. 规则未同步
3. whistle 未运行

**排查步骤**：

```bash
# 1. 查看代理配置
easy-proxy proxy upstream status

# 2. 手动同步规则
easy-proxy proxy upstream sync

# 3. 检查 whistle 状态
easy-proxy start --init
```

**解决方案**：

```bash
# 1. 重新编辑配置
easy-proxy proxy upstream edit

# 2. 手动同步
easy-proxy proxy upstream sync
```

### 问题：HTTPS 网站走上游代理超时 / 502 / DNS Lookup Failed

这是一个 whistle 插件架构的**深度技术问题**。EasyProxy 在 v3.0.0 及后续版本已修复。

#### 根本原因分析

**现象**：
- 配置上游代理后，HTTP 网站可以正常转发
- HTTPS 网站（如 Google、YouTube 等）超时或返回 502
- 系统返回 "DNS Lookup Failed" 或直接超时

**技术根因**：

whistle 插件系统有两种 hook 方式，它们的行为有本质区别：

| Hook 类型 | 对 HTTPS 流量的影响 | `req.setReqRules()` 行为 | `proxy://` 规则生效 |
|-----------|---------------------|--------------------------|-------------------|
| `exports.server` | ❌ 启用插件隧道处理管道 | 被覆盖为 `noop` (空函数) | ❌ 不生效 |
| `exports.init` | ✅ 使用 whistle 原生隧道处理 | 正常生效 | ✅ 生效 |

**为什么会这样**：

1. 当插件导出 `exports.server` 时，whistle 认为插件需要"深度参与" HTTP/HTTPS 流量处理
2. whistle 为此启用了完整的**插件隧道处理管道**（Plugin Tunnel Pipe）
3. 在此模式下，`req.setReqRules()`、`req.setResRules()` 等方法被覆盖为 **noop（空函数）**
4. 因此，所有通过 `req.setReqRules()` 设置的 `proxy://` 规则**完全不生效**
5. 没有代理规则时，whistle 尝试直接 DNS 解析被墙域名，导致 "DNS Lookup Failed" 或超时

**修复方案**：

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

#### 注意事项

- **规则格式**：上游代理规则必须使用 `proxy://` 协议格式，而不是 `http://` 或 `https://`
- **同步机制**：EasyProxy 使用 `upstream-proxies` 独立规则集，不会与用户自定义规则冲突

#### 验证方法

```bash
# 1. 检查规则集是否启用
easy-proxy rule list | grep -A 2 upstream-proxies

# 2. 确认规则内容是否使用 proxy:// 格式
curl -s http://127.0.0.1:8899/cgi-bin/rules/list | \
  python3 -c "import sys, json; data = json.load(sys.stdin); [print(r['data']) for r in data['list'] if r['name'] == 'upstream-proxies']"

# 3. 测试 HTTPS 连接
curl -v -x http://127.0.0.1:8899 https://www.google.com --max-time 10
```

---

## 与其他 whistle 插件配合

```bash
# w2 命令会随 whistle.easy-proxy 一起安装，无需单独安装 whistle
w2 install whistle.chii     # 远程调试（替代 Chrome DevTools）
w2 install whistle.script   # 脚本扩展（自定义请求/响应修改）
w2 install whistle.vase     # Mock 数据服务
```

## License

MIT
