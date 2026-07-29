import { useEffect, useState } from 'react';
import { getMinutesUntilDeparture, isDepartureUrgent } from '../utils/time';

/**
 * 기차 출발 시각까지 thresholdMin(기본 5분) 이하로 남으면 true.
 * 정확한 임박 시점에 setTimeout으로 한 번만 발동한다 (이벤트 기반).
 */
export default function useDepartureUrgent(departureTime, thresholdMin = 5) {
  const [urgent, setUrgent] = useState(() => isDepartureUrgent(departureTime, thresholdMin));

  useEffect(() => {
    // 이미 임박 상태면 바로 true
    if (isDepartureUrgent(departureTime, thresholdMin)) {
      setUrgent(true);
      return;
    }

    setUrgent(false);

    const minutesLeft = getMinutesUntilDeparture(departureTime);
    if (minutesLeft == null) return;

    // 임박 기준 시점까지 남은 ms (출발 thresholdMin분 전)
    const msUntilUrgent = (minutesLeft - thresholdMin) * 60 * 1000;
    if (msUntilUrgent <= 0) return;

    const timerId = setTimeout(() => setUrgent(true), msUntilUrgent);
    return () => clearTimeout(timerId);
  }, [departureTime, thresholdMin]);

  return urgent;
}
