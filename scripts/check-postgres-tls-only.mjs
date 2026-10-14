import { readFileSync } from 'node:fs';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { X509Certificate } from 'node:crypto';

// PostgreSQL SSLRequest followed by TLS only. No startup/authentication/SQL.
const [host, certificatePath] = process.argv.slice(2);
if (!host || !/^[a-z0-9.-]+$/.test(host) || !certificatePath) {
  throw new Error('usage: check-postgres-tls-only.mjs <host> <public-ca.pem>');
}
const ca = readFileSync(certificatePath, 'utf8');
const root = new X509Certificate(ca);
if (!root.ca || Date.now() >= Date.parse(root.validTo) || Date.now() < Date.parse(root.validFrom)) {
  throw new Error('invalid_or_expired_ca');
}
await new Promise((resolve, reject) => {
  const socket = connectTcp({host, port:5432});
  let encrypted;
  const timer = setTimeout(() => fail(new Error('tls_probe_timeout')), 15000);
  const fail = error => {
    clearTimeout(timer);
    encrypted?.destroy();
    socket.destroy();
    reject(error);
  };
  socket.once('error', fail);
  socket.once('connect', () => {
    const request = Buffer.alloc(8);
    request.writeInt32BE(8, 0);
    request.writeInt32BE(80877103, 4);
    socket.write(request);
  });
  socket.once('data', response => {
    if (response.length !== 1 || response[0] !== 83) return fail(new Error('postgres_ssl_not_accepted'));
    encrypted = connectTls({socket, servername:host, ca, rejectUnauthorized:true});
    encrypted.once('error', fail);
    encrypted.once('secureConnect', () => {
      if (!encrypted.authorized) return fail(new Error('tls_not_authorized'));
      clearTimeout(timer);
      console.log(JSON.stringify({
        tls_verified:true, hostname_verified:true, protocol:encrypted.getProtocol(),
        ca_sha256:root.fingerprint256, authentication_sent:false, sql_sent:false,
      }));
      encrypted.destroy();
      resolve();
    });
  });
});
