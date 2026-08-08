/**
 * 证书状态检查模块
 * 检查 whistle 根证书是否存在、是否已安装到系统信任库、以及有效期。
 *
 * whistle 证书路径: ~/.WhistleAppData/.whistle/certs/root.crt
 * macOS 信任检查: security find-certificate
 * Windows 信任检查: certutil
 * 有效期解析: 优先用 openssl（macOS 内置），回退到 node-forge
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
 * 用 node-forge 解析证书有效期（回退方案）
 * @param {string} certPath
 * @returns {{notBefore: Date, notAfter: Date, subject: string}|null}
 */
function parseCertWithForge(certPath) {
  try {
    var forge = require('node-forge');
    var pem = fs.readFileSync(certPath, 'utf-8');
    var cert = forge.pki.certificateFromPem(pem);
    var cn = cert.subject.attributes.find((a) => a.name === 'commonName');
    return {
      subject: cn ? cn.value : '',
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * 检查证书是否已安装到系统信任库
 * @param {string} subject - 证书 CN（用于搜索）
 * @returns {boolean}
 */
function checkTrusted(subject) {
  if (IS_MACOS) {
    // 检查 login keychain 和 system keychain
    try {
      var keyword = subject ? subject.split('.')[0] : 'whistle';
      execSync(`security find-certificate -c "${keyword}" 2>/dev/null`, { encoding: 'utf-8' });
      return true;
    } catch (_e) {
      // 在 login keychain 中未找到，检查 system keychain
      try {
        execSync(
          'security find-certificate -c "whistle" /Library/Keychains/System.keychain 2>/dev/null',
          { encoding: 'utf-8' }
        );
        return true;
      } catch (_e2) {
        return false;
      }
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
 * @returns {Promise<void>}
 */
async function checkCertStatus(compact) {
  var certPath = findCertFile();
  if (!certPath) {
    console.log(`${(compact ? '  ' : '') + c.red}✖${c.reset} 证书: 未找到（whistle 可能未启动过）`);
    if (!compact) {
      console.log(`${c.gray}    运行 easy-proxy start 启动 whistle（会自动生成证书）${c.reset}`);
      console.log(`${c.gray}    然后运行 easy-proxy cert install 安装证书到系统信任库${c.reset}`);
    }
    return;
  }

  // 解析有效期
  var info = parseCertWithOpenssl(certPath) || parseCertWithForge(certPath);
  if (!info) {
    console.log(`${(compact ? '  ' : '') + c.yellow}⚠${c.reset} 证书: 已存在（无法解析有效期）`);
    console.log(`${c.gray}    路径: ${certPath}${c.reset}`);
    return;
  }

  var now = new Date();
  var daysLeft = Math.floor((info.notAfter.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  var trusted = checkTrusted(info.subject);
  var dateStr = info.notAfter.toISOString().slice(0, 10);

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
    if (daysLeft <= 0) {
      console.log(`${c.gray}    运行 easy-proxy cert install 重新安装证书${c.reset}`);
    } else if (!trusted) {
      console.log(`${c.gray}    运行 easy-proxy cert install 安装证书到系统信任库${c.reset}`);
    }
  }
}

module.exports = { checkCertStatus, findCertFile, parseCertWithOpenssl };
