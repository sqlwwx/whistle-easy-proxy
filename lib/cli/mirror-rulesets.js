/**
 * 内置镜像源规则集
 * 每个 Key 是一个规则集名（easy-proxy mirror on/off <name>），value 是 whistle 规则文本。
 *
 * 原理：whistle 302 重定向。工具仍请求官方源，whistle 把请求重定向到国内镜像，
 * 包管理器自动跟随重定向，无需改 .npmrc / pip.conf / GOPROXY 等工具配置。
 *
 * 已实测验证的链路：npm（302→npmmirror→tarball 下载成功）、pip（simple 页 + files.pythonhosted
 * 文件下载成功）、go（proxy.golang.org → goproxy.cn）。Homebrew 的 formulae.brew.sh
 * 重定向到清华镜像目录结构对不上，且 brew 本身走 GitHub（由 GitHub 加速覆盖），不内置。
 */

const MIRROR_RULESETS = {
  npm: [
    '# npm registry → npmmirror（npmpack/tarball 均跟随 302）',
    '^registry.npmjs.org/*** redirect://https://registry.npmmirror.com/$1',
    '^registry.yarnpkg.com/*** redirect://https://registry.npmmirror.com/$1',
  ].join('\n'),

  pip: [
    '# pip → 清华 TUNA 镜像',
    '# index 页（/simple/）和包文件（files.pythonhosted.org/packages/...）都要重定向，',
    '# 否则 index 能拿到但下载 whl 还是走官方源',
    '^pypi.org/simple/*** redirect://https://pypi.tuna.tsinghua.edu.cn/simple/$1',
    '^files.pythonhosted.org/*** redirect://https://pypi.tuna.tsinghua.edu.cn/packages/$1',
  ].join('\n'),

  go: [
    '# Go module proxy → goproxy.cn',
    '^proxy.golang.org/*** redirect://https://goproxy.cn/$1',
  ].join('\n'),

  node: [
    '# Node.js 二进制分发 → 清华镜像（fnm/nvm/n/volta 通用，工具自动跟随 302，无需设 FNM_NODE_DIST_MIRROR）',
    '^nodejs.org/dist/*** redirect://https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/$1',
  ].join('\n'),

  conda: [
    '# conda → 清华 anaconda 镜像',
    '# 需配合工具配置 conda config --add channels 后再用，纯重定向只覆盖 repo.anaconda.com 主源',
    '^repo.anaconda.com/pkgs/main/*** redirect://https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main/$1',
    '^conda.anaconda.org/*** redirect://https://mirrors.tuna.tsinghua.edu.cn/anaconda-cloud/$1',
  ].join('\n'),

  huggingface: [
    '# HuggingFace → hf-mirror.com（模型/数据集下载）',
    '^huggingface.co/*** redirect://https://hf-mirror.com/$1',
  ].join('\n'),
};

// 默认启用的镜像规则集（easy-proxy start 同步时自动 select）
const DEFAULT_ENABLED = ['npm', 'pip', 'go'];

module.exports = {
  MIRROR_RULESETS,
  DEFAULT_ENABLED,
};
