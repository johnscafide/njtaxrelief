import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';

const hosts = (process.env.TLS_HOSTS || 'njpropertytaxrelief.com,www.njpropertytaxrelief.com')
  .split(',').map(v => v.trim()).filter(Boolean);
const out = process.env.TLS_EVIDENCE_FILE || 'tls-readiness-evidence.json';

function checkRedirect(host) {
  return new Promise((resolve) => {
    const req = http.get({ host, path: '/', timeout: 10000 }, (res) => {
      const location = res.headers.location || '';
      resolve({ status: res.statusCode || 0, location, redirects_to_https: /^https:\/\//i.test(location) });
      res.resume();
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout', redirects_to_https: false }); });
    req.on('error', (error) => resolve({ error: error.code || error.message, redirects_to_https: false }));
  });
}

function checkHttps(host) {
  return new Promise((resolve) => {
    const req = https.get({ host, path: '/', timeout: 15000, minVersion: 'TLSv1.2', rejectUnauthorized: true }, (res) => {
      const socket = res.socket;
      const cert = socket.getPeerCertificate?.() || {};
      resolve({
        status: res.statusCode || 0,
        authorized: socket.authorized === true,
        authorization_error: socket.authorizationError || null,
        protocol: socket.getProtocol?.() || null,
        cipher: socket.getCipher?.()?.name || null,
        hsts: res.headers['strict-transport-security'] || null,
        x_content_type_options: res.headers['x-content-type-options'] || null,
        x_frame_options: res.headers['x-frame-options'] || null,
        referrer_policy: res.headers['referrer-policy'] || null,
        permissions_policy: res.headers['permissions-policy'] || null,
        certificate: {
          subject_cn: cert.subject?.CN || null,
          issuer_cn: cert.issuer?.CN || null,
          valid_from: cert.valid_from || null,
          valid_to: cert.valid_to || null,
          fingerprint256: cert.fingerprint256 || null
        }
      });
      res.resume();
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', (error) => resolve({ error: error.code || error.message }));
  });
}

const evidence = { tested_at: new Date().toISOString(), hosts: [] };
let failed = false;
for (const host of hosts) {
  const [httpResult, httpsResult] = await Promise.all([checkRedirect(host), checkHttps(host)]);
  const hsts = String(httpsResult.hsts || '');
  const pass = httpResult.redirects_to_https === true && httpsResult.authorized === true && /^TLSv1\.[23]$/.test(String(httpsResult.protocol || '')) && /max-age=\d+/i.test(hsts);
  if (!pass) failed = true;
  evidence.hosts.push({ host, pass, http: httpResult, https: httpsResult });
}

fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (failed) process.exitCode = 1;
