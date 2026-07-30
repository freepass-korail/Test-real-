import { fetchPath, fetchTicketGuide, fetchTicketGuideSteps } from './tickets';
import { fetchRoute } from './guide';
import { findNearestNode } from '../utils/geo';
import { getTicketIdFromUrl } from './bootstrapGuide';

/**
 * 경로 이탈 후 현재 위치 기준 재탐색.
 * 우선순위:
 * 1) tickets/{id}/guide?fromNode= (가장 가까운 경로 노드)
 * 2) /api/paths?from=&to=
 * 3) /api/v1/guide/routes (lat/lng)
 *
 * @param {{
 *   pos: { lat: number, lng: number },
 *   routeSteps: array,
 *   toNode?: string|null,
 *   ticketId?: number|null,
 *   reservationId?: string|null,
 * }} args
 */
export async function fetchReroute({
  pos,
  routeSteps = [],
  toNode = null,
  ticketId = null,
  reservationId = null,
}) {
  if (!pos?.lat || !pos?.lng) {
    throw new Error('재탐색에 현재 위치가 필요합니다.');
  }

  const nearest = findNearestNode(pos, routeSteps);
  if (!nearest.node?.nodeId) {
    throw new Error('재탐색 기준 노드를 찾지 못했습니다.');
  }

  const fromNodeId = String(nearest.node.nodeId);
  const destId = toNode != null ? String(toNode) : null;

  if (destId && fromNodeId === destId) {
    return {
      kind: 'at_destination',
      fromNodeId,
      nearest,
      route: null,
      stepsRes: null,
    };
  }

  const resolvedTicketId =
    ticketId ||
    getTicketIdFromUrl() ||
    null;

  if (resolvedTicketId) {
    const guide = await fetchTicketGuide(resolvedTicketId, { fromNode: fromNodeId });
    if (guide?.route?.steps?.length) {
      let stepsRes = null;
      try {
        stepsRes = await fetchTicketGuideSteps(resolvedTicketId, {
          fromNode: fromNodeId,
        });
      } catch (err) {
        console.warn('[reroute] guide/steps 로드 실패 (경로만 적용):', err);
      }
      return {
        kind: 'guide',
        fromNodeId,
        nearest,
        guide,
        route: guide.route,
        stepsRes,
        toNode: guide.toNode ?? destId,
      };
    }
  }

  if (destId) {
    const route = await fetchPath({ from: fromNodeId, to: destId });
    return {
      kind: 'path',
      fromNodeId,
      nearest,
      route,
      stepsRes: null,
      toNode: destId,
    };
  }

  if (reservationId) {
    const route = await fetchRoute({
      reservationId: String(reservationId),
      startNodeId: fromNodeId,
      lat: pos.lat,
      lng: pos.lng,
    });
    return {
      kind: 'v1',
      fromNodeId,
      nearest,
      route,
      stepsRes: null,
      toNode: destId,
    };
  }

  throw new Error('재탐색에 필요한 ticketId/toNode/reservationId가 없습니다.');
}
