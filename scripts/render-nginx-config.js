// SPDX-License-Identifier: GPL-3.0-only
// Deployment-time generator only. The running API uses nginx QuickJS, not Node.
const path = require('node:path');
function optionsFrom(args) {
  const permitted = new Set(['prefix', 'client-root', 'script', 'resolver', 'ca-bundle', 'listen', 'server-name']);
  const values = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (!args[i]?.startsWith('--') || !permitted.has(key) || !args[i + 1] || args[i + 1].startsWith('--') || key in values) {
      throw new Error('Invalid option: ' + String(args[i]));
    }
    values[key] = args[i + 1];
  }
  if (!values.prefix || !values.resolver || !values['ca-bundle']) {
    throw new Error('Usage: node scripts/render-nginx-config.js --prefix /your/path/ --resolver 127.0.0.53 --ca-bundle /etc/ssl/certs/ca-certificates.crt [--listen 8080] [--client-root /abs/path/src/client] [--script /abs/path/nginx/player.js] [--server-name example.com]');
  }
  return values;
}
function nginxPath(value) {
  if (!path.isAbsolute(value) || /[\r\n\0]/.test(value)) throw new Error('nginx paths must be absolute and single-line');
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
function render(values) {
  const prefix = values.prefix;
  if (!/^\/(?:[A-Za-z0-9_.~-]+\/)*$/.test(prefix) || prefix.includes('/../') || prefix.includes('/./')) {
    throw new Error('prefix must be a canonical URI path such as / or /watch/ (ending with /)');
  }
  const port = Number(values.listen || '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid listen port');
  const serverName = values['server-name'] || '_';
  if (!/^[A-Za-z0-9.*_-]+$/.test(serverName)) throw new Error('Invalid server name');
  const resolver = values.resolver;
  if (!/^[0-9a-fA-F.:]+$/.test(resolver)) throw new Error('resolver must be an IPv4 or IPv6 address');
  const client = path.resolve(values['client-root'] || path.join(__dirname, '..', 'src', 'client')) + path.sep;
  const handler = path.resolve(values.script || path.join(__dirname, '..', 'nginx', 'player.js'));
  const ca = path.resolve(values['ca-bundle']);
  const redirect = prefix === '/' ? '' : '    location = ' + prefix.slice(0, -1) + ' { return 308 ' + prefix + '; }\n';
  return [
    '# Include inside nginx http {} (requires ngx_http_js_module and njs >= 0.9.1).',
    'server {',
    '    listen ' + port + ';',
    '    server_name ' + serverName + ';',
    '    js_engine qjs;',
    '    js_import player from ' + nginxPath(handler) + ';',
    '    resolver ' + resolver + ' valid=300s;',
    '    js_fetch_trusted_certificate ' + nginxPath(ca) + ';',
    '    js_fetch_verify on;',
    '    js_fetch_timeout 12s;',
    '    js_fetch_max_response_buffer_size 16m;',
    redirect.trimEnd(),
    '    location ^~ ' + prefix + 'api/ {',
    '        js_content player.api;',
    '        add_header Cache-Control "no-store" always;',
    '    }',
    '    location ^~ ' + prefix + ' {',
    '        alias ' + nginxPath(client) + ';',
    '        index index.html;',
    '        try_files $uri $uri/ =404;',
    '        add_header X-Content-Type-Options "nosniff" always;',
    '        add_header Referrer-Policy "no-referrer" always;',
    '        add_header Content-Security-Policy "default-src \'none\'; script-src \'self\' \'unsafe-eval\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:; media-src \'self\' https: blob:; connect-src \'self\'; font-src \'self\'; frame-ancestors \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'" always;',
    '    }',
    '}',
    ''
  ].filter(Boolean).join('\n');
}
if (require.main === module) {
  try { process.stdout.write(render(optionsFrom(process.argv.slice(2)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { render, optionsFrom };
