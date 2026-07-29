import { useCallback, useEffect, useRef } from 'react';
import useFlowStore from '../store/useFlowStore';
import {
  ARRIVAL_RADIUS_M,
  getArrowAimPoint,
  getArrowRotation,
  getBearing,
  getDistanceMeters,
  getDistanceToRouteMeters,
  getProgressAlongRouteM,
  getRemainingToTargetM,
  normalizeAngle,
  OFF_ROUTE_CLEAR_COUNT,
  OFF_ROUTE_HIT_COUNT,
  OFF_ROUTE_THRESHOLD_M,
  OVERSHOOT_THRESHOLD_M,
  resolveStepIndexFromProgress,
  shouldArriveByRemain,
  stepAngleTowards,
  WRONG_DIRECTION_ANGLE_DEG,
  WRONG_DIRECTION_AWAY_M,
} from '../utils/geo';
import useDeviceOrientation from './useDeviceOrientation';
import useGeolocation from './useGeolocation';
import { GUIDE_STATE } from '../utils/guideStates';

/** panTo 쓰로틀 (ms) — 매 GPS pan은 지도/메인스레드 부하 */
const PAN_THROTTLE_MS = 2000;
/** 이 속도(m/s) 이상이면 GPS course를 화살표 heading으로 우선 */
const GPS_COURSE_MIN_SPEED_MPS = 0.6;
/** 최종 노드 근처에서만 반대방향을 '지나침'으로 해석 */
const WRONG_DIR_OVERSHOOT_NEAR_M = 30;

