import FigmaHeader from './FigmaHeader';
import FigmaTitle from './FigmaTitle';

function ScreenShell({
  showHeader = true,
  title,
  titleSpec,
  children,
  bottomButton,
  dualButtons,
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      {showHeader && <FigmaHeader />}
      {title && <FigmaTitle spec={titleSpec}>{title}</FigmaTitle>}
      {children}
      {bottomButton}
      {dualButtons}
    </div>
  );
}

export default ScreenShell;
