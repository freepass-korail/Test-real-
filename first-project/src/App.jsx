import { useEffect, useState } from 'react';
import GlobalStyle from './styles/GlobalStyles';
import Layout from './components/common/Layout';
import MapContainer from './components/common/MapContainer';
import useFlowStore from './store/useFlowStore';
import { screenConfig } from './styles/theme';
import { fetchSession, getSessionTokenFromUrl } from './api/guide';
import { bootstrapFromUrl } from './api/bootstrapGuide';

import SMS_Entry from './components/SMS_Entry';
import S1_Join from './components/S1_Join';
import S2_Permission from './components/S2_Permission';
import S3_CheckFloor from './components/S3._CheckFloor';
import S4_Standby from './components/S4_Standby';
import S5_Navigation from './components/S5_Navigation';
import S5_1_Arrived from './components/S5_1_Arrived';
import E1_StaticGuide from './components/E1_StaticGuide';
import E2_MoveGuide from './components/E2_MoveGuide';
import S5_2_AltRoute from './components/S5_2_AltRoute';
import E3_NoTicket from './components/E3_NoTicket';
import E4_Departed from './components/E4_Departed';
import E5_GuideDone from './components/E5_GuideDone';
import E6_Refunded from './components/E6_Refunded';
import NetworkOfflineOverlay from './components/common/NetworkOfflineOverlay';

function App() {
  const { step, setStep, setReservation } = useFlowStore();
  const currentScreen = screenConfig[step] || screenConfig.S1;
  const [sessionError, setSessionError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setSessionError(null);

      const token = getSessionTokenFromUrl();
      if (token) {
        try {
          const session = await fetchSession(token);
          if (cancelled) return;
          setReservation(session.reservationId, session.ticket);
          setStep('S1');
          return;
        } catch (error) {
          console.error('[guide/session] → ticketId/userId 부트스트랩으로 폴백', error);
        }
      }

      // 문자 링크: ?ticketId= → guide 로드 후 S1 (SMS 화면 없음)
      // 레거시: ?userId=
      try {
        const nextStep = await bootstrapFromUrl();
        if (cancelled) return;
        if (nextStep == null) {
          // 쿼리 없음 — SMS로 보내지 않음. ?ticketId= 로 진입
          return;
        }
        // 성공 시 항상 스텝 확정 (세션 잔여 상태여도 S1부터)
        setStep(nextStep);
      } catch (error) {
        console.error('[bootstrap/guide]', error);
        if (!cancelled) {
          if (error?.code === 'NO_TICKET_TODAY') {
            setStep('E3');
          } else {
            setSessionError(error.message ?? '승차권 안내 정보를 불러오지 못했습니다.');
          }
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [setReservation, setStep]);

  const renderStepComponent = () => {
    switch (step) {
      case 'SMS':
        return <SMS_Entry />;
      case 'S1':
        return <S1_Join />;
      case 'S2':
        return <S2_Permission />;
      case 'S3':
        return <S3_CheckFloor />;
      case 'S4':
        return <S4_Standby />;
      case 'S5':
        return <S5_Navigation />;
      case 'S5_1':
        return <S5_1_Arrived />;
      case 'S5_2':
        return <S5_2_AltRoute />;
      case 'E3':
        return <E3_NoTicket />;
      case 'E4':
        return <E4_Departed />;
      case 'E5':
        return <E5_GuideDone />;
      case 'E6':
        return <E6_Refunded />;
      case 'E1':
        return <E1_StaticGuide />;
      case 'E2':
        return <E2_MoveGuide />;
      default:
        return <S1_Join />;
    }
  };

  return (
    <>
      <GlobalStyle />
      <Layout style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
          <MapContainer />
        </div>

        {sessionError && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              padding: '10px 16px',
              borderRadius: 8,
              background: '#FEE2E2',
              color: '#991B1B',
              fontSize: 14,
              maxWidth: '90%',
              textAlign: 'center',
            }}
          >
            {sessionError}
          </div>
        )}

        <div
          style={{
            position: currentScreen.showMap ? 'absolute' : 'relative',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 10,
          }}
        >
          {renderStepComponent()}
        </div>

        <NetworkOfflineOverlay />
      </Layout>
    </>
  );
}

export default App;
