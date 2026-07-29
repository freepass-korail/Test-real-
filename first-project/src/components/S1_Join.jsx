import { useEffect } from 'react';
import useFlowStore from '../store/useFlowStore';
import ScreenShell from './common/ScreenShell';
import FigmaPrimaryButton from './common/FigmaPrimaryButton';
import { screenConfig, colors } from '../styles/theme';
import { vibrateOnArrival } from '../utils/haptics';

const s1Title = (
  <span>
    <span style={{ color: colors.primary }}>타는 곳</span>까지
    <br />
    안내해 드릴게요.
  </span>
);

function S1_Join({ dimmed = false }) {
  const { setStep } = useFlowStore();

  useEffect(() => {
    vibrateOnArrival();
  }, []);
  const config = screenConfig.S1;

  return (
    <ScreenShell
      showHeader={config.showHeader}
      title={s1Title}
      bottomButton={
        <FigmaPrimaryButton dimmed={dimmed} onClick={() => setStep('S2')}>
          시작하기
        </FigmaPrimaryButton>
      }
    />
  );
}

export default S1_Join;
