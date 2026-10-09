/**
 * 证书状态检查模块
 * 检查 whistle 根证书是否存在、是否已安装到系统信任库、以及有效期。
 *
 * whistle 证书路径: ~/.WhistleAppData/.whistle/certs/root.crt
 * macOS 信任检查: security find-certificate
 * Windows 信任检查: certutil
 * 有效期解析: openssl（macOS/Linux 内置），Windows 用 certifi 的 CA 包
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const HOME = os.homedir();
const IS_MACOS = os.platform() === 'darwin';
const IS_WINDOWS = os.platform() === 'win32';

// whistle 默认证书路径（w2 start 生成的路径）
const CERT_PATHS = [
  path.join(HOME, '.WhistleAppData', '.whistle', 'certs', 'root.crt'),
  path.join(HOME, '.WhistleAppData', '.whistle', 'certs', 'root.cer'),
];

/**
 * 查找 whistle 根证书文件
 * @returns {string|null}
 */
function findCertFile() {
  for (var i = 0; i < CERT_PATHS.length; i++) {
    if (fs.existsSync(CERT_PATHS[i])) {
      return CERT_PATHS[i];
    }
  }
  return null;
}

/**
 * 用 openssl 解析证书有效期
 * @param {string} certPath
 * @returns {{notBefore: Date, notAfter: Date, subject: string}|null}
 */
function parseCertWithOpenssl(certPath) {
  try {
    var subject = execSync(`openssl x509 -in "${certPath}" -noout -subject`, {
      encoding: 'utf-8',
    }).trim();
    var dates = execSync(`openssl x509 -in "${certPath}" -noout -dates`, {
      encoding: 'utf-8',
    }).trim();
    var notBeforeMatch = dates.match(/notBefore=(.+)/);
    var notAfterMatch = dates.match(/notAfter=(.+)/);
    if (!notAfterMatch) return null;
    return {
      subject: subject,
      notBefore: notBeforeMatch ? new Date(notBeforeMatch[1]) : null,
      notAfter: new Date(notAfterMatch[1]),
    };
  } catch (_e) {
    return null;
  }
}

/**
 * 用 openssl 解析证书扩展，检查 whistle 根证书是否符合 Python 3.13+/OpenSSL 3
 * 的严格校验要求。老版 whistle 生成的根证书有三个已知缺陷，浏览器不报错但
 * Python 会拒收：1. Basic Constraints 未标 critical  2. 缺 Subject Key Identifier
 * 3. 缺 Authority Key Identifier
 * @param {string} certPath
 * @returns {string[]|null} 缺陷列表，null 表示无法解析
 */
function checkCertCompliance(certPath) {
  try {
    var text = execSync(`openssl x509 -in "${certPath}" -noout -text`, {
      encoding: 'utf-8',
    });
    var issues = [];
    if (!/Basic Constraints:\s*critical/.test(text)) {
      issues.push(
        /Basic Constraints/.test(text) ? 'Basic Constraints 未标 critical' : '缺 Basic Constraints'
      );
    }
    if (!/Subject Key Identifier/.test(text)) issues.push('缺 Subject Key Identifier');
    if (!/Authority Key Identifier/.test(text)) issues.push('缺 Authority Key Identifier');
    return issues;
  } catch (_e) {
    return null;
  }
}

/**
 * 用原私钥重签根证书，补齐严格校验所需的扩展（key 不变，叶子证书链依然有效）。
 * whistle（含 2.10.10）生成的根证书有三个已知缺陷：Basic Constraints 未标
 * critical、缺 SKI、缺 AKI，Python 3.13+ 等严格校验的应用会拒收。
 * @param {string} certPath - whistle 根证书路径（须有同名 root.key）
 * @returns {boolean}
 */
