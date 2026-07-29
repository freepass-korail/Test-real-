import { figma } from '../../styles/figmaLayout';
import { typography } from '../../styles/theme';

const labelStyle = {
  fontFamily: typography.fontFamily,
  fontSize: figma.primaryButton.fontSize,
  fontWeight: figma.primaryButton.fontWeight,
  lineHeight: figma.primaryButton.lineHeight,
  letterSpacing: figma.primaryButton.letterSpacing,
  color: figma.primaryButton.color,
  textAlign: 'center',
};

function FigmaPrimaryButton({
  children,
  onClick,
  dimmed = false,
  disabled = false,
  variant = 'primary',
  style,
}) {
  const btn = figma.primaryButton;
  const isSecondary = variant === 'secondary';
  const btnLeft = style?.left ?? btn.left;
  const btnWidth = style?.width ?? btn.width;
  const isInactive = dimmed || disabled;

  return (
    <button
      type="button"
      onClick={isInactive ? undefined : onClick}
      disabled={disabled}
      style={{
        position: 'absolute',
        top: btn.top,
        left: btnLeft,
        width: btnWidth,
        height: btn.height,
        borderRadius: btn.borderRadius,
        border: 'none',
        background: isInactive ? '#9BB8F5' : isSecondary ? '#444444' : btn.background,
        padding: 0,
        cursor: isInactive ? 'default' : 'pointer',
        pointerEvents: isInactive ? 'none' : 'auto',
        transition: 'background-color 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <span
        style={{
          ...labelStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: figma.buttonLabel.height,
        }}
      >
        {children}
      </span>
    </button>
  );
}

function FigmaDualButtons({ left, right }) {
  const { top, left: posLeft, width, height, gap, borderRadius } = figma.dualButton;
  const half = (width - gap) / 2;

  return (
    <>
      <FigmaPrimaryButton
        variant="secondary"
        onClick={left.onClick}
        style={{ top, left: posLeft, width: half, borderRadius }}
      >
        {left.label}
      </FigmaPrimaryButton>
      <FigmaPrimaryButton
        onClick={right.onClick}
        style={{ top, left: posLeft + half + gap, width: half, borderRadius }}
      >
        {right.label}
      </FigmaPrimaryButton>
    </>
  );
}

export { FigmaPrimaryButton, FigmaDualButtons };
export default FigmaPrimaryButton;
