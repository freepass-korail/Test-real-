import { useEffect, useState } from 'react';
import { getMinutesUntilDeparture } from '../utils/time';

/**
 * 출발 시각이 지나면 true 반환.
 * 정확한 시점에 setTimeout으로 한 번 발동한다.
 */
export default function useDepartureExpired(departureTime) {
  const [expired, setExpired] = useState(() => {
    if (import.meta.env.DEV) return false;
    const minutes = getMinutesUntilDeparture(departureTime);
    return minutes != null && minutes < 0;
  });

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const minutes = getMinutesUntilDeparture(departureTime);
    if (minutes == null) return;

    if (minutes < 0) {
      setExpired(true);
      return;
    }

    setExpired(false);
    const msUntilExpiry = minutes * 60 * 1000;
    const timerId = setTimeout(() => setExpired(true), msUntilExpiry);
    return () => clearTimeout(timerId);
  }, [departureTime]);

  return expired;
}
