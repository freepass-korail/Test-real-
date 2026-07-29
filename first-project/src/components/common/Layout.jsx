import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { colors, layout } from '../../styles/theme';
import { figma } from '../../styles/figmaLayout';

const { width: DESIGN_WIDTH, height: DESIGN_HEIGHT } = figma.screen;

const ViewportFrame = styled.div`
  width: 100%;
  height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const ScaleShell = styled.div`
  flex-shrink: 0;
`;

const MockupContainer = styled.div`
  width: ${DESIGN_WIDTH}px;
  height: ${DESIGN_HEIGHT}px;
  background-color: ${colors.white};
  border-radius: ${layout.screenRadius};
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  transform-origin: top left;
`;

function getViewportScale() {
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  return Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT, 1);
}

function Layout({ children, style }) {
  const [scale, setScale] = useState(getViewportScale);

  useEffect(() => {
    const update = () => setScale(getViewportScale());
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <ViewportFrame>
      <ScaleShell
        style={{
          width: DESIGN_WIDTH * scale,
          height: DESIGN_HEIGHT * scale,
        }}
      >
        <MockupContainer
          style={{
            transform: `scale(${scale})`,
            ...style,
          }}
        >
          {children}
        </MockupContainer>
      </ScaleShell>
    </ViewportFrame>
  );
}

export default Layout;
