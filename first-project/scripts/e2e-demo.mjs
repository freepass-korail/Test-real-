/**
 * headed 데모 — 실보행보다 빠른 GPS 주입
 * E2E_DEMO=1 → slowMo + GPS timeScale≈1.7
 */
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  E2E_DEMO: '1',
  E2E_TIME_SCALE: process.env.E2E_TIME_SCALE || '1.7',
  E2E_SLOWMO: process.env.E2E_SLOWMO || '250',
  E2E_STEP_PAUSE_MS: process.env.E2E_STEP_PAUSE_MS || '700',
};

const args = ['playwright', 'test', '--headed', '--workers=1', ...process.argv.slice(2)];
const ticketId = process.env.E2E_TICKET_ID || '19';
console.log(`[E2E DEMO] 보행 (timeScale=1.7, Chrome 창) | ticketId=${ticketId}`);
console.log('[E2E DEMO] GPS만 시나리오 — TTS는 실제 BE');
console.log('[E2E DEMO] S2 앱 허용 → OS 위치 알림「허용」을 사람처럼 클릭');
console.log('[E2E DEMO] 한 시나리오: npm run test:e2e:demo -- -g "1_해피케이스"');
console.log(`[E2E DEMO] 티켓 지정: $env:E2E_TICKET_ID='${ticketId}'; npm run test:e2e:demo -- -g "1_해피케이스"`);

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args,
  { stdio: 'inherit', shell: true, env },
);
child.on('exit', (code) => process.exit(code ?? 1));
