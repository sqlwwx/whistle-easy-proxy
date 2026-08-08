# 故障排查

常见问题及解决方案。如果这里没有你的问题，请提交 Issue。

## 目录

- [GitHub 无法访问](#github-无法访问)
- [GitHub 访问慢](#github-访问慢)
- [规则不生效](#规则不生效)
- [证书不受信任](#证书不受信任)
- [上游代理不工作](#上游代理不工作)
- [HTTPS 网站走上游代理超时 / 502](#https-网站走上游代理超时--502)
- [查看详细调试日志](#查看详细调试日志)

---

## GitHub 无法访问

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

## GitHub 访问慢

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

## 规则不生效

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

**解决方案**：

```bash
# 1. 启动 whistle
easy-proxy start --init

# 2. 启用规则
easy-proxy rule enable <名称>

# 3. 编辑规则修复语法错误
easy-proxy rule edit <名称>
```

## 证书不受信任

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

## 上游代理不工作

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

## HTTPS 网站走上游代理超时 / 502

这是 whistle 插件架构的深度技术问题。本插件从首个版本起就已正确处理。

详见 [技术文档 / HTTPS 上游代理深度分析](./architecture.md#https-上游代理深度技术分析)。

**快速验证**：

```bash
# 测试 HTTPS 连接是否走代理
curl -v -x http://127.0.0.1:8899 https://www.google.com --max-time 10
```

## 查看详细调试日志

启用 debug 日志模式可以帮助定位问题：

```bash
# 开启 debug 日志
EASY_PROXY_DEBUG=1 easy-proxy <命令>

# 示例：查看启动时的配置加载和规则同步日志
EASY_PROXY_DEBUG=1 easy-proxy start

# 示例：查看配置读写日志
EASY_PROXY_DEBUG=1 easy-proxy config show
```

**说明**：设置环境变量 `EASY_PROXY_DEBUG=1` 后，所有模块的调试日志都会输出到 stderr，包括配置加载、DoH 解析、规则同步、CLI 命令执行等。

### 常见错误日志说明

| 日志关键词 | 含义 | 解决方法 |
|-----------|------|---------|
| `DoH resolve failed` | DoH 服务器连接失败 | 检查网络，或降级使用精选 IP |
| `Background refresh failed` | 后台 DoH 刷新失败 | 不影响使用，使用缓存 IP |
| `Rule sync skipped` | 规则集已存在，跳过同步 | 正常行为，无需处理 |
| `ensureDir failed` | 配置目录创建失败 | 检查磁盘权限 |
| `loadConfig` | 配置文件解析失败 | 检查 `~/.easy-proxy/config.json` 格式 |
