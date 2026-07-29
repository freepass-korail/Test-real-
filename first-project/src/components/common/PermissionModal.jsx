import styled from 'styled-components';
import { colors, typography } from '../../styles/theme';

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 20;
`;

const Modal = styled.div`
  position: absolute;
  top: 186px;
  left: 41px;
  width: 320px;
  height: 450px;
  background: ${colors.white};
  border: 1px solid #44444433;
  border-radius: 14px;
  overflow: hidden;
  z-index: 30;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  padding: 28px 34px 16px;
  text-align: center;
`;

const ModalTitle = styled.h2`
  font-family: ${typography.fontFamily};
  font-size: 18px;
  font-weight: 700;
  line-height: 150%;
  color: ${colors.black};
  letter-spacing: 0px;
  white-space: pre-line;
  word-break: keep-all;
`;

const ModalBodyBox = styled.div`
  flex: 1;
  margin: 0 16px 16px;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  background: #e8f0e4;
`;

const MapPreview = styled.div`
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(232, 240, 228, 0.2) 0%, rgba(232, 240, 228, 0) 40%),
    #e8f0e4;
`;

const MapSvg = styled.svg`
  width: 100%;
  height: 100%;
  display: block;
`;

const UserDot = styled.div`
  position: absolute;
  left: 50%;
  top: 52%;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  background: #007aff;
  border: 3px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
`;

const MapLabel = styled.span`
  position: absolute;
  font-family: ${typography.fontFamily};
  font-size: 11px;
  font-weight: 600;
  color: #5a5a5a;
  letter-spacing: -0.02em;
  text-shadow: 0 0 3px #fff, 0 0 3px #fff;
  pointer-events: none;
`;

const ActionList = styled.div`
  border-top: 1px solid #e5e5ea;
`;

const ActionButton = styled.button`
  width: 100%;
  padding: 18px 16px;
  border: none;
  background: none;
  font-family: ${typography.fontFamily};
  font-size: 18px;
  font-weight: 700;
  line-height: 22px;
  letter-spacing: 0px;
  color: ${({ $primary }) => ($primary ? colors.primary : '#444444')};
  cursor: pointer;
  border-top: ${({ $divider }) => ($divider ? '1px solid #e5e5ea' : 'none')};
  opacity: ${({ disabled }) => (disabled ? 0.55 : 1)};

  &:active:not(:disabled) {
    background: #f2f2f7;
  }

  &:disabled {
    cursor: wait;
  }
`;

function PermissionModal({ onAllow, onDeny, isRequesting = false }) {
  return (
    <>
      <Backdrop aria-hidden="true" />
      <Modal role="dialog" aria-modal="true" aria-labelledby="permission-title">
        <ModalHeader>
          <ModalTitle id="permission-title">
            {isRequesting
              ? '권한을 확인하고 있어요'
              : `길을 안내하려면 위치가 필요해요.\n[허용]을 눌러주세요.`}
          </ModalTitle>
        </ModalHeader>
        <ModalBodyBox aria-hidden="true">
          <MapPreview>
            <MapSvg viewBox="0 0 288 220" preserveAspectRatio="xMidYMid slice">
              {/* 공원/녹지 */}
              <rect x="0" y="0" width="288" height="220" fill="#E8F0E4" />
              <ellipse cx="55" cy="48" rx="48" ry="36" fill="#C8E0B8" />
              <ellipse cx="240" cy="170" rx="55" ry="40" fill="#C8E0B8" />
              <ellipse cx="200" cy="40" rx="30" ry="22" fill="#D4E8C8" />

              {/* 도로 — 밝은 회색 (iOS Maps 느낌) */}
              <path d="M0 110 H288" stroke="#FFFFFF" strokeWidth="18" />
              <path d="M0 110 H288" stroke="#D8D8D0" strokeWidth="14" />
              <path d="M95 0 V220" stroke="#FFFFFF" strokeWidth="16" />
              <path d="M95 0 V220" stroke="#D8D8D0" strokeWidth="12" />
              <path d="M180 0 V220" stroke="#FFFFFF" strokeWidth="12" />
              <path d="M180 0 V220" stroke="#D8D8D0" strokeWidth="8" />
              <path d="M0 160 H288" stroke="#FFFFFF" strokeWidth="12" />
              <path d="M0 160 H288" stroke="#D8D8D0" strokeWidth="8" />
              <path d="M0 55 H288" stroke="#FFFFFF" strokeWidth="10" />
              <path d="M0 55 H288" stroke="#D8D8D0" strokeWidth="6" />

              {/* 건물 블록 */}
              <rect x="12" y="68" width="62" height="28" rx="2" fill="#EDE6DC" stroke="#D5CFC4" />
              <rect x="115" y="68" width="50" height="28" rx="2" fill="#EDE6DC" stroke="#D5CFC4" />
              <rect x="200" y="68" width="70" height="28" rx="2" fill="#E8E2D8" stroke="#D5CFC4" />
              <rect x="12" y="124" width="70" height="24" rx="2" fill="#EDE6DC" stroke="#D5CFC4" />
              <rect x="115" y="124" width="50" height="24" rx="2" fill="#E8E2D8" stroke="#D5CFC4" />
              <rect x="200" y="124" width="70" height="24" rx="2" fill="#EDE6DC" stroke="#D5CFC4" />
              <rect x="115" y="175" width="50" height="30" rx="2" fill="#EDE6DC" stroke="#D5CFC4" />

              {/* 차선 점선 */}
              <path d="M0 110 H288" stroke="#F5F0A8" strokeWidth="1.5" strokeDasharray="6 8" />
            </MapSvg>
            <MapLabel style={{ top: 28, left: 28 }}>공원</MapLabel>
            <MapLabel style={{ top: 78, left: 118 }}>중앙로</MapLabel>
            <MapLabel style={{ top: 148, right: 24 }}>역전광장</MapLabel>
            <UserDot />
          </MapPreview>
        </ModalBodyBox>
        <ActionList>
          <ActionButton type="button" $primary onClick={onAllow} disabled={isRequesting}>
            {isRequesting ? '확인 중…' : '위치 허용'}
          </ActionButton>
          <ActionButton type="button" $divider onClick={onDeny} disabled={isRequesting}>
            허용 안함
          </ActionButton>
        </ActionList>
      </Modal>
    </>
  );
}

export default PermissionModal;