function fixCertCompliance(certPath) {
  try {
    var forge = require('node-forge');
    var cert = forge.pki.certificateFromPem(fs.readFileSync(certPath, 'utf-8'));
    var keyPath = path.join(path.dirname(certPath), 'root.key');
    var key = forge.pki.privateKeyFromPem(fs.readFileSync(keyPath, 'utf-8'));
    // pem 解析出的私钥可能不带 publicKey 属性，从 n/e 重建
    var pk = key.publicKey || forge.pki.rsa.setPublicKey(key.n, key.e);
    var ski = forge.pki.getPublicKeyFingerprint(pk, {
      type: 'SubjectPublicKeyInfo',
      md: forge.md.sha256.create(),
      encoding: 'binary',
    });
    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
        critical: true,
      },
      { name: 'subjectKeyIdentifier', subjectKeyIdentifier: ski },
      // 自签名 CA：authorityKeyIdentifier 与 subjectKeyIdentifier 相同
      { name: 'authorityKeyIdentifier', authorityKeyIdentifier: ski },
    ]);
    cert.sign(key, forge.md.sha256.create());
    fs.writeFileSync(certPath, forge.pki.certificateToPem(cert));
    // 不删合并 CA 包：重签后 root.crt 的 mtime 更新，ensureMergedCaBundle 的
    // staleness 检查会自动重建（直接 unlink 会让环境变量悬空指向不存在的文件）
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * 检查证书是否已安装到系统信任库
 * @param {string} subject - openssl 输出的 subject 行（如 "subject= /CN=whistle.xxx/..."）
 * @param {string} certPath - 证书文件路径（macOS 用于精确信任校验）
 * @returns {boolean}
 */
function checkTrusted(subject, certPath) {
  if (IS_MACOS) {
    // 精确校验：verify-cert 走真实信任链评估（存在但未被信任也会返回 false）
    if (certPath) {
      try {
        execSync(`security verify-cert -c "${certPath}" 2>&1`, { encoding: 'utf-8' });
        return true;
      } catch (_e) {
        return false;
      }
    }
    // 回退：按 CN 搜索 keychain
    try {
      var cn = (subject.match(/CN=([^/]+)/) || [])[1] || 'whistle';
      execSync(`security find-certificate -c "${cn}" 2>/dev/null`, { encoding: 'utf-8' });
      return true;
    } catch (_e) {
      return false;
    }
  }
  if (IS_WINDOWS) {
    try {
      execSync('certutil -store Root "whistle"', { encoding: 'utf-8', windowsHide: true });
      return true;
    } catch (_e) {
      return false;
    }
  }
  return false;
}

// 项目配置目录：~/.easy-proxy/（合并 CA 文件等）
const EASY_PROXY_DIR = path.join(HOME, '.easy-proxy');
const MERGED_CA_PATH = path.join(EASY_PROXY_DIR, 'cert', 'ca-bundle.pem');

/**
 * 生成合并 CA 文件（系统 CA + whistle 根证书），供 Python/Node 等不走系统
 * 信任库的应用使用。源文件比合并文件新（系统 CA 更新 / whistle 证书重签）
 * 则重建。已导出的环境变量指向固定路径，文件重建后依然有效。
 * @param {string} certPath - whistle 根证书路径
 * @returns {string|null} 合并文件路径，失败返回 null
 */
function ensureMergedCaBundle(certPath) {
  var merged = MERGED_CA_PATH;
  try {
    var sources = [certPath];
    if (IS_MACOS) {
      // /etc/ssl/cert.pem 是系统自带的 CA 包，直接复用
      sources.push('/etc/ssl/cert.pem');
    } else if (IS_WINDOWS) {
      // certifi 的 CA 包（requests/httpx 都带 certifi）
      sources.push(
        execSync('python -c "import certifi; print(certifi.where())"', {
          encoding: 'utf-8',
          windowsHide: true,
        }).trim()
      );
    } else {
      sources.push('/etc/ssl/certs/ca-certificates.crt');
    }
    // 任一源文件比合并文件新（系统 CA 更新 / whistle 证书重签）则重建
    if (fs.existsSync(merged)) {
      var mergedMtime = fs.statSync(merged).mtimeMs;
      var stale = sources.some(function (src) {
        try {
          return fs.statSync(src).mtimeMs > mergedMtime;
        } catch (_e) {
          return true; // 源文件读不到，视为过期
        }
      });
      if (!stale) return merged;
    }
    var base = fs.readFileSync(sources[1], 'utf-8');
    // whistle 生成的 root.crt 是 CRLF 行尾，Node/NODE_EXTRA_CA_CERTS 加载器会拒收混入的 CRLF 证书
    var whistlePem = fs.readFileSync(certPath, 'utf-8').replace(/\r/g, '');
    fs.mkdirSync(path.dirname(merged), { recursive: true });
    // 原子写：先写临时文件再 rename，避免写一半崩溃留下坏文件
    var tmp = merged + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, base + '\n' + whistlePem);
    fs.renameSync(tmp, merged);
    return merged;
  } catch (_e) {
    return null;
  }
}

