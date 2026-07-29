# 내비 GPS 시나리오 E2E (Playwright)

**시뮬레이션은 GPS 좌표열만.** `guide` / `guide/steps` 와 TTS(`audioBase64`)는 실제 백엔드를 그대로 씁니다.  
시나리오대로 “사용자가 걸어가는 좌표”가 바뀌고, 통과선마다 **실제 음성안내**가 재생됩니다.

## 실행

```bash
npm run test:e2e          # 실제 BE + GPS 시나리오 (빠른 CI, timeScale≈12)
npm run test:e2e:browser  # Chrome 창으로 보기 (ticketId 지정 가능)
npm run test:e2e:headed   # Chrome 창 + 사람 보행 속도 (demo와 동일)
npm run test:e2e:demo     # 사람 보행 속도 + 실제 TTS 청취
npm run test:e2e:ui       # UI 모드
```

### Chrome 창 + 특정 승차권

```powershell
$env:E2E_TICKET_ID='51'; npm run test:e2e:browser -- -g "1_해피케이스"
```

(`test:e2e`는 headless CI용. 브라우저로 보려면 `test:e2e:browser` / `test:e2e:demo`)

### 실제 음성안내 조건
- 문자 링크: `https://freepass-korail.vercel.app/?ticketId={id}` → `GET /api/tickets/{id}/guide` + `/guide/steps`
- BE에 해당 승차권이 있어야 함 (예: ticketId=19)
- `Audio.play` 는 stub 하지 않음 → headed/demo에서 스피커로 들림
- **guide API는 page.route로 가로채지 않음** — 항상 실제 BE 응답

### webServer / 재현성
- Playwright가 Vite를 `127.0.0.1:5173`에 띄움
- ready URL: `/?e2e=1`
- `workers: 1`, `trace: 'on'`

### 사람 속도로 보기 (데모)

```bash
npm run test:e2e:demo -- -g "1_해피케이스"
```

S2 흐름: 앱 **「위치 허용」** → (시뮬레이션) **OS 위치 알림「허용」**.  
데모에서는 각 화면을 잠깐 보여 준 뒤 hover→클릭으로 **사람이 누르는 것처럼** 보입니다.  
(Playwright는 위치를 미리 허용해서 진짜 OS 팝업이 안 뜨므로, `?e2e=1`일 때 앱이 동일 화면을 띄웁니다.)

| 변수 | 기본(DEMO) | 의미 |
|------|------------|------|
| `E2E_TIME_SCALE` | **1.7** | 1=실보행. 클수록 빠름 |
| `E2E_SLOWMO` | 250 | 클릭마다 추가 ms |
| `E2E_STEP_PAUSE_MS` | 700 | 화면 전환 사이 멈춤 |

### UI에서 로그
1. ▶ 실행 → 끝난 테스트 클릭
2. **Console** 탭에서 `[NAV]` / `[TTS]` / `[E2E]`
3. Attachments → `*.report.json`

## 시나리오

`e2e/fixtures/scenarios.json` — `pathMode`로 **실제 BE nodeId**에 바인딩

| 시나리오 | pathMode | 검증 |
|----------|----------|------|
| `1_해피케이스` | full | 완주 + 음성 재생 |
| `2a_옆으로_이탈후_복귀` | deviate | 이탈 감지 |
| `2b_반대방향_후퇴후_재전진` | backtrack | 거리 증가·재안내 |
| `3_중간정지` | pause | 정지 중 안정 |

## 환경

| 항목 | 기본 | 비고 |
|------|------|------|
| guide/steps | **실제 BE** | Vite 프록시 |
| GPS | `__setMockGeo` | 시나리오 좌표만 가짜 |
| TTS | BE `audioBase64` | play stub 없음 |
| API mock | **없음** | `page.route` 제거 — 항상 LIVE BE |

좌표만 시나리오 주입. `guide-user1.json`은 참고용 스냅샷이며 E2E에서 fulfill하지 않습니다.
