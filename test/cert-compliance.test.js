const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const forge = require('node-forge');
const { checkCertCompliance, fixCertCompliance } = require('../lib/cert-check');

// 生成一份模拟 whistle 缺陷的根证书（basicConstraints 无 critical、无 SKI/AKI）
function makeWhistleStyleCert(dir) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: 'commonName', value: 'whistle.test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'basicConstraints', cA: true }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  fs.writeFileSync(path.join(dir, 'root.crt'), forge.pki.certificateToPem(cert));
  fs.writeFileSync(path.join(dir, 'root.key'), forge.pki.privateKeyToPem(keys.privateKey));
}

test('checkCertCompliance 检出 whistle 缺陷证书', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-test-'));
  makeWhistleStyleCert(dir);
  const issues = checkCertCompliance(path.join(dir, 'root.crt'));
  assert.ok(issues.length >= 3, JSON.stringify(issues));
});

test('fixCertCompliance 重签后合规且 key 不变', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-test-'));
  makeWhistleStyleCert(dir);
  const certPath = path.join(dir, 'root.crt');
  const keyBefore = fs.readFileSync(path.join(dir, 'root.key'), 'utf-8');
  assert.ok(fixCertCompliance(certPath));
  const cert = forge.pki.certificateFromPem(fs.readFileSync(certPath, 'utf-8'));
  const bc = cert.extensions.find((e) => e.name === 'basicConstraints');
  const ski = cert.extensions.find((e) => e.name === 'subjectKeyIdentifier');
  const aki = cert.extensions.find((e) => e.name === 'authorityKeyIdentifier');
  assert.ok(bc.critical, 'basicConstraints critical');
  assert.ok(ski, 'SKI 存在');
  assert.ok(aki, 'AKI 存在');
  assert.equal(fs.readFileSync(path.join(dir, 'root.key'), 'utf-8'), keyBefore, 'key 未变');
  assert.ok(checkCertCompliance(certPath).length === 0, '重签后无缺陷');
});
