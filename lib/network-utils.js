const os = require('node:os');
const http = require('node:http');

/**
 * Get the primary LAN IPv4 address.
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Check network latency in ms.
 * @param {number} [port] - proxy port, omit for direct connection
 */
function checkDelay(port) {
  const CHECK_HOST = 'www.msftconnecttest.com';
  const CHECK_PATH = '/connecttest.txt';

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const options = {
      path: CHECK_PATH,
      headers: { Host: CHECK_HOST },
      port: 80,
      host: CHECK_HOST,
    };

    if (port) {
      options.port = port;
      options.host = '127.0.0.1';
    }

    const req = http.get(options, (res) => {
      if (res.statusCode === 200) {
        res.resume();
        resolve(Date.now() - startTime);
      } else {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { getLocalIp, checkDelay };
