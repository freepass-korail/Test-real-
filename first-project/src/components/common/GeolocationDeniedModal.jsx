import styled from 'styled-components';
import { colors, typography } from '../../styles/theme';

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 40;
`;

const ModalLayer = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 32px;
  z-index: 50;
`;

const Modal = styled.div`
  width: 100%;
  max-width: 320px;
  background: ${colors.white};
  border-radius: 14px;
  padding: 24px 20px 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
`;

const Title = styled.h2`
  font-family: ${typography.fontFamily};
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
  color: ${colors.black};
  text-align: center;
  margin-bottom: 12px;
`;

const Body = styled.p`
  font-family: ${typography.fontFamily};
  font-size: 15px;
  font-weight: 500;
  line-height: 1.65;
  color: ${colors.gray};
  text-align: center;
  white-space: pre-line;
  margin-bottom: 20px;
`;

const ActionButton = styled.button`
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: ${({ $primary }) => ($primary ? colors.primary : '#F2F2F7')};
  color: ${({ $primary }) => ($primary ? colors.white : colors.black)};
  font-family: ${typography.fontFamily};
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
`;

function GeolocationDeniedModal({ message, onRetry, onFallback }) {
  return (
    <>
      <Backdrop aria-hidden="true" />
      <ModalLayer role="dialog" aria-modal="true">
        <Modal>
          <Title>위치 권한이 필요합니다</Title>
          <Body>
            {message ||
              `정확한 승강장 안내를 위해 위치 접근이 필요합니다.

iPhone: 설정 → Safari → 위치 → 허용
또는 주소창 왼쪽 aA → 웹사이트 설정 → 위치 허용`}
          </Body>
          {onRetry && (
            <ActionButton type="button" $primary onClick={onRetry}>
              다시 시도
            </ActionButton>
          )}
          {onFallback && (
            <ActionButton type="button" onClick={onFallback}>
              정적 안내로 이동
            </ActionButton>
          )}
        </Modal>
      </ModalLayer>
    </>
  );
}

export default GeolocationDeniedModal;
