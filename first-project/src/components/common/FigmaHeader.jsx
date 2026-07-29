import korailLogo from '../../assets/korail-logo.png';
import { abs, figma } from '../../styles/figmaLayout';
import { typography } from '../../styles/theme';

function FigmaHeader() {
  const { logo, serviceName } = figma;

  return (
    <>
      <img
        src={korailLogo}
        alt="KORAIL"
        style={{
          ...abs(logo),
          objectFit: 'contain',
        }}
      />

      <span
        style={{
          position: 'absolute',
          top: serviceName.top,
          left: serviceName.left,
          width: serviceName.width,
          height: serviceName.height,
          fontFamily: typography.fontFamily,
          fontSize: serviceName.fontSize,
          fontWeight: serviceName.fontWeight,
          lineHeight: serviceName.lineHeight,
          color: serviceName.color,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        승강장 안내 서비스
      </span>

    </>
  );
}

export default FigmaHeader;
