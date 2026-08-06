# freepass_korail (Frontend)

코레일 역 내부 경로 안내 **프론트엔드**. SMS 문자 링크(`?ticketId=`)로 진입하고, **백엔드가 내려준 경로(route)** 를 따라 GPS·기기 방향 센서로 실시간 안내한다.

**라이브 데모:** [https://freepass-korail.vercel.app/](https://freepass-korail.vercel.app/)  
**인수인계:** [`docs/HANDOVER.md`](docs/HANDOVER.md) — 환경·구조·API·배포·계정 전달용

> 웹앱은 UWB가 아니라 **GPS + 나침반 + BE 구간 방위(`headingBearing`)** 조합이다.  
> 실내(역사)에서는 GPS 오차가 커지므로, 화살표는 저정확도일 때 **복도 방향(headingBearing)** 을 우선한다.

---

## 기술 스택

- **React 19**, **Vite 8**
- **Zustand** — 화면 흐름·경로·내비게이션 상태 (`useFlowStore`)
- **styled-components** — 컴포넌트 스타일
- **Tailwind CSS 4** — 유틸리티 (Vite 플러그인)
- **Figma 절대 좌표 레이아웃** — `figmaLayout.js`
- **Geolocation API** — `watchPosition` (고정확도, `maximumAge: 0`)
- **DeviceOrientation API** — 나침반 (`webkitCompassHeading` / `alpha`)
- **Vibration API** — 도착 햅틱 (Android 등)
- **Vitest** — `geo.js` / 나침반 / normalize 단위 테스트
- **Playwright** — GPS 시나리오 E2E (`e2e/`)

---

## BE vs FE 역할

| | 백엔드 | 프론트엔드 |
|--|--------|------------|
| 경로 노드 `lat/lng` | ✅ | 표시·투영에 사용 |
| 안내 문구·TTS (`guide/steps`, `states`) | ✅ | 재생·화면 표시 |
| 구간 거리 `distanceToNextM` / `cumulativeDistanceM` | ✅ | UI 남은거리·진행도 스케일 |
| 구간 진행 방위 `headingBearing` | ✅ 제공 | **화살표 복도 방향으로 사용** |
| 실시간 위치·진행·이탈·도착 | — | ✅ GPS 투영 + 판정 |
| 화살표 회전각 | — | ✅ `안내방위 − 폰 heading` → CSS rotate |
| 경로 이탈 재탐색 | 경로 API | ✅ 이탈 감지 후 호출·경로 교체 |

---

## 백엔드 API

베이스 URL: `http://43.201.30.167:8080`  
로컬은 Vite 프록시(`/api`) + `VITE_API_PROXY_TARGET` 사용.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tickets/{ticketId}/guide` | **문자 링크 권장** — 승차권 ID 기준 경로 |
| GET | `/api/tickets/{ticketId}/guide/steps` | 단계별 문구·TTS + **states** 예외 카탈로그 |
| POST | `/sms/test/{ticketId}` | 안내 문자 즉시 발송(테스트) |
| GET | `/api/users/{userId}/guide` | 오늘 승차권 경로 (레거시) |
| GET | `/api/users/{userId}/guide/steps` | 단계별 안내 (레거시) |
| GET | `/api/paths?from=&to=` | 노드 간 최적 경로 (재탐색 폴백) |
| GET | `/api/tickets/{ticketId}` | 승차권 단건 |
| GET | `/api/users/{userId}/tickets` | 유저 승차권 목록 |
| GET | `/api/v1/guide/sessions/{token}` | 세션 토큰 조회 (레거시) |
| POST | `/api/v1/guide/routes` | lat/lng 기준 경로 (재탐색 3순위) |
| POST | `/api/v1/guide/complete` | 보호자 알림 — 길찾기 완료 |

### GuideStepsResponse.states

| state | 사용처 |
|-------|--------|
| `OFF_ROUTE` | 경로 이탈 |
| `DESTINATION_PASSED` | 지나침/반대방향 |
| `DEPARTURE_TIME_PASSED` | 출발 시간 만료 |
| `ARRIVED` | 도착 화면 S5_1 (`탑승 승강장에 도착했습니다.` 등) |

### directions / step 필드 (경로 안내용)

| 필드 | 의미 |
|------|------|
| `text` / `screenText` | 안내 문구 (문구 속 `19m` 등은 **고정 문구**, 실시간 remain과 다를 수 있음) |
| `maneuver` | 직진·회전 등 |
| `distanceToNextM` | 다음 노드까지 BE 거리 |
| `cumulativeDistanceM` | 출발부터 누적 거리 |
| `headingBearing` | **구간 진행 방위(°)** — GPS와 무관한 “복도 방향”. 화살표 저정확도 모드의 1순위 |

> `normalizePath` / `normalizeRouteStep` 모두 `headingBearing`을 보존한다.  
> v1 `guide/routes` 재탐색 경로에서도 유실되면 안 된다.

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
| `S5` | 실시간 길찾기 (화살표·남은거리·이탈/지나침) |
| `S5_1` | 도착 (`ARRIVED` 문구·TTS) |
| `S5_2` | 대체 경로 안내 |
| `E1`~`E6` | 정적 안내·예외 (환불·출발지남·티켓없음 등) |

### 권한 (S2)

- 위치 허용 시 **실제 GPS**로 맵 중심 이동
- GPS 미확보 시 fallback: `STATION_START` = BE 출발 기준 **n02(갈림길)** 좌표  
  (`src/constants/station.js`)
- 위치 거부 시 안내 모달 + Safari/인앱 브라우저 힌트
- iOS는 방향·모션 권한 별도 요청

### 출발 TTS fallback

BE `guide/steps`가 출발 노드(예: n01)를 빼먹는 경우가 있다.  
`bootstrapGuide.js`의 `fillMissingStartGuide`가 route `directions` 문구로 화면/음성을 채운다.  
(현재 BE는 steps가 n02부터인 경우가 많음)

---

## 실시간 내비게이션 파이프라인

핵심 파일: `hooks/useNavigationTracking.js` + `utils/geo.js`

```
watchPosition (GPS)
  → accuracy/점프 필터 + EMA 스무딩
  → 경로 폴리라인 투영 (progressM)
  → 출발 잠금 / 초반 노드 스킵 방지 (gateProgressFromStart)
  → 남은거리 · 통과 노드 · 안내 문구
  → 이탈 / 지나침 / 도착 판정
  → (이탈 시) fetchReroute → 경로 교체

DeviceOrientation (나침반)
  → webkitCompassAccuracy 게이트
  → heading

getGuidanceBearing (방위)
  → headingBearing(복도) ↔ GPS 정밀 조준 블렌드
  → destinationAngle = bearing − heading
  → CSS transform: rotate(...)
```

### 1) GPS 필터

| 상수 | 값 | 의미 |
|------|-----|------|
| `enableHighAccuracy` | `true` | 고정확도 |
| `maximumAge` | `0` | 캐시 위치 미사용 |
| `GPS_SOFT_ACCURACY_M` | 25m | soft~hard: 수락하되 EMA 가중 낮춤 |
| `GPS_MAX_ACCURACY_M` | 50m | hard 초과 샘플은 거의 무시 |
| `GPS_POS_SMOOTH_ALPHA` | 0.2 | 위치 EMA |
| `GPS_MOVE_DEADBAND_M` | 5m | 제자리 흔들림 시 remain 숫자 고정 |
| `GPS_MAX_SPEED_MPS` | 3 | 보행 이상 속도 컷 |

### 2) Localization · 출발 잠금 · 초반 노드

실내 GPS가 승강장/에스컬레이터 쪽에 잡히면, 투영만 쓰면 출발 안내가 통째로 스킵된다.

| 상수 | 값 | 의미 |
|------|-----|------|
| `LOCALIZE_MAX_ROUTE_DIST_M` | 35m | 첫 fix가 경로 이내면 그 투영점으로 진입 |
| `START_ENGAGE_RADIUS_M` | 30m | 출발 노드 이내로 들어오기 전 progress 잠금 |
| `EARLY_NODE_COUNT` | 2 | n01·n02 순서 통과 강제 |
| `EARLY_PROGRESS_JUMP_M` | 6m | 초반 한 틱 최대 점프 (짧은 ~9m 구간 대응) |
| `MAX_PROGRESS_JUMP_M` | 45m | 초반 이후 점프 상한 |
| `EARLY_NODE_SNAP_M` | 2m | 초반 스냅 상한 (간격 비율로 더 작아짐) |
| `PROGRESS_BACKTRACK_HYSTERESIS_M` | 12m | 이만큼 뒤로 밀릴 때만 progress 감소 |

### 3) 남은거리 UI

- 큰 `m` 숫자 = **다음 목표 노드까지** BE remain (`getRemainingToTargetM` / `distanceToNextM` 스케일)
- 안내 문구 안 `19m` 등은 BE `screenText` **고정** — 라이브 remain과 어긋날 수 있음
- 화면 **0m**는 표시하지 않고 바로 도착 화면으로 전환

### 4) 화살표 방위 (`headingBearing` 사용)

실내에서 GPS 점이 옆으로 튀면 “내 위치 → 다음 노드” 방위가 크게 틀어진다.  
그래서 **BE `headingBearing`(복도 방향)** 을 우선한다.

| 모드 | 조건 | 동작 |
|------|------|------|
| `segment` | accuracy가 목표거리보다 큼 / 저정확도 | **복도 방위만** (`headingBearing` → 없으면 노드 간 Haversine) |
| `precise` | accuracy 좋음 | 경로 투영점 → 목표 조준 |
| `blend` | 중간 | 두 방위를 비율 블렌드 |

관련 상수:

| 상수 | 값 | 의미 |
|------|-----|------|
| `BEARING_TRUST_RATIO` | 0.5 | 이하면 정밀 조준 신뢰 |
| `BEARING_DEGRADE_RATIO` | 1.0 | 이상이면 복도만 |
| `LOW_ACCURACY_M` | 25m | UI·지나침 오탐 억제용 저정확도 |
| `COMPASS_MAX_ACCURACY_DEG` | 25° | `webkitCompassAccuracy` 초과면 heading 무시(마지막 정상값 유지) |
| `DEST_LOOKAHEAD_M` | 4m | 목표 근접 시 다음 노드 쪽으로 aim |
| `ARROW_HALF_LIFE_MS` | 90ms | `useFollowAngle` 추종 반감기 |

S5에서 `accuracyM > LOW_ACCURACY_M`이면 나침반/화살표를 **흐리게** 하고, maneuver/`screenText`를 주 단서로 둔다.

콘솔(방위 소스 전환 시에만):

```
[NAV] arrow bearing=segment acc=38m seg=351° gps=204°
```

### 5) 경로 이탈 · 재탐색

| 상수 | 값 | 의미 |
|------|-----|------|
| `OFF_ROUTE_THRESHOLD_M` | 20m | GPS ↔ 경로 폴리라인 최단거리 |
| `OFF_ROUTE_HIT_COUNT` | 3 | 연속 히트 후 이탈 확정 |
| `OFF_ROUTE_CLEAR_COUNT` | 2 | 복귀 확정 |
| 재탐색 쿨다운 | 8s | 연속 API 호출 방지 |

이탈 확정 시 `fetchReroute` (`api/reroute.js`) 우선순위:

1. `GET /api/tickets/{id}/guide?fromNode=` (가장 가까운 경로 노드)
2. `GET /api/paths?from=&to=`
3. `POST /api/v1/guide/routes` (lat/lng)

성공하면 `applyGuideSteps`로 경로·TTS를 갈아끼운다.

### 6) 지나침 / 반대방향

| 상수 | 값 | 의미 |
|------|-----|------|
| `OVERSHOOT_THRESHOLD_M` | 15m | 마지막 노드 지나침 |
| `WRONG_DIRECTION_ANGLE_DEG` | 90° | 반대방향 각도 |
| `WRONG_DIRECTION_AWAY_M` | 3m | 멀어짐 거리 |
| 최종 근처만 | ~30m | 최종 노드 근처에서만 반대방향을 지나침으로 해석 |

저정확도(`accuracyM > LOW_ACCURACY_M`)일 때는 wrong-direction 오탐을 억제한다.

### 7) 도착 판정

- UI 남은거리 = **다음 목표 노드까지** BE remain
- **긴 마지막 구간(>20m):** remain ≤ **20m** → S5_1 후보
- **짧은 마지막 구간(≤20m, 예 n11→n12≈19m):** 구간 진입만으로 조기 도착하지 않도록, **최종 노드 근접·통과 후** 도착
- 투영 remain만으로 km 밖 도착이 나지 않도록 **최종 노드 실거리 가드** (`ARRIVAL_PHYSICAL_MAX_M`)
- S5_1 문구·음성은 BE `states.ARRIVED` 사용

| 상수 | 값 | 의미 |
|------|-----|------|
| `ARRIVAL_RADIUS_M` | 20m | 긴 마지막 구간 remain 도착 기준 |
| `ARRIVAL_PHYSICAL_MAX_M` | 40m | 최종 노드 실거리 상한 |
| `ROUTE_FINAL_NODE_SNAP_M` | 8m | 최종 노드 평면 근접 시 s 스냅 (remain≤20일 때만) |
| `ROUTE_NODE_SNAP_M` | 3m | 중간 노드 cum 스냅 |
| `ARRIVAL_APPROACH_M` | 40m | 목적지 근처 — move deadband 완화 |

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

`geo.js` 도착·진행·스냅·출발 잠금·`getGuidanceBearing` / `headingBearing`,  
`useDeviceOrientation` 나침반 accuracy 게이트,  
`normalize`의 `headingBearing` 보존 등을 검증한다.

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

### 시뮬 스크립트 (BE 실데이터 + geo 로직)

```bash
node scripts/sim-ticket56-scenarios.mjs
```

### Chrome Sensors 수동 테스트

1. `/?ticketId=19` → S5  
2. DevTools → Sensors → Custom location  
3. S5 화면 탭(TTS 잠금 해제) 후 노드 좌표 순회  
4. 콘솔에서 `[NAV] arrow bearing=…` / `[TTS]` / 이탈·재탐색 로그 확인

### 빌드·배포

```bash
npm run build
npm run preview
```

Vercel 연결. API가 다른 도메인이면 `VITE_API_PROXY_TARGET` 또는 `/api` 프록시 설정.  
배포 URL을 바꾸면 `VITE_APP_ORIGIN`과 BE SMS 템플릿도 함께 갱신한다.

---

## 주요 판정 수치 요약 (`geo.js`)

| 상수 | 값 | 의미 |
|------|-----|------|
| `ARRIVAL_RADIUS_M` | 20m | 긴 마지막 구간 remain 도착 기준 |
| `ARRIVAL_PHYSICAL_MAX_M` | 40m | 최종 노드 실거리 가드 |
| `ROUTE_FINAL_NODE_SNAP_M` | 8m | 최종 노드 스냅 (remain≤20일 때만) |
| `ROUTE_NODE_SNAP_M` | 3m | 중간 노드 cum 스냅 |
| `EARLY_NODE_SNAP_M` | 2m | 초반 스냅 상한 |
| `OVERSHOOT_THRESHOLD_M` | 15m | 지나침 |
| `OFF_ROUTE_THRESHOLD_M` | 20m | 경로 이탈 |
| `START_ENGAGE_RADIUS_M` | 30m | 출발 잠금 반경 |
| `LOCALIZE_MAX_ROUTE_DIST_M` | 35m | 첫 fix localization |
| `EARLY_PROGRESS_JUMP_M` | 6m | 초반 점프 상한 |
| `LOW_ACCURACY_M` | 25m | 화살표·지나침 저정확도 |
| `GPS_SOFT_ACCURACY_M` / `GPS_MAX_ACCURACY_M` | 25 / 50m | GPS soft/hard 컷 |
| `COMPASS_MAX_ACCURACY_DEG` | 25° | 나침반 자기장 왜곡 컷 |
| `ARROW_HALF_LIFE_MS` | 90ms | 화살표 추종 반감기 |
| `DEST_LOOKAHEAD_M` | 4m | 목표 근접 시 aim 선행 |

---

## 프로젝트 구조 (핵심)

```
src/
├─ api/
│  ├─ bootstrapGuide.js    # ?ticketId= 부트스트랩 + 출발 TTS fallback
│  ├─ normalize.js         # guide/path 정규화 (headingBearing 보존)
│  ├─ reroute.js           # 이탈 후 재탐색 (guide → paths → v1 routes)
│  ├─ tickets.js / guide.js / sms.js / ticketUrl.js
├─ hooks/
│  ├─ useNavigationTracking.js  # GPS·진행·이탈·재탐색·화살표
│  ├─ useGeolocation.js
│  ├─ useDeviceOrientation.js   # 나침반 + accuracy 게이트
│  ├─ useFollowAngle.js         # 화살표 시간 기반 추종
│  └─ useStationary.js
├─ utils/
│  ├─ geo.js / geo.test.js      # 거리·투영·방위·판정 상수
│  ├─ guideStates.js / session.js / audio.js / haptics.js
├─ store/useFlowStore.js        # 화면·경로·accuracyM·bearing
├─ constants/station.js         # STATION_START (n02 fallback)
├─ components/
│  ├─ S5_Navigation.jsx / S5_1_Arrived.jsx / S5_2_AltRoute.jsx
│  ├─ S1~S4, E1~E6, SMS_Entry.jsx
e2e/                            # Playwright GPS 시나리오
scripts/                        # e2e-browser, sim-ticket56-*.mjs
docs/gps-mock-test-user1.md
```

---

## sessionStorage

재접속 시 "재개"로 인해 예전 경로(`routeSteps`)가 GPS와 맞물려 곧장 도착 상태로  
튀는 문제가 있어, 세션 저장·복원(`saveSession` / `loadSession`)은 **전면 비활성화**되어 있다.  
재접속·새로고침 시 항상 S1부터 새로 시작한다.

---

## 실내 안내 시 알아둘 점

1. **화살표 ≠ “내 GPS 좌표 점”** — 안내 방위(복도/조준) − 폰 heading. 저정확도에서는 복도(`headingBearing`) 우선.
2. **문구 속 m와 큰 숫자 m는 다를 수 있음** — 전자는 BE 고정 `screenText`, 후자는 라이브 remain.
3. **BE 거리 필드와 lat/lng가 어긋나면** 걸은 만큼 숫자가 안 맞을 수 있음 (프론트만으로 완전 보정 불가).
4. **HTTPS + Safari** 권장. 인앱 브라우저는 위치/나침반이 막히는 경우가 많다.
5. 콘솔 `[NAV] arrow bearing=segment`가 자주 보이면, 실내 저정확도에서 **의도대로 복도 방위를 쓰는 중**이다.
