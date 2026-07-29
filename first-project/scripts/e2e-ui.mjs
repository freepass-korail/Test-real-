/**
 * Playwright UI — Chrome unsafe port(예: 10080) 회피
 * @see https://chromium.googlesource.com/chromium/src/+/master/net/base/port_util.cc
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const BLOCKED = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143,
  161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554,
  556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045,
  5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

const PREFERRED = [9323, 9324, 9333, 9400, 9450, 9500, 9600, 18080, 19080];

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function pickPort() {
  for (const p of PREFERRED) {
    if (BLOCKED.has(p)) continue;
    if (await canListen(p)) return p;
  }
  // 임의 포트 — blocked면 스킵
  for (let i = 0; i < 40; i += 1) {
    const p = 9200 + Math.floor(Math.random() * 600);
    if (BLOCKED.has(p)) continue;
    if (await canListen(p)) return p;
  }
  throw new Error('안전한 빈 UI 포트를 찾지 못했습니다.');
}

const port = await pickPort();
const host = '127.0.0.1';
console.log(`[E2E UI] http://${host}:${port}  (unsafe port 회피)`);
console.log('[E2E UI] 미리보기가 또 blank면 npm run test:e2e:headed 로 실제 Chrome을 보세요.');

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'test', '--ui', `--ui-host=${host}`, `--ui-port=${port}`, '--workers=1', ...process.argv.slice(2)],
  { stdio: 'inherit', shell: true, env: { ...process.env } },
);

child.on('exit', (code) => process.exit(code ?? 1));