/**
 * 提示 Python/Node 等不走系统信任库的应用所需的 CA 环境变量。
 * whistle 根证书装进系统钥匙串后浏览器正常，但 Python（certifi）、Node（内置 CA）
 * 不读系统信任库，仍会报证书异常，需设置环境变量指向合并 CA 文件。
 */
var APP_CA_VARS = [
  ['REQUESTS_CA_BUNDLE', 'Python requests/httpx'],
  ['SSL_CERT_FILE', 'Python 原生 ssl/urllib'],
  ['NODE_EXTRA_CA_CERTS', 'Node.js'],
];

function printAppCaHints(certPath) {
  var needs = APP_CA_VARS.filter(function (n) {
    return !process.env[n[0]];
  });
  if (!needs.length) return;

  var merged = ensureMergedCaBundle(certPath);
  if (!merged) return;
  console.log(
    `${c.yellow}⚠ Python/Node 等不读系统信任库，需设置以下环境变量（建议写入 ~/.zshrc）：${c.reset}`
  );
  needs.forEach(function (n) {
    console.log(`    export ${n[0]}=${merged}${c.gray}  # ${n[1]}${c.reset}`);
  });
}

/**
 * 将 Python/Node 所需的 CA 环境变量写入 ~/.zshrc（幂等）。
 * 变量已存在且指向合并文件则跳过；指向其他路径则视为用户自行配置，仅提示不覆盖。
 * @param {string} merged - 合并 CA 文件路径
 * @returns {{added: string[], conflicts: string[]}|null} 新增与冲突的变量名，失败返回 null
 */
function writeShellExports(merged) {
  if (IS_WINDOWS) return null;
  var zshrc = path.join(HOME, '.zshrc');
  try {
    var content = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, 'utf-8') : '';
    var added = [];
    var conflicts = [];
    // 需要写入的变量 = zshrc 里还没定义的
    APP_CA_VARS.forEach(function (n) {
      var lineRe = new RegExp('^\\s*(export\\s+)?' + n[0] + '=', 'm');
      if (!lineRe.test(content)) added.push(n);
      else if (content.indexOf(n[0] + '=' + merged) === -1) conflicts.push(n[0]);
    });
    if (added.length) {
      // 包一层 -f 检查：证书/合并文件被清理后，环境变量自动失效，不会指向不存在的文件
      var block =
        '\n# easy-proxy: whistle MITM CA（由 easy-proxy start 维护，证书缺失时自动跳过）\n' +
        'if [ -f "' +
        merged +
        '" ]; then\n';
      added.forEach(function (n) {
        block += '  export ' + n[0] + '=' + merged + '  # ' + n[1] + '\n';
      });
      block += 'fi\n';
      fs.appendFileSync(zshrc, block);
    }
    return {
      added: added.map(function (n) {
        return n[0];
      }),
      conflicts: conflicts,
    };
  } catch (_e) {
    return null;
  }
}

// ANSI 颜色（与 bin CLI 一致）
var c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

/**
 * 检查证书状态并输出
 * @param {boolean} [compact] - 紧凑模式（用于 health 命令，不输出标题）
 * @param {boolean} [autoInstall] - 自动管理模式（start 用）：未信任时自动安装
 * @returns {Promise<void>}
 */
