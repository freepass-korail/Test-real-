/** 출발 임박 시 빨간색 강조에 쓰는 색상 */
export const DEPARTURE_URGENT_COLOR = '#E53935';

/** 출발까지 남은 분 (음수면 이미 지남). "HH:MM" 문자열 파싱 */
export function getMinutesUntilDeparture(departureTime, now = new Date()) {
  if (!departureTime) return null;

  const match = /(\d{1,2}):(\d{2})/.exec(departureTime);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  const departure = new Date(now);
  departure.setHours(hours, minutes, 0, 0);

  return (departure.getTime() - now.getTime()) / 60000;
}

/** 출발까지 thresholdMin(기본 5분) 이하로 남았는지 여부 */
export function isDepartureUrgent(departureTime, thresholdMin = 5, now = new Date()) {
  const minutes = getMinutesUntilDeparture(departureTime, now);
  if (minutes == null) return false;
  return minutes <= thresholdMin;
}
