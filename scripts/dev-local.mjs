import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeDir = process.env.VOCAB_LOCAL_RUNTIME_DIR
  ? resolve(process.env.VOCAB_LOCAL_RUNTIME_DIR)
  : join(root, '.runtime', 'elis-local');
if (!runtimeDir.split(/[\\/]/).includes('.runtime')) {
  throw new Error('Local test runtime must be inside a .runtime directory.');
}
const port = 8789;
const children = [];
let watcher, rebuildTimer, stopping = false;
const pause = ms => new Promise(r => setTimeout(r, ms));
await mkdir(runtimeDir, { recursive: true });

let alreadyRunning = false;
try {
  const previous = JSON.parse(await readFile(join(runtimeDir, 'connection.json'), 'utf8'));
  const health = await (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })).json();
  const metadata = await (await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`, { signal: AbortSignal.timeout(1000) })).json();
  if (previous.dataDir === resolve(runtimeDir, 'data') && health.login_configured && metadata.resource === previous.endpoint) {
    console.log(`Elis LOCAL TEST is already running: ${previous.endpoint}`);
    console.log('Use the existing test connection. Stop its original command with Ctrl+C when finished.');
    alreadyRunning = true;
  }
} catch { /* No matching running local test; start one below. */ }

if (!alreadyRunning) {
function terminate(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else child.kill('SIGTERM');
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  watcher?.close();
  clearTimeout(rebuildTimer);
  for (const child of [...children].reverse()) terminate(child);
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());

function build() {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('UI build failed. Fix the build error before testing.');
}

try {
  // Do not accidentally take over another service or start a second tunnel.
  await new Promise((yes, no) => {
    const probe = createServer();
    probe.once('error', () => no(new Error(`Port ${port} is occupied. Stop the existing local test first.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(yes));
  });
  build();
  const passwordPath = join(runtimeDir, 'owner-password.txt');
  let password;
  try { password = (await readFile(passwordPath, 'utf8')).trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!password) {
    password = randomBytes(32).toString('base64url');
    await writeFile(passwordPath, password + '\n', { mode: 0o600, flag: 'wx' });
  }
  if (password.length < 20) throw new Error('Local test password must contain at least 20 characters.');
  const tunnelConfig = join(runtimeDir, 'tunnel.yml');
  await writeFile(tunnelConfig, '{}\n');
  const log = await open(join(runtimeDir, 'tunnel.log'), 'w');
  const tunnel = spawn('cloudflared', ['tunnel', '--config', tunnelConfig, '--no-autoupdate', '--protocol', 'http2', '--edge-ip-version', '4', '--url', `http://127.0.0.1:${port}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  let tunnelError, tunnelText = '', origin;
  tunnel.on('error', error => { tunnelError = error; });
  const onTunnelOutput = chunk => {
    log.write(chunk).catch(() => {});
    tunnelText = (tunnelText + chunk.toString()).slice(-24000);
    origin ||= tunnelText.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  };
  tunnel.stdout.on('data', onTunnelOutput);
  tunnel.stderr.on('data', onTunnelOutput);
  for (let i = 0; i < 60 && !origin; i++) {
    if (tunnelError) throw tunnelError;
    if (tunnel.exitCode !== null) throw new Error('HTTPS tunnel stopped. See .runtime/elis-local/tunnel.log.');
    await pause(1000);
  }
  if (!origin) throw new Error('No HTTPS tunnel address was returned. See .runtime/elis-local/tunnel.log.');
  const env = {
    ...process.env,
    HOST: '127.0.0.1', PORT: String(port),
    VOCAB_DATA_DIR: resolve(runtimeDir, 'data'),
    VOCAB_PUBLIC_URL: origin, VOCAB_OWNER_PASSWORD: password,
    VOCAB_REDIRECT_URIS: 'https://chatgpt.com/connector_platform_oauth_redirect',
    VOCAB_LOCAL_INSTANCE_ID: randomBytes(16).toString('hex'),
  };
  const envText = ['HOST', 'PORT', 'VOCAB_DATA_DIR', 'VOCAB_PUBLIC_URL', 'VOCAB_OWNER_PASSWORD', 'VOCAB_REDIRECT_URIS', 'VOCAB_LOCAL_INSTANCE_ID'].map(key => `${key}=${env[key].replaceAll('\\', '/')}`).join('\n');
  await writeFile(join(runtimeDir, '.env'), envText + '\n', { mode: 0o600 });
  const serverLog = await open(join(runtimeDir, 'server.log'), 'a');
  const server = spawn(process.execPath, ['--watch', '--watch-preserve-output', '--watch-path', join(root, 'server'), '--watch-path', join(root, 'shared'), '--watch-path', join(root, 'scripts', 'local-test-server.mjs'), 'scripts/local-test-server.mjs'], { cwd: root, env, windowsHide: true, stdio: ['ignore', serverLog.fd, serverLog.fd] });
  children.push(server);
  server.on('error', error => { console.error(error.message); stop(1); });
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    try {
      const health = await (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })).json();
      ready = health.service === 'vocabulary-context' && health.login_configured;
    } catch {}
    if (!ready) await pause(1000);
  }
  if (!ready) throw new Error('Local server did not become ready. See .runtime/elis-local/server.log.');
  await writeFile(join(runtimeDir, 'connection.json'), JSON.stringify({ name: 'Elis 本地测试', origin, endpoint: `${origin}/mcp`, port, dataDir: env.VOCAB_DATA_DIR, launcherPid: process.pid, startedAt: new Date().toISOString() }, null, 2));
  watcher = watch(join(root, 'web'), { recursive: true }, (_event, filename) => {
    if (!filename || !/\.(jsx?|css)$/.test(filename) || filename.startsWith('dist')) return;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { try { build(); console.log('UI rebuilt. Reopen the local test widget in ChatGPT.'); } catch (error) { console.error(error.message); } }, 350);
  });
  tunnel.once('exit', () => { if (!stopping) { console.error('HTTPS tunnel stopped. Restart npm run dev:local.'); stop(1); } });
  console.log(`\nElis LOCAL TEST ready: ${origin}/mcp`);
  console.log('Source changes restart the local server; UI changes rebuild automatically.');
  console.log(`Test data: ${join(runtimeDir, 'data')} (separate from online data).`);
  console.log(`Password file: ${passwordPath} (never printed).`);
  console.log('Keep this command running. Ctrl+C stops local testing. A new tunnel session has a new address.');
} catch (error) {
  console.error(error.message);
  stop(1);
}
}