async function checkCertStatus(compact, autoInstall) {
  var certPath = findCertFile();
  if (!certPath) {
    console.log(`${(compact ? '  ' : '') + c.red}✖${c.reset} 证书: 未找到（whistle 可能未启动过）`);
    if (!compact) {
      console.log(`${c.gray}    运行 easy-proxy start 启动 whistle（会自动生成证书）${c.reset}`);
      console.log(`${c.gray}    然后运行 easy-proxy start 安装证书到系统信任库${c.reset}`);
    }
    return;
  }

  // 合并 CA 文件可能被删除（证书更新/清理时），静默重建，
  // 避免已导出的 REQUESTS_CA_BUNDLE 等环境变量指向不存在的文件
  ensureMergedCaBundle(certPath);

  // 合规校验（Python 3.13+/OpenSSL 3 会拒收不合规的 CA 证书），自动修复后重新解析
  // 先修复合规性（重签会作废合并文件），合并文件在重签后下方重建
  var issues = checkCertCompliance(certPath);
  if (issues && issues.length) {
    if (fixCertCompliance(certPath)) {
      ensureMergedCaBundle(certPath);
      if (!compact) {
        console.log(`${c.yellow}🔧${c.reset} 证书: 已重签修复（${issues.join('、')}）`);
      }
    } else {
      console.log(
        `${(compact ? '  ' : '') + c.yellow}⚠${c.reset} 证书: 不合规（${issues.join('、')}），自动修复失败`
      );
    }
  }

  // 解析有效期
  var info = parseCertWithOpenssl(certPath);
  if (!info) {
    console.log(`${(compact ? '  ' : '') + c.yellow}⚠${c.reset} 证书: 已存在（无法解析有效期）`);
    console.log(`${c.gray}    路径: ${certPath}${c.reset}`);
    return;
  }

  var now = new Date();
  var daysLeft = Math.floor((info.notAfter.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  var trusted = checkTrusted(info.subject, certPath);
  var dateStr = info.notAfter.toISOString().slice(0, 10);

  // 自动管理模式（start）：未信任则用 whistle 内置安装器装进系统信任库 + 写 zshrc 环境变量
  if (autoInstall && !trusted) {
    try {
      var installRootCA = require('whistle/bin/ca');
      installRootCA(certPath);
      var merged = ensureMergedCaBundle(certPath);
      if (merged && writeShellExports(merged)) {
        console.log(`${c.green}✔${c.reset} 根证书已安装，CA 环境变量已写入 ~/.zshrc（新终端生效）`);
      }
      trusted = checkTrusted(info.subject, certPath);
    } catch (e) {
      console.log(
        `${c.yellow}⚠${c.reset} 根证书未信任，自动安装失败: ${e.message}（可运行 easy-proxy w2 ca 手动安装）`
      );
    }
  }

  // 状态判断
  var status, color;
  if (daysLeft <= 0) {
    status = `已过期（超过 ${-daysLeft} 天）`;
    color = c.red;
  } else if (daysLeft <= 30) {
    status = `即将过期（剩余 ${daysLeft} 天）`;
    color = c.yellow;
  } else {
    status = `有效（剩余 ${daysLeft} 天）`;
    color = c.green;
  }

  var trustedStr = trusted ? `${c.green}✓ 已信任` : `${c.yellow}⚠ 未信任${c.reset}`;

  if (compact) {
    console.log(
      '  ' +
        color +
        (daysLeft <= 0 ? '✖' : daysLeft <= 30 ? '⚠' : '✓') +
        c.reset +
        ' 证书: ' +
        status +
        c.gray +
        '，过期 ' +
        dateStr +
        c.reset +
        ' — ' +
        trustedStr
    );
  } else {
    console.log(`${c.bold + c.blue}证书状态${c.reset}`);
    console.log(c.gray + '─'.repeat(40) + c.reset);
    console.log(`${c.blue}ℹ${c.reset} 状态:     ${color}${status}${c.reset}`);
    console.log(`${c.blue}ℹ${c.reset} 过期时间: ${dateStr}`);
    console.log(`${c.blue}ℹ${c.reset} 信任:     ${trustedStr}`);
    console.log(`${c.blue}ℹ${c.reset} 路径:     ${c.gray}${certPath}${c.reset}`);
    if (info.subject) {
      console.log(`${c.blue}ℹ${c.reset} 颁发对象:  ${c.gray}${info.subject}${c.reset}`);
    }
    console.log(c.gray + '─'.repeat(40) + c.reset);
    printAppCaHints(certPath);
    if (daysLeft <= 0) {
      console.log(`${c.gray}    运行 easy-proxy start 重新安装证书${c.reset}`);
    } else if (!trusted) {
      console.log(`${c.gray}    运行 easy-proxy start 安装证书到系统信任库${c.reset}`);
    }
  }
}

module.exports = {
  checkCertStatus,
  findCertFile,
  parseCertWithOpenssl,
  checkCertCompliance,
  fixCertCompliance,
  ensureMergedCaBundle,
  writeShellExports,
  checkTrusted,
};