function useNavigationTracking({ enabled = true, onArrived } = {}) {
  const hasArrivedRef = useRef(false);
  const minDistanceRef = useRef(Infinity);
  const offRouteHitsRef = useRef(0);
  const onRouteHitsRef = useRef(0);
  const arrivalHitsRef = useRef(0);
  const wrongDirHitsRef = useRef(0);
  const prevRawDistanceRef = useRef(null);
  const lastNodeOvershootRef = useRef(false);
  const lastPosRef = useRef(null);
  const lastPanAtRef = useRef(0);
  const lastNavSigRef = useRef('');
  const lastPassRef = useRef(-1);
  /** 실제 나침반 이벤트를 받기 전엔 heading=0 고정 → 반대방향 오판 방지 */
  const headingReadyRef = useRef(false);
  /** 화살표 표시각 — 실시간 반감기 감쇠 + 초당 회전각 상한 적용 (원시 방위각과 별개) */
  const smoothedAngleRef = useRef(0);
  const lastAngleTsRef = useRef(null);
  /** Sensors 폴링(250ms) 기준 — 1회면 GPS 한 틱에 조기 도착할 수 있어 2회 */
  const ARRIVAL_CONFIRM_HITS = 2;
  const WRONG_DIR_CONFIRM_HITS = 2;

  const { startWatch, stopWatch, error: geoWatchError } = useGeolocation();
  const { startListening, stopListening } = useDeviceOrientation();

  const mapInstance = useFlowStore((s) => s.mapInstance);
  const setNavigation = useFlowStore((s) => s.setNavigation);
  const setGeoError = useFlowStore((s) => s.setGeoError);
  const setStep = useFlowStore((s) => s.setStep);
  const syncFromProgress = useFlowStore((s) => s.syncFromProgress);

  const stopTrackingRef = useRef(() => {});
  const onArrivedRef = useRef(onArrived);
  onArrivedRef.current = onArrived;

  const handlePositionUpdate = useCallback(
    (pos, geoPos) => {
      if (hasArrivedRef.current) return;

      const {
        routeSteps: steps,
        altRoute: prevAltRoute,
        overshoot: prevOvershoot,
        heading: compassHeading,
        announcedPassIndex,
      } = useFlowStore.getState();

      if (!steps?.length) return;

      // 이동 중 GPS course가 있으면 나침반보다 우선 (역내 자기장으로 화살표 180° 뒤집힘 완화)
      const gpsHeading = geoPos?.coords?.heading;
      const gpsSpeed = geoPos?.coords?.speed;
      const useGpsCourse =
        gpsHeading != null &&
        !Number.isNaN(Number(gpsHeading)) &&
        gpsSpeed != null &&
        Number(gpsSpeed) >= GPS_COURSE_MIN_SPEED_MPS;
      const heading = useGpsCourse
        ? normalizeAngle(Number(gpsHeading))
        : compassHeading;
      if (useGpsCourse) {
        headingReadyRef.current = true;
      }

      // raw GPS 기준 — 거리·통과·음성 모두 즉시 (EMA/maxStep 없음)
      const progressM = getProgressAlongRouteM(pos, steps);
      const posJump =
        lastPosRef.current == null
          ? Infinity
          : getDistanceMeters(
              lastPosRef.current.lat,
              lastPosRef.current.lng,
              pos.lat,
              pos.lng,
            );
      lastPosRef.current = { lat: pos.lat, lng: pos.lng };

      const { passedIndex, targetIndex, guideIndex } = resolveStepIndexFromProgress(
        progressM,
        steps,
      );
      // UI 큰 숫자 = 항상 BE 다음 목표까지 (안내 문구와 동일). 마지막 구간도 평면으로 바꾸지 않음.
      const distanceM = getRemainingToTargetM(progressM, targetIndex, steps);

      // 통과선/목표 변경 시 즉시 TTS·문구 sync
      const prevTarget = useFlowStore.getState().currentStepIndex;
      const stepChanged =
        passedIndex !== announcedPassIndex ||
        passedIndex !== lastPassRef.current ||
        targetIndex !== prevTarget;
      if (stepChanged) {
        console.log(
          `[NAV] s=${progressM.toFixed(1)}m remain=${Math.round(distanceM)}m` +
            ` | pass=${steps[passedIndex]?.nodeId}(#${passedIndex})` +
            ` → target=${steps[targetIndex]?.nodeId}(#${targetIndex})`,
        );
        syncFromProgress(
          { progressM, passedIndex, targetIndex, guideIndex },
          { playAudio: true },
        );
        // sync 성공 여부와 무관하게 통과 인덱스는 반영 (audio 미준비여도 문구는 갱신돼야 함)
        lastPassRef.current = passedIndex;
      }

      const lastIdx = steps.length - 1;
      const lastStep = steps[lastIdx];
      const distToLastNode =
        lastStep?.lat != null && lastStep?.lng != null
          ? getDistanceMeters(pos.lat, pos.lng, lastStep.lat, lastStep.lng)
          : Infinity;

      // 도착 = 마지막 구간 remain 기준 (짧은 마지막 구간은 조기 도착 방지)
      const onFinalStep = targetIndex >= lastIdx || passedIndex >= lastIdx;
      const lastCum = Number(lastStep?.cumulativeDistanceM) || 0;
      const prevCum =
        lastIdx > 0 ? Number(steps[lastIdx - 1]?.cumulativeDistanceM) || 0 : 0;
      const lastSegLenM = Math.max(0, lastCum - prevCum);
      const remainArrived = shouldArriveByRemain({
        onFinalStep,
        distanceM,
        distToLastNode,
        passedIndex,
        lastIdx,
        lastSegLenM,
      });
      const distShown = Math.round(distanceM);

      const finishArrival = (reason) => {
        console.log(
          `[NAV] 도착 → S5_1 | remain=${distShown}m` +
            ` distLast=${Number.isFinite(distToLastNode) ? distToLastNode.toFixed(1) : 'n/a'}m` +
            ` (${reason})`,
        );
        hasArrivedRef.current = true;
        stopTrackingRef.current();
        onArrivedRef.current?.();
        setStep('S5_1');
      };

      // 0m는 S5에 그리지 않고 바로 도착 화면
      if (onFinalStep && distShown <= 0) {
        finishArrival('remain≈0');
        return;
      }

      const dest = steps[targetIndex];
      if (!dest?.lat || !dest?.lng) {
        if (remainArrived) {
          arrivalHitsRef.current += 1;
          if (arrivalHitsRef.current >= ARRIVAL_CONFIRM_HITS) {
            finishArrival('remain≤20 no-dest');
          }
        } else {
          arrivalHitsRef.current = 0;
        }
        return;
      }

      const isLastStep = onFinalStep || distToLastNode <= ARRIVAL_RADIUS_M;
      const rawDistanceM = isLastStep
        ? distToLastNode
        : getDistanceMeters(pos.lat, pos.lng, dest.lat, dest.lng);

      // 화살표는 목표 노드에 근접하면 다음 노드 쪽으로 미리 방향을 틀어,
      // 노드를 스치는 순간 방위각이 급변하는 걸 완화한다 (거리·도착 판정은 dest 그대로 사용)
      const aimPoint = isLastStep ? dest : (getArrowAimPoint(pos, steps, targetIndex) ?? dest);
      const bearing = getBearing(pos.lat, pos.lng, aimPoint.lat, aimPoint.lng);
      const rawDestinationAngle = getArrowRotation(bearing, heading);

      // 화면에 표시할 각도는 실제 경과 시간(dt) 기준 반감기 감쇠 + 초당 회전각 상한을 적용
      // (자기장 왜곡 등으로 원시 목표각이 순간적으로 크게 튀어도 회전 속도는 일정하게 유지)
      const angleTs = geoPos?.timestamp ?? Date.now();
      const destinationAngle =
        lastAngleTsRef.current == null
          ? rawDestinationAngle
          : stepAngleTowards(
              smoothedAngleRef.current,
              rawDestinationAngle,
              angleTs - lastAngleTsRef.current,
            );
      smoothedAngleRef.current = destinationAngle;
      lastAngleTsRef.current = angleTs;

      if (isLastStep && rawDistanceM < minDistanceRef.current) {
        minDistanceRef.current = rawDistanceM;
      }
      const lastNodeOvershoot =
        isLastStep &&
        !hasArrivedRef.current &&
        minDistanceRef.current < OVERSHOOT_THRESHOLD_M &&
        rawDistanceM > minDistanceRef.current + OVERSHOOT_THRESHOLD_M;
      lastNodeOvershootRef.current = lastNodeOvershoot;

      // 반대방향 판정은 화면 표시각이 아니라 원시 방위각 기준 (지연 없이 즉시 반응해야 함)
      const facingOpposite =
        headingReadyRef.current &&
        Math.abs(rawDestinationAngle) >= WRONG_DIRECTION_ANGLE_DEG;
      const prevRaw = prevRawDistanceRef.current;
      const movingAway =
        prevRaw != null && rawDistanceM >= prevRaw + WRONG_DIRECTION_AWAY_M;
      const movingCloser =
        prevRaw != null && rawDistanceM <= prevRaw - WRONG_DIRECTION_AWAY_M;
      prevRawDistanceRef.current = rawDistanceM;

      if (facingOpposite || movingAway) {
        wrongDirHitsRef.current += 1;
      } else if (!facingOpposite && movingCloser) {
        wrongDirHitsRef.current = 0;
      } else if (!facingOpposite) {
        wrongDirHitsRef.current = Math.max(0, wrongDirHitsRef.current - 1);
      }

      const isWrongDirection = wrongDirHitsRef.current >= WRONG_DIR_CONFIRM_HITS;
      const canTreatWrongDirAsOvershoot =
        isLastStep &&
        (distToLastNode <= WRONG_DIR_OVERSHOOT_NEAR_M ||
          minDistanceRef.current <= WRONG_DIR_OVERSHOOT_NEAR_M);
      const isOvershoot = lastNodeOvershoot || (isWrongDirection && canTreatWrongDirAsOvershoot);

      let nextAltRoute = prevAltRoute;
      if (!isOvershoot && !(isLastStep && rawDistanceM <= OVERSHOOT_THRESHOLD_M)) {
        const routeDistM = getDistanceToRouteMeters(pos, steps);
        if (routeDistM > OFF_ROUTE_THRESHOLD_M) {
          offRouteHitsRef.current += 1;
          onRouteHitsRef.current = 0;
          if (offRouteHitsRef.current >= OFF_ROUTE_HIT_COUNT) {
            nextAltRoute = true;
          }
        } else {
          onRouteHitsRef.current += 1;
          offRouteHitsRef.current = 0;
          if (onRouteHitsRef.current >= OFF_ROUTE_CLEAR_COUNT) {
            nextAltRoute = false;
          }
        }
      } else {
        offRouteHitsRef.current = 0;
        onRouteHitsRef.current = 0;
        nextAltRoute = false;
      }

      // 의미 있는 변화만 store 갱신 → S5 리렌더 폭주 방지
      // 0m는 위에서 이미 S5_1로 보냄 — 여기선 1m 이상만 표시
      const angleShown = Math.round(destinationAngle);
      const navSig = `${distShown}|${angleShown}|${isOvershoot}|${nextAltRoute}|${targetIndex}`;
      if (navSig !== lastNavSigRef.current) {
        lastNavSigRef.current = navSig;
        setNavigation({
          position: pos,
          distanceM: distShown,
          progressM,
          bearing,
          heading,
          destinationAngle: angleShown,
          overshoot: isOvershoot,
          altRoute: nextAltRoute,
        });
      }

      // 예외 상태 TTS — BE guide/steps.states 카탈로그 (진입 시 1회)
      const { playGuideState, clearGuideStateAnnounce } = useFlowStore.getState();
      if (nextAltRoute && !prevAltRoute) {
        playGuideState(GUIDE_STATE.OFF_ROUTE);
      } else if (isOvershoot && !prevOvershoot) {
        playGuideState(GUIDE_STATE.DESTINATION_PASSED);
      } else if (!nextAltRoute && !isOvershoot && (prevAltRoute || prevOvershoot)) {
        clearGuideStateAnnounce();
      }

      mapInstance?.setMarkerPosition?.(pos.lat, pos.lng);
      mapInstance?.setMarkerRotation?.(heading);

      const now = Date.now();
      if (posJump >= 12 || now - lastPanAtRef.current >= PAN_THROTTLE_MS) {
        lastPanAtRef.current = now;
        mapInstance?.panTo?.({ lat: pos.lat, lng: pos.lng });
      }

      // remain 도착 조건 충족 시 확인 후 S5_1 (짧은 마지막 구간 조기 도착 방지 포함)
      if (remainArrived) {
        arrivalHitsRef.current += 1;
        if (arrivalHitsRef.current >= ARRIVAL_CONFIRM_HITS) {
          finishArrival(
            lastSegLenM > ARRIVAL_RADIUS_M ? 'remain≤20' : 'short-final+near',
          );
        }
      } else {
        arrivalHitsRef.current = 0;
      }
    },
    [mapInstance, setNavigation, setStep, syncFromProgress]
  );

  const handlePositionUpdateRef = useRef(handlePositionUpdate);
  handlePositionUpdateRef.current = handlePositionUpdate;

  const handleHeadingUpdate = useCallback(
    (heading) => {
      headingReadyRef.current = true;
      const {
        position,
        bearing: storedBearing,
        destination: dest,
        overshoot,
        routeSteps,
        currentStepIndex,
        distanceM,
      } =
        useFlowStore.getState();
      if (!dest?.lat || !dest?.lng) return;

      const bearing =
        storedBearing ??
        (position ? getBearing(position.lat, position.lng, dest.lat, dest.lng) : null);
      const rawDestinationAngle = bearing != null ? getArrowRotation(bearing, heading) : 0;

      if (bearing != null) {
        if (Math.abs(rawDestinationAngle) >= WRONG_DIRECTION_ANGLE_DEG) {
          wrongDirHitsRef.current += 1;
        } else {
          wrongDirHitsRef.current = Math.max(0, wrongDirHitsRef.current - 1);
        }
      }

      const angleTs = Date.now();
      const destinationAngle =
        lastAngleTsRef.current == null
          ? rawDestinationAngle
          : stepAngleTowards(
              smoothedAngleRef.current,
              rawDestinationAngle,
              angleTs - lastAngleTsRef.current,
            );
      smoothedAngleRef.current = destinationAngle;
      lastAngleTsRef.current = angleTs;

      const isWrongDirection = wrongDirHitsRef.current >= WRONG_DIR_CONFIRM_HITS;
      const lastIdx = (routeSteps?.length ?? 0) - 1;
      const onFinalStep = lastIdx >= 0 && currentStepIndex >= lastIdx;
      const nearLastByUiRemain = distanceM != null && Number(distanceM) <= WRONG_DIR_OVERSHOOT_NEAR_M;
      const canTreatWrongDirAsOvershoot =
        onFinalStep &&
        (nearLastByUiRemain || minDistanceRef.current <= WRONG_DIR_OVERSHOOT_NEAR_M);
      const isOvershoot =
        lastNodeOvershootRef.current || (isWrongDirection && canTreatWrongDirAsOvershoot);
      const angleShown = Math.round(destinationAngle);

      // 각도 2° 이상 변하거나 overshoot 바뀔 때만 갱신
      const prevAngle = useFlowStore.getState().destinationAngle ?? 0;
      if (
        Math.abs(prevAngle - angleShown) >= 2 ||
        overshoot !== isOvershoot
      ) {
        setNavigation({
          heading,
          bearing,
          destinationAngle: angleShown,
          overshoot: isOvershoot,
        });
      }
      mapInstance?.setMarkerRotation?.(heading);
    },
    [mapInstance, setNavigation]
  );

  const handleHeadingUpdateRef = useRef(handleHeadingUpdate);
  handleHeadingUpdateRef.current = handleHeadingUpdate;

  const startTracking = useCallback(() => {
    hasArrivedRef.current = false;
    minDistanceRef.current = Infinity;
    offRouteHitsRef.current = 0;
    onRouteHitsRef.current = 0;
    arrivalHitsRef.current = 0;
    wrongDirHitsRef.current = 0;
    prevRawDistanceRef.current = null;
    lastNodeOvershootRef.current = false;
    lastPosRef.current = null;
    lastPanAtRef.current = 0;
    lastNavSigRef.current = '';
    lastPassRef.current = -1;
    headingReadyRef.current = false;
    smoothedAngleRef.current = 0;
    lastAngleTsRef.current = null;
    const steps = useFlowStore.getState().routeSteps || [];
    const firstTarget = steps.length > 1 ? 1 : 0;
    const initialRemain = getRemainingToTargetM(0, firstTarget, steps);
    const first = steps[0];
    const { screenTextMap } = useFlowStore.getState();
    const startInstruction =
      (first?.nodeId && screenTextMap[first.nodeId]) || first?.instruction || '';
    setNavigation({
      position: null,
      distanceM: initialRemain > 0 ? Math.round(initialRemain) : null,
      progressM: 0,
      announcedPassIndex: 0,
      currentStepIndex: firstTarget,
      currentInstruction: startInstruction,
      destination: steps[firstTarget]
        ? {
            lat: steps[firstTarget].lat,
            lng: steps[firstTarget].lng,
            label: steps[firstTarget].name ?? '',
          }
        : null,
      bearing: null,
      destinationAngle: 0,
      heading: 0,
      isTracking: true,
      overshoot: false,
      altRoute: false,
    });
    startWatch((raw, geoPos) => handlePositionUpdateRef.current(raw, geoPos));
    startListening((heading) => handleHeadingUpdateRef.current(heading));
  }, [setNavigation, startListening, startWatch]);

  const stopTracking = useCallback(() => {
    stopWatch();
    stopListening();
    setNavigation({ isTracking: false });
  }, [setNavigation, stopListening, stopWatch]);

  stopTrackingRef.current = stopTracking;

  useEffect(() => {
    if (!enabled) return undefined;

    const { routeSteps: steps } = useFlowStore.getState();
    if (steps.length === 0) return undefined;

    startTracking();
    return () => stopTracking();
  }, [enabled, startTracking, stopTracking]);

  useEffect(() => {
    setGeoError(geoWatchError);
  }, [geoWatchError, setGeoError]);

  return { startTracking, stopTracking, geoError: geoWatchError };
}

export default useNavigationTracking;
