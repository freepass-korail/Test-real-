import useFlowStore from '../store/useFlowStore';
import ScreenShell from './common/ScreenShell';
import { FigmaDualButtons } from './common/FigmaPrimaryButton';
import { screenConfig } from '../styles/theme';

/** 피그마 S3 타이틀: 264×112 / top 371 left 69 / Pretendard 700 40px */
const s3TitleSpec = {
  width: 264,
  height: 112,
  top: 371,
  left: 69,
  fontSize: 40,
  fontWeight: 700,
  lineHeight: '140%',
  color: '#000000',
};

const BLUE = '#286EF0';

function S3Title() {
  return (
    <span
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        lineHeight: '140%',
      }}
    >
      <span>지금 현재</span>
      <span>
        <span style={{ color: BLUE }}>3층</span>
        <span>에 계신가요?</span>
      </span>
    </span>
  );
}

function S3_CheckFloor() {
  const { setStep } = useFlowStore();
  const config = screenConfig.S3;

  return (
    <ScreenShell
      showHeader={config.showHeader}
      title={<S3Title />}
      titleSpec={s3TitleSpec}
      dualButtons={
        <FigmaDualButtons
          left={{ label: '아니오', onClick: () => setStep('E2') }}
          right={{ label: '네', onClick: () => setStep('S4') }}
        />
      }
    />
  );
}

export default S3_CheckFloor;
