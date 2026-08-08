# whistle.easy-proxy 架构分析报告

## 一、功能实现合理性分析

### 1.1 架构优势

#### ✅ 利用whistle原生能力
- **进程管理**：使用`easy-proxy start --init`启动whistle，无需自己管理子进程
- **系统代理**：使用`easy-proxy proxy`设置系统代理，跨平台兼容性好
- **证书管理**：使用`easy-proxy cert install`安装证书，简化证书管理流程
- **插件发现**：whistle自动发现和加载插件，无需手动配置

#### ✅ 插件架构清晰
```javascript
// server钩子 - 处理代理请求
exports.server = function (server, options) {
  server.on('request', (req, client, next) => {
    handleProxy(req, client, next, options, config);
  });
};

// uiServer钩子 - 处理管理界面
exports.uiServer = function (server, options) {
  server.on('request', (req, client) => {
    handleUi(req, client, options, config);
  });
};
```

**优点**：
- 职责分离：代理逻辑和UI逻辑分离
- 符合whistle插件规范
- 易于维护和扩展

#### ✅ 模块化设计
| 模块 | 职责 | 优点 |
|------|------|------|
| resolver.js | DNS解析、IP缓存、延迟测量 | 职责单一，易于测试 |
| sni-agent.js | SNI改写、直连转发 | 核心功能独立 |
| ui.js | Web界面、REST API | 前后端分离 |
| config.js | 配置管理 | 支持文件和storage双存储 |
| rule-api.js | whistle规则管理 | 封装whistle API |

### 1.2 架构问题

#### ❌ 配置文件分裂
**当前状态**：3个独立配置文件
```
~/.easy-proxy/
├── sni-rewrite.json      # SNI加速配置
├── upstream-proxies.json # 上游代理配置
└── proxy-config.json     # 系统代理配置
```

**问题**：
1. **维护复杂**：用户需要管理3个配置文件
2. **一致性风险**：配置变更可能不同步
3. **迁移困难**：旧版本配置需要迁移脚本

**建议**：统一为单个配置文件
```json
{
  "enabled": true,
  "doh": { ... },
  "sniRewrite": { ... },
  "hosts": [],
  "upstreamProxies": [],
  "proxyBypassDomains": []
}
```

#### ❌ CLI与插件耦合
**当前状态**：CLI直接调用lib模块
```javascript
// bin/easy-proxy.js
const { loadConfig, saveConfig } = require('../lib/config');
const ruleApi = require('../lib/rule-api');
```

**问题**：
1. **接口边界模糊**：CLI和插件共享lib模块
2. **职责不清**：lib模块同时服务CLI和插件
3. **测试困难**：无法独立测试CLI或插件

**建议**：分离CLI和插件的lib模块
```
lib/
├── plugin/           # 插件专用模块
│   ├── resolver.js
│   ├── sni-agent.js
│   └── ui.js
├── cli/              # CLI专用模块
│   ├── rule-api.js
│   ├── upstream-proxy.js
│   └── proxy-config.js
└── shared/           # 共享模块
    ├── config.js
    └── network-utils.js
```

#### ❌ 错误处理不一致
**当前状态**：部分模块有完善的错误处理，部分模块缺少

**示例对比**：
```javascript
// rule-api.js - 完善的错误处理
async function listRulesets() {
  try {
    var data = JSON.parse(raw);
  } catch (e) {
    throw new Error('whistle API 返回无效 JSON: ' + raw.substring(0, 100));
  }
}

// resolver.js - 缺少错误处理
function dohResolve(host) {
  // 没有try-catch，错误会冒泡
}
```

**建议**：统一错误处理策略

#### ❌ 配置热重载机制不明确
**当前状态**：配置变更后如何生效不清晰

**问题**：
1. **CLI修改配置**：需要重启whistle才能生效？
2. **UI修改配置**：是否立即生效？
3. **配置冲突**：CLI和UI同时修改配置怎么办？

**建议**：明确配置热重载机制
- 配置变更后通知whistle重新加载
- 使用文件监听或事件机制
- 处理并发修改冲突

---

## 二、配置维护方式合理性分析

### 2.1 优势

#### ✅ 向后兼容
```javascript
// 保持sni-rewrite.json路径不变
const CONFIG_PATH = path.join(HOME, '.easy-proxy', 'sni-rewrite.json');
```

