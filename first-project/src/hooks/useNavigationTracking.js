import { useCallback, useEffect, useRef } from 'react';
import useFlowStore from '../store/useFlowStore';
import {
  ARRIVAL_RADIUS_M,
  getArrowRotation,
  getDistanceMeters,
  getDistanceToRouteMeters,
  getGuidanceBearing,
  getProgressAlongRouteM,
  getRemainingToTargetM,
  LOW_ACCURACY_M,
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
import { fetchReroute } from '../api/reroute';
import { applyGuideSteps } from '../api/bootstrapGuide';

/** panTo 쓰로틀 (ms) */
const PAN_THROTTLE_MS = 2000;
/** 이 속도(m/s) 이상이면 GPS course를 heading으로 우선 */
const GPS_COURSE_MIN_SPEED_MPS = 0.6;
/** 최종 노드 근처에서만 반대방향을 '지나침'으로 해석 */
const WRONG_DIR_OVERSHOOT_NEAR_M = 30;
/** 이탈 재탐색 최소 간격 (ms) — 연속 호출 방지 */
const REROUTE_COOLDOWN_MS = 8000;

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
  /** 경로 이탈 재탐색 중/쿨다운 */
  const reroutingRef = useRef(false);
  const lastRerouteAtRef = useRef(0);
  /** 화살표 방위 소스(segment/precise/blend) — 전환 시에만 로그 */
  const lastBearingModeRef = useRef('');
  const ARRIVAL_CONFIRM_HITS = 2;
  const WRONG_DIR_CONFIRM_HITS = 2;

  const { startWatch, stopWatch, error: geoWatchError } = useGeolocation();
  const { startListening, stopListening } = useDeviceOrientation();

  const mapInstance = useFlowStore((s) => s.mapInstance);
  const setNavigation = useFlowStore((s) => s.setNavigation);
  const setGeoError = useFlowStore((s) => s.setGeoError);
  const setStep = useFlowStore((s) => s.setStep);
  const setRoute = useFlowStore((s) => s.setRoute);
  const setReservation = useFlowStore((s) => s.setReservation);
  const setRouteLoading = useFlowStore((s) => s.setRouteLoading);
  const syncFromProgress = useFlowStore((s) => s.syncFromProgress);

  const stopTrackingRef = useRef(() => {});
  const onArrivedRef = useRef(onArrived);
  onArrivedRef.current = onArrived;

  const resetNavAfterReroute = useCallback(() => {
    startEngagedRef.current = false;
    progressMRef.current = 0;
    lastPassRef.current = -1;
    lastNavSigRef.current = '';
    offRouteHitsRef.current = 0;
    onRouteHitsRef.current = 0;
    wrongDirHitsRef.current = 0;
    arrivalHitsRef.current = 0;
    minDistanceRef.current = Infinity;
    lastNodeOvershootRef.current = false;
    prevRawDistanceRef.current = null;
  }, []);

  const requestReroute = useCallback(
    async (pos) => {
      if (reroutingRef.current) return;
      const now = performance.now();
      if (now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS) {
        console.log('[NAV] reroute skipped (cooldown)');
        return;
      }
      reroutingRef.current = true;
      lastRerouteAtRef.current = now;
      setRouteLoading(true);
      setNavigation({ altRoute: true, routeLoading: true });

      try {
        const state = useFlowStore.getState();
        const ticketId = Number(state.ticketInfo?.ticketId) || null;
        const result = await fetchReroute({
          pos,
          routeSteps: state.routeSteps,
          toNode: state.toNode,
          ticketId,
          reservationId: state.reservationId,
        });

        console.log(
          `[NAV] reroute ← ${result.fromNodeId}` +
            ` (nearest ${result.nearest.distM.toFixed(1)}m) kind=${result.kind}`,
        );

        if (result.kind === 'at_destination') {
          setNavigation({ altRoute: false, routeLoading: false });
          state.clearGuideStateAnnounce?.();
          return;
        }

        if (!result.route?.steps?.length) {
          throw new Error('재탐색 경로가 비어 있습니다.');
        }

        const ticket = result.guide?.ticket ?? state.ticketInfo;
        const reservationId =
          result.guide?.reservationId ?? state.reservationId;
        setReservation(
          reservationId,
          ticket,
          result.fromNodeId,
          result.toNode ?? state.toNode,
        );
        setRoute(result.route);
        if (result.stepsRes) {
          applyGuideSteps(result.stepsRes);
        }

        resetNavAfterReroute();
        // setRoute가 headingReady를 끄므로 나침반은 유지
        setNavigation({
          altRoute: false,
          routeLoading: false,
          overshoot: false,
          headingReady: headingReadyRef.current,
          heading: useFlowStore.getState().heading,
        });
        useFlowStore.getState().clearGuideStateAnnounce?.();
        console.log(
          '[NAV] reroute applied',
          result.route.steps.map((s) => s.nodeId).join('→'),
        );
      } catch (err) {
        console.error('[NAV] reroute failed', err);
        // 실패 시 빨간 이탈 화면 유지
        setNavigation({ altRoute: true, routeLoading: false });
      } finally {
        reroutingRef.current = false;
        setRouteLoading(false);
      }
    },
    [
      resetNavAfterReroute,
      setNavigation,
      setReservation,
      setRoute,
      setRouteLoading,
    ],
  );

  const requestRerouteRef = useRef(requestReroute);
  requestRerouteRef.current = requestReroute;

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
      // 나침반이 있으면 그걸 우선. GPS course는 실내에서 자주 틀어져 iOS 화살표를 망가뜨림.
      const useGpsCourse =
        !compassHeardRef.current &&
        gpsHeading != null &&
        !Number.isNaN(Number(gpsHeading)) &&
        gpsSpeed != null &&
        Number(gpsSpeed) >= GPS_COURSE_MIN_SPEED_MPS;

      let heading = null;
      let headingReady = storeHeadingReady || headingReadyRef.current;
      if (compassHeardRef.current && compassHeading != null && !Number.isNaN(Number(compassHeading))) {
        heading = Number(compassHeading);
        headingReady = true;
        headingReadyRef.current = true;
      } else if (useGpsCourse) {
        heading = normalizeAngle(Number(gpsHeading));
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

      const accuracyM =
        pos.accuracy != null && Number.isFinite(Number(pos.accuracy))
          ? Number(pos.accuracy)
          : null;
      const prevBearing = useFlowStore.getState().bearing;
      const guided = getGuidanceBearing({
        pos,
        steps,
        targetIndex,
        accuracyM,
        prevBearing,
        lockedAtStart,
      });
      const bearing = guided.bearing;
      if (guided.mode !== lastBearingModeRef.current) {
        lastBearingModeRef.current = guided.mode;
        console.log(
          `[NAV] arrow bearing=${guided.mode}` +
            ` acc=${accuracyM != null ? Math.round(accuracyM) : 'n/a'}m` +
            ` seg=${guided.segmentBearing != null ? Math.round(guided.segmentBearing) : 'n/a'}°` +
            ` gps=${guided.preciseBearing != null ? Math.round(guided.preciseBearing) : 'n/a'}°`,
        );
      }
      // heading 미확보 시 destinationAngle을 0으로 덮지 않음 (GPS 틱이 화살표를 북쪽으로 리셋하던 버그)
      const destinationAngle =
        headingReady && heading != null && bearing != null
          ? getArrowRotation(bearing, heading)
          : null;

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
        destinationAngle != null &&
        Math.abs(destinationAngle) >= WRONG_DIRECTION_ANGLE_DEG;
      const prevRaw = prevRawDistanceRef.current;
      const movingAway =
        prevRaw != null && rawDistanceM >= prevRaw + WRONG_DIRECTION_AWAY_M;
      const movingCloser =
        prevRaw != null && rawDistanceM <= prevRaw - WRONG_DIRECTION_AWAY_M;
      prevRawDistanceRef.current = rawDistanceM;

      // 저정확도(실내)에서는 GPS/방위 흔들림으로 반대방향 오탐하지 않음
      const accuracyLow =
        guided.accuracyLow || (accuracyM != null && accuracyM > LOW_ACCURACY_M);
      if (accuracyLow) {
        wrongDirHitsRef.current = Math.max(0, wrongDirHitsRef.current - 1);
      } else if (facingOpposite || movingAway) {
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

      const angleShown =
        destinationAngle == null ? useFlowStore.getState().destinationAngle ?? 0 : Math.round(destinationAngle);
      const navSig = `${distShown}|${angleShown}|${isOvershoot}|${nextAltRoute}|${targetIndex}|${headingReady}`;
      if (navSig !== lastNavSigRef.current) {
        lastNavSigRef.current = navSig;
        const navPatch = {
          position: pos,
          distanceM: distShown,
          progressM,
          bearing,
          headingReady,
          overshoot: isOvershoot,
          altRoute: nextAltRoute,
          accuracyM,
        };
        if (heading != null) navPatch.heading = heading;
        if (destinationAngle != null) navPatch.destinationAngle = angleShown;
        setNavigation(navPatch);
      }

      const { playGuideState, clearGuideStateAnnounce } = useFlowStore.getState();
      if (nextAltRoute && !prevAltRoute) {
        playGuideState(GUIDE_STATE.OFF_ROUTE);
        // 이탈 확정 → 현재 위치 기준 경로 재탐색
        requestRerouteRef.current(pos);
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
        overshoot,
        routeSteps,
        currentStepIndex,
        distanceM,
        bearing: prevBearing,
        accuracyM: storeAccuracyM,
      } = useFlowStore.getState();

      setNavigation({ heading, headingReady: true });

      const locked = !startEngagedRef.current;
      if (!position?.lat || !position?.lng || !routeSteps?.length) return;

      const targetIndex = locked
        ? Math.min(1, Math.max(0, routeSteps.length - 1))
        : Math.max(0, Math.min(currentStepIndex, routeSteps.length - 1));
      const accuracyM =
        storeAccuracyM != null && Number.isFinite(Number(storeAccuracyM))
          ? Number(storeAccuracyM)
          : position.accuracy != null && Number.isFinite(Number(position.accuracy))
            ? Number(position.accuracy)
            : null;

      const guided = getGuidanceBearing({
        pos: position,
        steps: routeSteps,
        targetIndex,
        accuracyM,
        prevBearing,
        lockedAtStart: locked,
      });
      if (guided.bearing == null) return;

      const bearing = guided.bearing;
      const destinationAngle = getArrowRotation(bearing, heading);

      const accuracyLow =
        guided.accuracyLow || (accuracyM != null && accuracyM > LOW_ACCURACY_M);
      if (accuracyLow) {
        wrongDirHitsRef.current = Math.max(0, wrongDirHitsRef.current - 1);
      } else if (Math.abs(destinationAngle) >= WRONG_DIRECTION_ANGLE_DEG) {
        wrongDirHitsRef.current += 1;
      } else {
        wrongDirHitsRef.current = Math.max(0, wrongDirHitsRef.current - 1);
      }

      const isWrongDirection = wrongDirHitsRef.current >= WRONG_DIR_CONFIRM_HITS;
      const lastIdx = (routeSteps?.length ?? 0) - 1;
      const onFinalStep = !locked && lastIdx >= 0 && currentStepIndex >= lastIdx;
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
          accuracyM,
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
    reroutingRef.current = false;
    lastRerouteAtRef.current = 0;
    lastBearingModeRef.current = '';
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
      accuracyM: null,
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
