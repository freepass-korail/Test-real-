/**
 * @typedef {Object} TicketInfo
 * @property {string} trainName
 * @property {string} travelDate
 * @property {string} departureStation
 * @property {string} arrivalStation
 * @property {string} departureTime
 * @property {string} arrivalTime
 * @property {string} platform
 * @property {string} carNumber
 * @property {string} seatNumber
 * @property {string} seatClass
 * @property {string} ticketNumber
 */

/**
 * @typedef {Object} RouteStep
 * @property {number} order
 * @property {string} nodeId
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {number} [layer]
 * @property {string} instruction
 */

/**
 * @typedef {Object} GuideSession
 * @property {string} reservationId
 * @property {TicketInfo} ticket
 */

/**
 * @typedef {Object} GuideRoute
 * @property {string} routeId
 * @property {string} [startNodeId]
 * @property {string} [endNodeId]
 * @property {number} [totalDistanceM]
 * @property {RouteStep[]} steps
 */

/**
 * @param {Record<string, unknown>} raw
 * @returns {TicketInfo}
 */
export function normalizeTicket(raw = {}) {
  return {
    trainName: String(raw.trainName ?? raw.train_name ?? ''),
    travelDate: String(raw.travelDate ?? raw.travel_date ?? ''),
    departureStation: String(raw.departureStation ?? raw.departure_station ?? ''),
    arrivalStation: String(raw.arrivalStation ?? raw.arrival_station ?? ''),
    departureTime: String(raw.departureTime ?? raw.departure_time ?? ''),
    arrivalTime: String(raw.arrivalTime ?? raw.arrival_time ?? ''),
    platform: String(raw.platform ?? ''),
    carNumber: String(raw.carNumber ?? raw.car_number ?? ''),
    seatNumber: String(raw.seatNumber ?? raw.seat_number ?? ''),
    seatClass: String(raw.seatClass ?? raw.seat_class ?? ''),
    ticketNumber: String(raw.ticketNumber ?? raw.ticket_number ?? ''),
  };
}

/**
 * 새 백엔드 응답 포맷 매핑
 * GET /api/users/{userId}/tickets  또는  GET /api/tickets 응답 항목
 *
 * @param {Object} raw
 * @param {number}  raw.ticketId
 * @param {string}  raw.ticketNo
 * @param {number}  raw.userId
 * @param {string}  raw.trainNo
 * @param {string}  raw.trainType
 * @param {string}  raw.depStation
 * @param {string}  raw.arrStation
 * @param {number}  raw.depPlatformNo
 * @param {number}  raw.arrPlatformNo
 * @param {string}  raw.depTime   — ISO 8601
 * @param {string}  raw.arrTime   — ISO 8601
 * @param {number}  raw.carNo
 * @param {string}  raw.seatNo
 * @param {number}  raw.price
 * @param {string}  raw.status
 * @returns {TicketInfo & { ticketId: number, userId: number, price: number, status: string, depPlatformNo: number, arrPlatformNo: number }}
 */
export function normalizeApiTicket(raw = {}) {
  const depDate = raw.depTime ? new Date(raw.depTime) : null;
  const arrDate = raw.arrTime ? new Date(raw.arrTime) : null;

  const toDateStr = (d) =>
    d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '';

  const toTimeStr = (d) =>
    d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  return {
    // 기존 앱 호환 필드
    trainName: String(raw.trainType ?? ''),
    travelDate: toDateStr(depDate),
    departureStation: String(raw.depStation ?? ''),
    arrivalStation: String(raw.arrStation ?? ''),
    departureTime: toTimeStr(depDate),
    arrivalTime: toTimeStr(arrDate),
    platform: String(raw.depPlatformNo ?? ''),
    carNumber: String(raw.carNo ?? ''),
    seatNumber: String(raw.seatNo ?? ''),
    seatClass: '',
    ticketNumber: String(raw.ticketNo ?? ''),
    // 새 API 원본 필드
    ticketId: Number(raw.ticketId ?? 0),
    userId: Number(raw.userId ?? 0),
    trainNo: String(raw.trainNo ?? ''),
    price: Number(raw.price ?? 0),
    status: String(raw.status ?? ''),
    depPlatformNo: Number(raw.depPlatformNo ?? 0),
    arrPlatformNo: Number(raw.arrPlatformNo ?? 0),
    depTimeRaw: raw.depTime ?? null,
    arrTimeRaw: raw.arrTime ?? null,
  };
}

/**
 * GET /api/users/{userId}/guide 또는 GET /api/tickets/{ticketId}/guide 응답 정규화
 *
 * GuideResponse: hasTicketToday, message, ticket, fromNode,
 *   platformNode, routeFound, route[], totalDistanceM
 */
