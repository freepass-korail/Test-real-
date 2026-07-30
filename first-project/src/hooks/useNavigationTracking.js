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
  gateProgressFromStart,
  EARLY_NODE_COUNT,
  OVERSHOOT_THRESHOLD_M,
  resolveStepIndexFromProgress,
  shouldArriveByRemain,
  shortestAngleDelta,
  WRONG_DIRECTION_ANGLE_DEG,
  WRONG_DIRECTION_AWAY_M,
} from '../utils/geo';
import useDeviceOrientation from './useDeviceOrientation';
import useGeolocation from './useGeolocation';
import { GUIDE_STATE } from '../utils/guideStates';

/** panTo 쓰로틀 (ms) */
const PAN_THROTTLE_MS = 2000;
/** 이 속도(m/s) 이상이면 GPS course를 heading으로 우선 */
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
  /** 첫 GPS fix로 경로 진입(localization) 완료 */
  const startEngagedRef = useRef(false);
  const progressMRef = useRef(0);
  /** 나침반(또는 GPS course) heading 확보 */
  const headingReadyRef = useRef(false);
  const compassHeardRef = useRef(false);
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
        headingReady: storeHeadingReady,
      } = useFlowStore.getState();

      if (!steps?.length) return;

      const gpsHeading = geoPos?.coords?.heading;
      const gpsSpeed = geoPos?.coords?.speed;
      const useGpsCourse =
        gpsHeading != null &&
        !Number.isNaN(Number(gpsHeading)) &&
        gpsSpeed != null &&
        Number(gpsSpeed) >= GPS_COURSE_MIN_SPEED_MPS;

      let heading = compassHeading;
      let headingReady = storeHeadingReady || headingReadyRef.current;
      if (useGpsCourse) {
        heading = normalizeAngle(Number(gpsHeading));
        headingReady = true;
        headingReadyRef.current = true;
      } else if (compassHeardRef.current && compassHeading != null) {
        heading = compassHeading;
        headingReady = true;
        headingReadyRef.current = true;
      }

      const earlyLastIdx = Math.min(
        Math.max(0, steps.length - 1),
        Math.max(0, EARLY_NODE_COUNT - 1),
      );
      const earlyEndCum = Math.max(
        0,
        Number(steps[earlyLastIdx]?.cumulativeDistanceM) || 0,
      );
      const pastEarly = progressMRef.current >= earlyEndCum && earlyEndCum > 0;
      const rawProgressM = getProgressAlongRouteM(pos, steps, {
        minSnapCumM: pastEarly ? earlyEndCum : 0,
      });
      const gated = gateProgressFromStart({
        pos,
        steps,
        rawProgressM,
        prevProgressM: progressMRef.current,
        startEngaged: startEngagedRef.current,
      });
      startEngagedRef.current = gated.startEngaged;
      const progressM = gated.progressM;
      progressMRef.current = progressM;
      const lockedAtStart = gated.lockedAtStart;

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
      // localization 전: distanceM null 유지 (opacity·"위치 확인 중" 장치)
      const distanceM = lockedAtStart
        ? null
        : getRemainingToTargetM(progressM, targetIndex, steps);

      const prevTarget = useFlowStore.getState().currentStepIndex;
      const stepChanged =
        !lockedAtStart &&
        (passedIndex !== announcedPassIndex ||
          passedIndex !== lastPassRef.current ||
          targetIndex !== prevTarget);
      if (lockedAtStart) {
        if (lastPassRef.current !== -2) {
          console.log(
            `[NAV] localize-wait distRoute=${gated.distToRouteM.toFixed(1)}m` +
              ` distStart=${gated.distToStartM.toFixed(1)}m`,
          );
          setNavigation({
            progressM: 0,
            distanceM: null,
            headingReady,
            announcedPassIndex: 0,
            currentStepIndex: 0,
            destinationAngle: headingReady ? useFlowStore.getState().destinationAngle : 0,
            overshoot: false,
            altRoute: false,
          });
          lastPassRef.current = -2;
        }
      } else if (stepChanged) {
        console.log(
          `[NAV] s=${progressM.toFixed(1)}m remain=${Math.round(distanceM)}m` +
            ` | pass=${steps[passedIndex]?.nodeId}(#${passedIndex})` +
            ` → target=${steps[targetIndex]?.nodeId}(#${targetIndex})`,
        );
        syncFromProgress(
          { progressM, passedIndex, targetIndex, guideIndex },
          { playAudio: true },
        );
        lastPassRef.current = passedIndex;
      }

      const lastIdx = steps.length - 1;
      const lastStep = steps[lastIdx];
      const distToLastNode =
        lastStep?.lat != null && lastStep?.lng != null
          ? getDistanceMeters(pos.lat, pos.lng, lastStep.lat, lastStep.lng)
          : Infinity;

      const onFinalStep =
        !lockedAtStart && (targetIndex >= lastIdx || passedIndex >= lastIdx);
      const lastCum = Number(lastStep?.cumulativeDistanceM) || 0;
      const prevCum =
        lastIdx > 0 ? Number(steps[lastIdx - 1]?.cumulativeDistanceM) || 0 : 0;
      const lastSegLenM = Math.max(0, lastCum - prevCum);
      const remainArrived =
        !lockedAtStart &&
        distanceM != null &&
        shouldArriveByRemain({
          onFinalStep,
          distanceM,
          distToLastNode,
          passedIndex,
          lastIdx,
          lastSegLenM,
        });
      const distShown = distanceM == null ? null : Math.round(distanceM);

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

      if (onFinalStep && distShown != null && distShown <= 0) {
        finishArrival('remain≈0');
        return;
      }

      const dest = lockedAtStart ? steps[0] : steps[targetIndex];
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

      const isLastStep =
        !lockedAtStart && (onFinalStep || distToLastNode <= ARRIVAL_RADIUS_M);
      const rawDistanceM = lockedAtStart
        ? gated.distToStartM
        : isLastStep
          ? distToLastNode
          : getDistanceMeters(pos.lat, pos.lng, dest.lat, dest.lng);

      const aimPoint = lockedAtStart || isLastStep
        ? dest
        : (getArrowAimPoint(pos, steps, targetIndex) ?? dest);
      const bearing = getBearing(pos.lat, pos.lng, aimPoint.lat, aimPoint.lng);
      // 단일 필터: raw 각도를 store에 넣고, 화면만 useFollowAngle로 추종
      const destinationAngle = headingReady
        ? getArrowRotation(bearing, heading ?? 0)
        : 0;

      if (isLastStep && rawDistanceM < minDistanceRef.current) {
        minDistanceRef.current = rawDistanceM;
      }
      const lastNodeOvershoot =
        isLastStep &&
        !hasArrivedRef.current &&
        minDistanceRef.current < OVERSHOOT_THRESHOLD_M &&
        rawDistanceM > minDistanceRef.current + OVERSHOOT_THRESHOLD_M;
      lastNodeOvershootRef.current = lastNodeOvershoot;

      const facingOpposite =
        headingReady &&
        Math.abs(destinationAngle) >= WRONG_DIRECTION_ANGLE_DEG;
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
      if (lockedAtStart) {
        offRouteHitsRef.current = 0;
        onRouteHitsRef.current = 0;
        nextAltRoute = false;
      } else if (!isOvershoot && !(isLastStep && rawDistanceM <= OVERSHOOT_THRESHOLD_M)) {
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

      const angleShown = Math.round(destinationAngle);
      const navSig = `${distShown}|${angleShown}|${isOvershoot}|${nextAltRoute}|${targetIndex}|${headingReady}`;
      if (navSig !== lastNavSigRef.current) {
        lastNavSigRef.current = navSig;
        setNavigation({
          position: pos,
          distanceM: distShown,
          progressM,
          bearing,
          heading: heading ?? 0,
          headingReady,
          destinationAngle: angleShown,
          overshoot: isOvershoot,
          altRoute: nextAltRoute,
        });
      }

      const { playGuideState, clearGuideStateAnnounce } = useFlowStore.getState();
      if (nextAltRoute && !prevAltRoute) {
        playGuideState(GUIDE_STATE.OFF_ROUTE);
      } else if (isOvershoot && !prevOvershoot) {
        playGuideState(GUIDE_STATE.DESTINATION_PASSED);
      } else if (!nextAltRoute && !isOvershoot && (prevAltRoute || prevOvershoot)) {
        clearGuideStateAnnounce();
      }

      mapInstance?.setMarkerPosition?.(pos.lat, pos.lng);
      if (headingReady && heading != null) {
        mapInstance?.setMarkerRotation?.(heading);
      }

      const now = performance.now();
      if (posJump >= 12 || now - lastPanAtRef.current >= PAN_THROTTLE_MS) {
        lastPanAtRef.current = now;
        mapInstance?.panTo?.({ lat: pos.lat, lng: pos.lng });
      }

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
      compassHeardRef.current = true;
      headingReadyRef.current = true;
      const {
        position,
        bearing: storedBearing,
        destination: dest,
        overshoot,
        routeSteps,
        currentStepIndex,
        distanceM,
      } = useFlowStore.getState();

      setNavigation({ heading, headingReady: true });

      if (!dest?.lat || !dest?.lng) return;

      const bearing =
        storedBearing ??
        (position ? getBearing(position.lat, position.lng, dest.lat, dest.lng) : null);
      const destinationAngle =
        bearing != null ? getArrowRotation(bearing, heading) : 0;

      if (bearing != null) {
        if (Math.abs(destinationAngle) >= WRONG_DIRECTION_ANGLE_DEG) {
          wrongDirHitsRef.current += 1;
        } else {
          wrongDirHitsRef.current = Math.max(0, wrongDirHitsRef.current - 1);
        }
      }

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

      const prevAngle = useFlowStore.getState().destinationAngle ?? 0;
      if (
        Math.abs(shortestAngleDelta(prevAngle, angleShown)) >= 1 ||
        overshoot !== isOvershoot
      ) {
        setNavigation({
          heading,
          headingReady: true,
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
    startEngagedRef.current = false;
    progressMRef.current = 0;
    headingReadyRef.current = false;
    compassHeardRef.current = false;
    const steps = useFlowStore.getState().routeSteps || [];
    const firstTarget = steps.length > 1 ? 1 : 0;
    const first = steps[0];
    const { screenTextMap } = useFlowStore.getState();
    const startInstruction =
      (first?.nodeId && screenTextMap[first.nodeId]) || first?.instruction || '';
    setNavigation({
      position: null,
      // GPS·heading 확보 전 null — opacity / "위치 확인 중" 복구
      distanceM: null,
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
      headingReady: false,
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
    setNavigation({ isTracking: false, headingReady: false });
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
