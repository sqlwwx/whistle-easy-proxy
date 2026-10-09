# whistle.easy-proxy

> 基于 whistle 的 GitHub 直连加速插件 — DNS 防污染 + DoH 解析 + SNI 改写 + 智能 IP 选路，一键解决国内 GitHub 访问慢/不稳定问题。

[![npm version](https://img.shields.io/npm/v/whistle.easy-proxy.svg)](https://www.npmjs.com/package/whistle.easy-proxy)
[![license](https://img.shields.io/npm/l/whistle.easy-proxy.svg)](https://github.com/sqlwwx/easy-proxy/blob/master/LICENSE)
[![node version](https://img.shields.io/node/v/whistle.easy-proxy.svg)](https://nodejs.org/)

## 功能特性

- **DNS 防污染**：通过 DoH 解析真实 IP，绕过 DNS 污染
- **智能 IP 选路**：多候选 IP 自动选择最优线路
- **SNI 改写**：绕过 SNI 检测，支持默认 SNI 和域名映射
- **上游代理**：灵活配置域名级别的代理转发
- **拦截规则**：内置 80+ 条 GitHub / npm / CDN 优化规则
- **Web 管理面板**：测速、选路、配置修改，所见即所得
- **跨平台**：支持 macOS / Windows，系统代理一键切换

## 快速开始

### 前置依赖

- Node.js >= 22.0.0

### 3 步启动

```bash
# 1. 全局安装
npm i -g whistle.easy-proxy

# 2. 启动 whistle（自动设系统代理 + 安装根证书）
easy-proxy start --init

# 3. 开启 GitHub 加速
easy-proxy accel on
```

现在访问 `github.com`，流量会自动走最优线路。

### 验证加速效果

```bash
# 检查加速状态
easy-proxy accel status

# 检测网络延迟
easy-proxy network delay

# 打开 Web 管理面板
open http://local.whistlejs.com/plugin.easy-proxy/
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `easy-proxy start --init` | 启动 whistle + 自动设代理 + 安装证书 |
| `easy-proxy stop` | 停止 whistle |
| `easy-proxy accel on / off` | 开启 / 关闭 GitHub 加速 |
| `easy-proxy accel status` | 查看加速状态 |
| `easy-proxy accel dns` | 刷新 DNS 缓存 |
| `easy-proxy host add <域名> <IP>` | 添加手动 IP 覆盖 |
| `easy-proxy health` | 综合健康检查 |
| `easy-proxy mirror` | 开发镜像源加速（npm/pip/go，302 重定向到国内镜像） |
| `easy-proxy status` | 查看整体状态 |

**完整命令参考** → [docs/cli.md](docs/cli.md)

## 配置文件

配置文件路径：`~/.easy-proxy/config.json`

```jsonc
{
  "enabled": true,              // 加速总开关
  "doh": {
    "bootstrapIp": "8.8.8.8",  // DoH 引导 IP
    "host": "dns.google",       // DoH 服务器域名
    "path": "/resolve",         // DoH 解析路径
    "port": 443                 // DoH 端口
  },
  "ipCacheTtl": 600,            // IP 缓存时间（秒），默认 10 分钟
  "sniRewrite": {
    "enabled": false,           // SNI 改写开关（默认关闭）
    "defaultSni": null,         // 默认 SNI 域名
    "sniMap": {}                // 域名 → SNI 映射
  },
  "hosts": [],                  // 手动覆盖列表
  "upstreamProxies": [],        // 上游代理列表
  "proxyBypassDomains": null,   // 跳过代理的域名列表（null 表示默认 150+ 条）
  "interceptEnabled": true,     // 拦截规则总开关
  "interceptRules": {}           // 自定义拦截规则（空对象使用默认 80+ 条）
}
```

**配置说明 / 热重载 / 验证规则** → [docs/architecture.md](docs/architecture.md)

## Web 管理面板

启动 whistle 后访问 `http://local.whistlejs.com/plugin.easy-proxy/`，可以：

| 功能 | 说明 |
|------|------|
| 加速总开关 | 一键开关 GitHub 加速 |
| 域名列表 | 查看所有 GitHub 域名的解析 IP 和延迟 |
| 测速 | 并行测试所有候选 IP，一键选用最优 |
| 手动覆盖 | Web 界面添加/删除域名→IP 覆盖 |
| SNI 映射 | Web 界面管理 SNI 改写映射 |
| 刷新 IP | 刷新全部或单个域名的 DNS 解析缓存 |

**Web 面板 API 列表** → [docs/cli.md#web-面板-api](docs/cli.md)

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
│  直连真实 IP + 改写 ClientHello SNI             │
└────────────────────────────────────────────────┘
    ↓
TCP 隧道 → IP 直连 + TLS 握手
```

**完整原理 / IP 选择策略 / 技术细节** → [docs/architecture.md](docs/architecture.md)

## 故障排查

最常见的 3 个问题：

| 问题 | 快速解决 |
|------|---------|
| GitHub 无法访问 | `easy-proxy start --init && easy-proxy accel on && easy-proxy proxy on` |
| 访问速度慢 | `easy-proxy accel dns` 刷新缓存，或在 Web 面板测速选 IP |
| 证书不受信任 | `easy-proxy start` 重新安装根证书 |

**完整故障排查** → [docs/troubleshooting.md](docs/troubleshooting.md)

## 与其他 whistle 插件配合

`w2` 命令会随 whistle.easy-proxy 一起安装：

```bash
w2 install whistle.chii     # 远程调试（替代 Chrome DevTools）
w2 install whistle.script   # 脚本扩展（自定义请求/响应修改）
w2 install whistle.vase     # Mock 数据服务
```

## 贡献

欢迎贡献代码！请参阅 [贡献指南](docs/contributing.md) 了解开发环境设置、代码规范和提交流程。

## License

MIT
