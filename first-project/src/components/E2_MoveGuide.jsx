import useFlowStore from '../store/useFlowStore';
import ScreenShell from './common/ScreenShell';
import FigmaPrimaryButton from './common/FigmaPrimaryButton';

import { figma } from '../styles/figmaLayout';
import { screenConfig, typography } from '../styles/theme';

function E2_MoveGuide() {
  const { setStep } = useFlowStore();
  const config = screenConfig.E2;
  const { heading, photo, guideText } = figma.e2;

  return (
    <ScreenShell
      showHeader={config.showHeader}
      bottomButton={
        <FigmaPrimaryButton onClick={() => setStep('S3')}>
          3층으로 올라왔어요
        </FigmaPrimaryButton>
      }
    >
      {/* 제목 */}
      <h1
        style={{
          position: 'absolute',
          top: heading.top,
          left: heading.left,
          width: heading.width,
          height: heading.height,
          margin: 0,
          fontFamily: typography.fontFamily,
          fontSize: heading.fontSize,
          fontWeight: heading.fontWeight,
          lineHeight: heading.lineHeight,
          color: '#000000',
          letterSpacing: 0,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: '#286EF0' }}>3층</span>으로 이동해주세요!
      </h1>

      {/* 에스컬레이터 사진 */}
      {/* 이미지 플레이스홀더 */}
      <div style={{
        position: 'absolute',
        top: photo.top, left: photo.left,
        width: photo.width, height: photo.height,
        borderRadius: photo.radius,
        background: 'linear-gradient(180deg, #8E8E8E 0%, #F4F4F4 100%)',
        boxShadow: photo.shadow,
      }}>
        <p style={{
          position: 'absolute', top: 427 - photo.top, left: 120 - photo.left,
          width: 162, height: 44, margin: 0,
          fontFamily: typography.fontFamily, fontSize: 16, fontWeight: 300,
          lineHeight: '140%', letterSpacing: 0,
          color: '#000000', textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          whiteSpace: 'pre-line',
        }}>
          {'제천역사 내\n계단/에스컬레이터 이미지'}
        </p>
      </div>

      {/* 안내 문구 */}
      <p
        style={{
          position: 'absolute',
          top: guideText.top,
          left: guideText.left,
          width: guideText.width,
          height: guideText.height,
          margin: 0,
          fontFamily: typography.fontFamily,
          fontSize: guideText.fontSize,
          fontWeight: guideText.fontWeight,
          lineHeight: guideText.lineHeight,
          color: guideText.color,
          letterSpacing: guideText.letterSpacing ?? 0,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'pre-line',
        }}
      >
        {guideText.text}
      </p>
    </ScreenShell>
  );
}

export default E2_MoveGuide;