export function normalizeUserGuide(data = {}) {
  // 오늘 승차권 없음 — throw 하지 않고 플래그만 반환 (E3 분기용)
  if (data.hasTicketToday === false) {
    return {
      hasTicketToday: false,
      routeFound: false,
      message: data.message ?? '오늘 출발 승차권이 없습니다.',
      reservationId: '',
      ticket: normalizeApiTicket({}),
      fromNode: null,
      toNode: null,
      route: null,
    };
  }

  const ticket = data.ticket ?? data;

  // ticketNo → reservationId (앱 내 식별자로 사용)
  const rawId =
    data.reservationId ??
    ticket.ticketNo ??
    ticket.ticketId ??
    null;

  const reservationId = rawId != null ? String(rawId) : '';

  // 경로: routeFound && route 배열이 있을 때만 정규화
  const rawRoute = Array.isArray(data.route) && data.routeFound !== false ? data.route : null;
  const route = rawRoute
    ? normalizePath({ route: rawRoute, directions: data.directions, from: data.fromNode, to: data.platformNode, totalDistanceM: data.totalDistanceM })
    : null;

  return {
    hasTicketToday: data.hasTicketToday ?? true,
    routeFound: data.routeFound ?? !!rawRoute,
    message: data.message ?? null,
    reservationId,
    ticket: normalizeApiTicket(ticket),
    fromNode: data.fromNode ?? null,      // 출발 노드 ID
    toNode: data.platformNode ?? null,    // 목적지 플랫폼 노드 ID
    route,
  };
}

/**
 * cumulativeDistanceM / distanceToNextM 누락 시 Haversine으로 채움
 * @param {Array<Record<string, unknown>>} steps
 */
function fillStepDistances(steps) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const haversine = (a, b) => {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  let cum = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.cumulativeDistanceM == null || Number.isNaN(step.cumulativeDistanceM)) {
      step.cumulativeDistanceM = cum;
    } else {
      cum = step.cumulativeDistanceM;
    }

    if (i >= steps.length - 1) {
      if (step.distanceToNextM == null) step.distanceToNextM = 0;
      continue;
    }

    const next = steps[i + 1];
    if (step.distanceToNextM == null || Number.isNaN(step.distanceToNextM)) {
      step.distanceToNextM = haversine(step, next);
    }
    if (next.cumulativeDistanceM == null || Number.isNaN(next.cumulativeDistanceM)) {
      next.cumulativeDistanceM = cum + step.distanceToNextM;
    }
    cum = next.cumulativeDistanceM;
  }
  return steps;
}

/**
 * GET /api/paths 응답 → RouteStep[] 변환
 * @param {{ route: Array<{nodeId,name,lat,lng}>, found?: boolean, totalDistanceM?: number }} data
 * @returns {{ routeId: string, steps: RouteStep[], totalDistanceM?: number }}
 */
export function normalizePath(data = {}) {
  const nodes = data.route ?? [];

  // directions.text를 nodeId 기준으로 매핑
  const dirMap = {};
  (data.directions ?? []).forEach((d) => {
    if (d.nodeId) dirMap[d.nodeId] = d;
  });

  const steps = fillStepDistances(
    nodes.map((node, index) => {
      const dir = dirMap[node.nodeId];
      return {
        order: index,
        nodeId: String(node.nodeId ?? ''),
        name: String(node.name ?? ''),
        lat: Number(node.lat),
        lng: Number(node.lng),
        layer: node.layer != null ? Number(node.layer) : undefined,
        instruction: String(dir?.text ?? node.name ?? ''),
        maneuver: dir?.maneuver ?? null,
        headingBearing: dir?.headingBearing != null ? Number(dir.headingBearing) : null,
        distanceToNextM: dir?.distanceToNextM != null ? Number(dir.distanceToNextM) : null,
        cumulativeDistanceM:
          dir?.cumulativeDistanceM != null ? Number(dir.cumulativeDistanceM) : null,
      };
    }),
  );

  return {
    routeId: `path-${data.from ?? ''}-${data.to ?? ''}-${Date.now()}`,
    steps,
    totalDistanceM: data.totalDistanceM != null ? Number(data.totalDistanceM) : undefined,
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {RouteStep}
 */
export function normalizeRouteStep(raw) {
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error(`유효하지 않은 step 좌표: nodeId=${raw.nodeId ?? raw.node_id}`);
  }

  return {
    order: Number(raw.order ?? 0),
    nodeId: String(raw.nodeId ?? raw.node_id ?? ''),
    name: String(raw.name ?? ''),
    lat,
    lng,
    layer: raw.layer != null ? Number(raw.layer) : undefined,
    instruction: String(raw.instruction ?? ''),
  };
}

/**
 * @param {Record<string, unknown>} data
 * @returns {GuideSession}
 */
export function normalizeSession(data) {
  const reservationId = data.reservationId ?? data.reservation_id;
  if (!reservationId) {
    throw new Error('세션 응답에 reservationId가 없습니다.');
  }

  const ticketRaw = data.ticket ?? data;
  return {
    reservationId: String(reservationId),
    ticket: normalizeTicket(ticketRaw),
  };
}

/**
 * @param {Record<string, unknown>} data
 * @returns {GuideRoute}
 */
export function normalizeRoute(data) {
  const stepsRaw = data.steps ?? data.routeSteps ?? data.route_steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new Error('경로 응답에 steps가 없습니다.');
  }

  const steps = stepsRaw.map(normalizeRouteStep).sort((a, b) => a.order - b.order);
  const routeId = data.routeId ?? data.route_id;
  if (!routeId) {
    throw new Error('경로 응답에 routeId가 없습니다.');
  }

  return {
    routeId: String(routeId),
    startNodeId: data.startNodeId ?? data.start_node_id,
    endNodeId: data.endNodeId ?? data.end_node_id,
    totalDistanceM:
      data.totalDistanceM != null
        ? Number(data.totalDistanceM)
        : data.total_distance_m != null
          ? Number(data.total_distance_m)
          : undefined,
    steps,
  };
}
