# freepass_korail (Frontend)

코레일 역 내부 경로 안내 **프론트엔드**. SMS 문자 링크(`?ticketId=`)로 진입하고, **백엔드가 내려준 경로(route)** 를 따라 GPS·기기 방향 센서로 실시간 안내한다.

**라이브 데모:** [https://freepass-korail.vercel.app/](https://freepass-korail.vercel.app/)

---

## 기술 스택

- **React 19**, **Vite 8**
- **Zustand** — 화면 흐름·경로·내비게이션 상태
- **styled-components** — 컴포넌트 스타일
- **Tailwind CSS 4** — 유틸리티 (Vite 플러그인)
- **Figma 절대 좌표 레이아웃** — `figmaLayout.js`
- **Geolocation API** + **DeviceOrientation API** — 위치·나침반
- **Vibration API** — 도착 햅틱 (Android 등)
- **Playwright** — GPS 시나리오 E2E (`e2e/`)

---

## 백엔드 API

베이스 URL: `http://43.201.30.167:8080`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tickets/{ticketId}/guide` | **문자 링크 권장** — 승차권 ID 기준 경로 |
| GET | `/api/tickets/{ticketId}/guide/steps` | 단계별 문구·TTS + **states** 예외 카탈로그 |
| POST | `/sms/test/{ticketId}` | 안내 문자 즉시 발송(테스트) |
| GET | `/api/users/{userId}/guide` | 오늘 승차권 경로 (레거시) |
| GET | `/api/users/{userId}/guide/steps` | 단계별 안내 (레거시) |
| GET | `/api/paths?from=&to=` | 노드 간 최적 경로 |
| GET | `/api/tickets/{ticketId}` | 승차권 단건 |
| GET | `/api/users/{userId}/tickets` | 유저 승차권 목록 |

### GuideStepsResponse.states

| state | 사용처 |
|-------|--------|
| `OFF_ROUTE` | 경로 이탈 |
| `DESTINATION_PASSED` | 지나침/반대방향 |
| `DEPARTURE_TIME_PASSED` | 출발 시간 만료 |
| `ARRIVED` | 도착 화면 S5_1 (`탑승 승강장에 도착했습니다.` 등) |

---

## 진입·화면 흐름

```
URL ?ticketId=19  (권장 — 문자 링크)
  └─ GET /api/tickets/{id}/guide (+ /guide/steps)
       → S1 → S2(권한) → S3(층) → S4 → S5 → S5_1(도착)

?userId=  / ?token=  — 레거시·세션
쿼리 없음 → SMS 화면에서 ticketId 입력
```

| step | 화면 |
|------|------|
| `S1`~`S4` | 시작·권한·층·타는 곳 |
| `S5` | 실시간 길찾기 |
| `S5_1` | 도착 (`ARRIVED` 문구·TTS) |
| `E1`~`E6` | 정적 안내·예외 |

---

## 도착 판정 (요약)

- UI 남은거리 = **다음 목표 노드까지** BE remain (`getRemainingToTargetM`)
- **긴 마지막 구간(>20m):** remain ≤ **20m** → S5_1
- **짧은 마지막 구간(≤20m, 예 n11→n12≈19m):** 구간 진입만으로 remain≤20이 되어 조기 도착하지 않도록, **최종 노드 근접·통과 후** 도착
- 화면 **0m**는 표시하지 않고 바로 도착 화면으로 전환
- S5_1 문구·음성은 BE `states.ARRIVED` 사용

---

## 실행 방법

### 설치·환경변수

```bash
npm install
```

```bash
# .env
VITE_API_PROXY_TARGET=http://43.201.30.167:8080
# 문자/딥링크 origin (배포 URL 변경 시)
# VITE_APP_ORIGIN=https://freepass-korail.vercel.app
```

### 개발 서버

```bash
npm run dev
```

```
http://localhost:5173/?ticketId=19
https://freepass-korail.vercel.app/?ticketId=19
```

**BE SMS에 넣을 링크:**  
`https://freepass-korail.vercel.app/?ticketId={ticketId}`  
(`src/api/ticketUrl.js`의 `APP_ORIGIN` / `VITE_APP_ORIGIN`)

- HTTPS(또는 localhost)에서 위치·나침반 동작
- 카카오톡 인앱 브라우저는 위치 권한 이슈 가능 → Safari 권장

### Unit test (Vitest)

`geo.js`의 도착 판정·진행거리 역산·화살표 회전각 로직 등 순수 함수 검증.

```bash
npm test
```

### E2E (Playwright)

GPS만 시나리오 주입. `guide` / TTS는 **실제 BE**.

```bash
npm run test:e2e                              # CI용 headless (빠름)
$env:E2E_TICKET_ID='51'; npm run test:e2e:browser -- -g "1_해피케이스"   # Chrome 창
$env:E2E_TICKET_ID='51'; npm run test:e2e:demo -- -g "1_해피케이스"      # 사람 보행 속도
npm run test:e2e:ui                           # Playwright UI
```

| 변수 | 의미 |
|------|------|
| `E2E_TICKET_ID` | 승차권 ID (기본 19) |
| `E2E_TIME_SCALE` | 클수록 GPS 주입 빠름 (demo 기본 1.7, browser 기본 3) |

상세: [`e2e/README.md`](e2e/README.md)

### Chrome Sensors 수동 테스트

1. `/?ticketId=19` → S5  
2. DevTools → Sensors → Custom location  
3. S5 화면 탭(TTS 잠금 해제) 후 노드 좌표 순회  

### 빌드·배포

```bash
npm run build
npm run preview
```

Vercel 연결. API가 다른 도메인이면 `VITE_API_PROXY_TARGET` 또는 `/api` 프록시 설정.  
배포 URL을 바꾸면 `VITE_APP_ORIGIN`과 BE SMS 템플릿도 함께 갱신한다.

---

## 주요 판정 수치 (`geo.js`)

| 상수 | 값 | 의미 |
|------|-----|------|
| `ARRIVAL_RADIUS_M` | 20m | 긴 마지막 구간 remain 도착 기준 |
| `ROUTE_FINAL_NODE_SNAP_M` | 8m | 최종 노드 평면 근접 시 s 스냅 (remain≤20일 때만) |
| `ROUTE_NODE_SNAP_M` | 3m | 중간 노드 cum 스냅 |
| `OVERSHOOT_THRESHOLD_M` | 15m | 지나침 |
| `OFF_ROUTE_THRESHOLD_M` | 20m | 경로 이탈 |
| `MAX_TURN_DEG_PER_SEC` | 120°/s | 화살표 초당 최대 회전각 — 자기장 왜곡으로 heading이 순간 뒤집혀도 회전 속도는 일정 |
| `ARROW_HALF_LIFE_MS` | 450ms | 위 상한 안에서 목표각을 얼마나 빨리 따라잡을지(반감기 감쇠) |
| `DEST_LOOKAHEAD_M` | 4m | 목표 노드 근접 시 다음 노드 쪽으로 조준점을 미리 트는 반경 |

---

## 프로젝트 구조 (핵심)

```
src/
├─ api/bootstrapGuide.js   # ?ticketId= 부트스트랩
├─ api/ticketUrl.js        # 문자용 공개 URL
├─ hooks/useNavigationTracking.js
├─ utils/geo.js / guideStates.js / session.js
├─ components/S5_Navigation.jsx / S5_1_Arrived.jsx
e2e/                       # Playwright GPS 시나리오
scripts/e2e-browser.mjs    # Chrome 창 E2E
```

---

## sessionStorage

재접속 시 "재개"로 인해 예전 경로(routeSteps)가 GPS와 맞물려 곧장 도착 상태로
튀는 문제가 있어, 세션 저장·복원(`saveSession`/`loadSession`)은 **전면
비활성화**되어 있다. 재접속·새로고침 시 항상 S1부터 새로 시작한다.
