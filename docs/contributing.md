# 贡献指南

感谢你有兴趣为 whistle.easy-proxy 做贡献！

## 目录

- [开发环境设置](#开发环境设置)
- [npm 脚本命令](#npm-脚本命令)
- [调试模式](#调试模式)
- [代码规范](#代码规范)
- [工程原则](#工程原则)
- [贡献流程](#贡献流程)

---

## 开发环境设置

如果你在本地开发此插件，需要将包链接到全局 whistle 的插件目录：

```bash
# 在项目根目录执行
npm link

# 然后启动 whistle
easy-proxy start --init
```

## npm 脚本命令

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

## 调试模式

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

## 代码规范

- 纯 JavaScript（Node.js >= 22.0.0）
- 使用 [Biome](https://biomejs.dev/) 格式化代码（`npm run format`）
- 2 空格缩进
- 单引号字符串
- 使用分号结尾
- 中文注释说明「为什么」
- 每个可能失败的操作都要有异常处理
- `catch` 块至少要有 debug 日志，不要完全静默

## 工程原则

本项目遵循 **Matteo Collina 开放式工程原则**：

| 原则 | 说明 |
|------|------|
| **简单优先** | 纯 JavaScript 实现，无编译/转译步骤 |
| **先跑通，再优化** | DoH 失败优雅降级，全链路 try-catch 防御式编程 |
| **优化常见场景** | IP 缓存 10 分钟，getWhistleStatus 1 秒内存缓存 |
| **不破坏现有用户** | deepMerge 配置合并，新增字段有默认值 |
| **靠测量，不靠猜** | 内置 TCP 延迟测量，健康检查命令 |
| **单一职责** | 每个文件职责明确，CLI 按命令拆分 |

## 贡献流程

1. **Fork 项目**并创建特性分支
2. **本地测试**：`npm link` 后验证功能
3. **运行检查**：`npm test` 确保测试通过，`npm run format:check` 确保代码格式正确
4. **提交 PR**：请简要说明改动内容
