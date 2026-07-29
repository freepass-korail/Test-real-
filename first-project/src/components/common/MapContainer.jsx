import { useEffect } from 'react';
import useFlowStore from '../../store/useFlowStore';
import { colors } from '../../styles/theme';

function MapContainer() {
  const setMapInstance = useFlowStore((state) => state.setMapInstance);

  useEffect(() => {
    const marker = { lat: null, lng: null, rotation: 0 };

    // GPS/나침반 핫패스에서 console.log 금지 — DevTools 열면 갈수록 느려짐
    const mockMapInstance = {
      marker,
      panTo: () => {},
      setZoom: () => {},
      setMarkerPosition: (lat, lng) => {
        marker.lat = lat;
        marker.lng = lng;
      },
      setMarkerRotation: (deg) => {
        marker.rotation = deg;
      },
    };

    setMapInstance(mockMapInstance);
    return () => setMapInstance(null);
  }, [setMapInstance]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: colors.mapPlaceholder,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.primary,
        fontWeight: 600,
        fontSize: '16px',
      }}
    >
      지도 영역
    </div>
  );
}

export default MapContainer;
