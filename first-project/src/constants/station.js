/**
 * 제천역 안내 기본 좌표 (BE 출발 — n02 갈림길)
 * GPS 미확보·맵 초기 중심 fallback용.
 * 실제 경로/안내는 BE route[0] lat/lng를 따르며, n01 고정에 의존하지 않는다.
 */
export const STATION_START = {
  lat: 37.1280816,
  lng: 128.2056662,
  nodeId: 'n02',
};
