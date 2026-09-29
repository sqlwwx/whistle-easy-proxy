# CLI 命令参考

完整的 `easy-proxy` 命令列表及详细说明。

## 目录

- [Whistle 管理](#whistle-管理)
- [加速管理](#加速管理)
- [SNI 改写管理](#sni-改写管理)
- [Hosts 管理](#hosts-管理)
- [规则管理](#规则管理)
- [上游代理管理](#上游代理管理)
- [系统代理管理](#系统代理管理)
- [Bypass 域名管理](#bypass-域名管理)
- [配置管理](#配置管理)
- [拦截规则管理](#拦截规则管理)
- [证书管理](#证书管理)
- [健康检查](#健康检查)
- [状态与诊断](#状态与诊断)
- [Web 面板 API](#web-面板-api)

---

## Whistle 管理

```bash
easy-proxy start                 # 启动 whistle
easy-proxy start --init          # 启动 whistle（自动安装证书 + 设置代理）
easy-proxy stop                  # 停止 whistle
```

## 加速管理

```bash
easy-proxy accel on              # 开启 GitHub 加速
easy-proxy accel off             # 关闭 GitHub 加速
easy-proxy accel status          # 查看加速状态
easy-proxy accel dns             # 刷新 DNS 缓存
```

## SNI 改写管理

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

## Hosts 管理

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

## 规则管理

```bash
easy-proxy rule list                  # 列出所有规则集（含分组和启用状态）
easy-proxy rule add <名称>            # 新建规则集（打开 $EDITOR 编辑）
easy-proxy rule add <名称> <域名> <代理地址>  # 直接创建规则（无需编辑器）
easy-proxy rule edit <名称>           # 编辑规则内容（打开 $EDITOR，支持 Default）
easy-proxy rule remove <名称>         # 删除规则集（Default 不可删除）
easy-proxy rule enable <名称>         # 启用规则集
easy-proxy rule disable <名称>        # 禁用规则集
```

### 规则分组

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

## 上游代理管理

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

## 系统代理管理

```bash
easy-proxy proxy on              # 开启系统代理（自动带上 bypass 域名列表）
easy-proxy proxy off             # 关闭系统代理
easy-proxy proxy status          # 检查系统代理是否指向 whistle
```

## Bypass 域名管理

```bash
easy-proxy proxy bypass show                 # 查看当前跳过列表
easy-proxy proxy bypass set "a.com,b.com"    # 设置跳过列表（逗号分隔）
easy-proxy proxy bypass add "*.local"        # 添加一个跳过域名
easy-proxy proxy bypass remove "*.local"     # 移除一个跳过域名
easy-proxy proxy bypass reset                # 重置为默认列表
```

### 默认跳过列表

150+ 条，按类别分组：

| 类别 | 代表域名 | 说明 |
|------|---------|------|
| 本地地址 | `localhost`, `127.*.*.*`, `10.*.*.*`, `172.16-31.*.*`, `192.168.*.*` | 私有网段和本地回环 |
| 国内服务 | `*.baidu.com`, `*.qq.com`, `*.aliyun.com`, `*.bilibili.com`, `*.gitee.com`, `*.feishu.cn` | 国内互联网公司，直连更快 |
| 中国域名 | `*.cn`, `*china*` | 所有 .cn 域名和含 china 的域名 |
| GitHub 镜像 | `*.ghproxy.net`, `*.kkgithub.com`, `*.ghp.ci` | GitHub 国内镜像站 |
| 微软/Office | `*.microsoft.com`, `*.office.com`, `*.windows.com`, `*.msn.com` | 微软系服务 |
| Apple | `*.apple.com`, `*.icloud.com` | Apple 服务 |
| Docker | `*.docker.com` | Docker 相关 |
| Mozilla | `*.mozilla.org`, `*.firefox.com` | Firefox/Mozilla 服务 |
| 其他 | `*.wps.com`, `*.jd.com`, `*.360.com`, `*.10086.com` | 其他国内/直连服务 |

> 完整列表见 [lib/cli/bypass-domains.js](../lib/cli/bypass-domains.js)。使用 `easy-proxy proxy bypass show` 可查看当前生效的列表。

> 底层通过 `w2 proxy -x "..."` 实现，修改 bypass 列表后需重新执行 `easy-proxy proxy on` 生效。

## 配置管理

```bash
easy-proxy config show             # 显示当前配置（JSON 格式）
easy-proxy config path             # 显示配置文件路径
easy-proxy config edit             # 编辑配置文件（打开 $EDITOR）
```

**功能说明**：
- `show` - 完整展示当前生效的配置，包含默认值补全
- `path` - 输出配置文件绝对路径，方便定位
- `edit` - 调用系统编辑器修改，保存后自动热重载生效

## 拦截规则管理

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

## 证书管理

证书由 `easy-proxy start` 自动管理（合规校验 + 不合规自动重签 + 安装到系统信任库）。

```bash
easy-proxy start        # 启动并自动处理证书
easy-proxy health       # 查看证书状态（含有效期、信任状态）
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

## 健康检查

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

## 状态与诊断

```bash
easy-proxy status                     # 查看 EasyProxy 整体状态
easy-proxy network ip                 # 查看本机局域网 IP
easy-proxy network delay              # 检测直连网络延迟
easy-proxy network delay -p 8899      # 检测经过代理的网络延迟
```

## Web 面板 API

启动 whistle 后，Web 面板提供以下 HTTP API：

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