**优点**：
- 用户无需迁移配置
- 旧版本用户可以平滑升级
- 减少用户学习成本

#### ✅ whistle storage备份
```javascript
// 文件是唯一数据源，whistle storage仅做同步备份
if (fileConfig) {
  // 有文件 → 同步到 whistle storage（备份）
  if (options && options.storage) {
    options.storage.setProperty('config', JSON.stringify(fileConfig));
  }
  return deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), fileConfig);
}
```

**优点**：
- 配置不会丢失
- 支持配置恢复
- 多设备同步（通过whistle）



### 2.2 问题

#### ❌ 配置同步不一致
**当前状态**：部分配置不同步到whistle storage

**问题**：
- `upstream-proxies.json`：不同步到storage
- `proxy-config.json`：不同步到storage
- `sni-rewrite.json`：同步到storage

**建议**：统一配置同步策略

#### ❌ 缺少配置验证
**当前状态**：没有配置格式验证

**问题**：
- 用户可能输入错误的配置格式
- 缺少类型检查
- 缺少必填字段验证

**建议**：添加配置验证
```javascript
function validateConfig(config) {
  if (typeof config.enabled !== 'boolean') {
    throw new Error('config.enabled 必须是布尔值');
  }
  if (config.doh && typeof config.doh.host !== 'string') {
    throw new Error('config.doh.host 必须是字符串');
  }
  // ... 其他验证
}
```

#### ❌ 配置变更通知缺失
**当前状态**：配置变更后没有通知机制

**问题**：
- CLI修改配置后，插件不知道配置已变更
- UI修改配置后，CLI不知道配置已变更
- 多实例场景下配置不一致

**建议**：实现配置变更通知
```javascript
// 使用文件监听
const chokidar = require('chokidar');
chokidar.watch(CONFIG_PATH).on('change', () => {
  config = loadConfig();
  resolver.setConfig(config);
});
```

#### ❌ 配置版本管理缺失
**当前状态**：没有配置版本管理

**问题**：
- 无法回滚配置变更
- 无法查看配置历史
- 无法多人协作编辑配置

**建议**：添加配置版本管理
```javascript
function saveConfigWithVersion(config) {
  const version = Date.now();
  const backupPath = path.join(CONFIG_DIR, `config-${version}.json`);
  fs.copyFileSync(CONFIG_PATH, backupPath);
  // 只保留最近10个版本
  cleanupOldVersions();
}
```

---

## 三、改进建议

### 3.1 短期改进（1-2周）

1. **统一配置文件**
   - 合并3个配置文件为1个
   - 更新配置加载逻辑
   - 添加配置迁移脚本

2. **完善错误处理**
   - 为所有模块添加try-catch
   - 统一错误格式
   - 添加错误日志

3. **添加配置验证**
   - 定义配置schema
   - 添加验证函数
   - 提供友好的错误提示

### 3.2 中期改进（1-2月）

1. **分离CLI和插件模块**
   - 重构目录结构
   - 定义清晰的接口
   - 添加单元测试

2. **实现配置热重载**
   - 使用文件监听
   - 实现配置变更通知
   - 处理并发修改

3. **添加配置版本管理**
   - 自动备份配置
   - 支持配置回滚
   - 记录配置变更历史

### 3.3 长期改进（3-6月）

1. **重构整体架构**
   - 采用更清晰的分层
   - 定义插件API规范
   - 支持插件热更新

2. **添加监控和诊断**
   - 配置变更日志
   - 性能监控
   - 健康检查

3. **完善文档**
   - 插件开发文档
   - 配置说明文档
   - 故障排查指南

---

## 四、总结

### 功能实现合理性评分：7/10

**优点**：
- 利用whistle原生能力，避免重复造轮子
- 插件架构清晰，职责分离
- 模块化设计，易于维护

**缺点**：
- 配置文件分裂，维护复杂
- CLI与插件耦合，接口模糊
- 错误处理不一致

### 配置维护方式合理性评分：6/10

**优点**：
- 向后兼容，用户无需迁移
- whistle storage备份，配置不丢失

**缺点**：
- 配置同步不一致
- 缺少配置验证
- 配置热重载机制不明确

### 总体评价

whistle.easy-proxy的架构设计总体合理，充分利用了whistle的原生能力，避免了重复造轮子。但在配置管理和模块耦合方面还有改进空间。建议按照改进计划逐步优化，提升架构的可维护性和可扩展性。
