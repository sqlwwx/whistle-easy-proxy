# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.2.1](https://github.com/sqlwwx/easy-proxy/compare/v1.2.0...v1.2.1) (2026-10-09)


### Bug Fixes

* npm 镜像规则仅重定向 GET（includeFilter m:get），publish 的 PUT/POST 直达官方源 ([7894dc9](https://github.com/sqlwwx/easy-proxy/commit/7894dc92e6c5e40509e8909487e9c02e55e9d2ae))

## [1.2.0](https://github.com/sqlwwx/easy-proxy/compare/v1.1.0...v1.2.0) (2026-10-09)


### Features

* 内置镜像源加速 — mirror on/off/status，npm/pip/go/node/conda/huggingface 302 重定向到国内镜像 ([c904d75](https://github.com/sqlwwx/easy-proxy/commit/c904d75eddc71b088cdc5572252b1190bbc82e33))
* bypass 简化为 easy-proxy proxy bypass 直接进编辑器（一行一个域名），移除 show/set/add/remove/reset 子命令 ([53a891b](https://github.com/sqlwwx/easy-proxy/commit/53a891bb8ba930f44d51bb254802775cbc62f497))
* start 自动同步镜像规则集，启动带 --dnsServer 223.5.5.5 绕过污染 DNS ([5cee304](https://github.com/sqlwwx/easy-proxy/commit/5cee304bee179015a84d3c47cefdbfed685b1965))


### Bug Fixes

* ca-bundle 丢失 — 重签证书不再 unlink 合并包（staleness 检查自动重建），改原子写 ([63866e2](https://github.com/sqlwwx/easy-proxy/commit/63866e28ba74c7f887ca8c9e344bffbf6af79eab))

## 1.1.0 (2026-09-29)


### Features

* 证书自动管理（start 内置合规修复+自动安装+合并 CA 包），移除 cert 命令 ([ff48766](https://github.com/sqlwwx/easy-proxy/commit/ff487669bf10a721a87c4878e5d31065f5d606e0))
* 支持注释代理地址来切换/停用上游代理 ([f1ce878](https://github.com/sqlwwx/easy-proxy/commit/f1ce87854b45eebd884290b38e03e1f6704a22ab))
