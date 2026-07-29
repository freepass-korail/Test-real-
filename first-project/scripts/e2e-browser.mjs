/**
 * Chrome 창 브라우저 테스트 — ticketId / 시나리오 확인용
 * E2E_DEMO=1 → headed + 사람처럼 클릭, GPS는 테스트용으로 데모보다 빠르게
 *
 * 예:
 *   $env:E2E_TICKET_ID='51'; npm run test:e2e:browser -- -g "1_해피케이스"
 */
import { spawn } from 'node:child_process';

const ticketId = process.env.E2E_TICKET_ID || '19';

const env = {
  ...process.env,
  E2E_DEMO: '1',
  E2E_TICKET_ID: ticketId,
  E2E_TIME_SCALE: process.env.E2E_TIME_SCALE || '3',
  E2E_SLOWMO: process.env.E2E_SLOWMO || '150',
  E2E_STEP_PAUSE_MS: process.env.E2E_STEP_PAUSE_MS || '400',
};

const args = ['playwright', 'test', '--headed', '--workers=1', ...process.argv.slice(2)];
console.log(`[E2E BROWSER] Chrome 창 | ticketId=${ticketId} | timeScale=${env.E2E_TIME_SCALE}`);
console.log('[E2E BROWSER] GPS 시나리오 + 실제 BE TTS');
console.log(
  `[E2E BROWSER] 예: $env:E2E_TICKET_ID='51'; npm run test:e2e:browser -- -g "1_해피케이스"`,
);

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args,
  { stdio: 'inherit', shell: true, env },
);
child.on('exit', (code) => process.exit(code ?? 1));
