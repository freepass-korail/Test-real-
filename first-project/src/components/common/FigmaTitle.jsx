import { figma } from '../../styles/figmaLayout';
import { typography } from '../../styles/theme';

function FigmaTitle({ children, spec = figma.mainTitle }) {
  return (
    <h1
      style={{
        position: 'absolute',
        top: spec.top,
        left: spec.left,
        width: spec.width,
        height: spec.height,
        margin: 0,
        fontFamily: typography.fontFamily,
        fontSize: spec.fontSize,
        fontWeight: spec.fontWeight,
        lineHeight: spec.lineHeight,
        color: spec.color,
        letterSpacing: 0,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'pre-line',
      }}
    >
      {children}
    </h1>
  );
}

export default FigmaTitle;
