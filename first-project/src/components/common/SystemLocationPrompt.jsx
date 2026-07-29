import styled from 'styled-components';
import { typography } from '../../styles/theme';

const Scrim = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

/** iOS Safari / Chrome 위치 권한 알림 느낌 */
const Alert = styled.div`
  width: 270px;
  background: rgba(242, 242, 247, 0.96);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(20px);
  z-index: 90;
`;

const Message = styled.p`
  margin: 0;
  padding: 20px 16px 16px;
  font-family: ${typography.fontFamily};
  font-size: 13px;
  font-weight: 400;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: #000;
  text-align: center;
  word-break: keep-all;
`;

const Host = styled.span`
  font-weight: 600;
`;

const Actions = styled.div`
  display: flex;
  border-top: 0.5px solid rgba(60, 60, 67, 0.29);
`;

const ActionBtn = styled.button`
  flex: 1;
  margin: 0;
  padding: 12px 8px;
  border: none;
  background: transparent;
  font-family: ${typography.fontFamily};
  font-size: 17px;
  line-height: 22px;
  letter-spacing: -0.02em;
  color: #007aff;
  cursor: pointer;
  font-weight: ${({ $primary }) => ($primary ? 600 : 400)};

  & + & {
    border-left: 0.5px solid rgba(60, 60, 67, 0.29);
  }

  &:active {
    background: rgba(0, 0, 0, 0.06);
  }
`;

function SystemLocationPrompt({ onAllow, onDeny }) {
  const host =
    typeof window !== 'undefined' ? window.location.hostname || '이 사이트' : '이 사이트';

  return (
    <Scrim role="presentation" data-testid="system-geo-prompt">
      <Alert role="alertdialog" aria-modal="true" aria-labelledby="system-geo-title">
        <Message id="system-geo-title">
          <Host>&ldquo;{host}&rdquo;</Host>
          에서 사용자의 현재 위치를 사용하려고 합니다.
        </Message>
        <Actions>
          <ActionBtn type="button" onClick={onDeny} data-testid="system-geo-deny">
            허용 안 함
          </ActionBtn>
          <ActionBtn type="button" $primary onClick={onAllow} data-testid="system-geo-allow">
            허용
          </ActionBtn>
        </Actions>
      </Alert>
    </Scrim>
  );
}

export default SystemLocationPrompt;
