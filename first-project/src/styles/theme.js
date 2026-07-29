/** 코레일 승강장 안내 서비스 디자인 토큰 */

export const colors = {
  primary: '#286EF0',
  dark: '#144999',
  gray: '#444444',
  black: '#000000',
  white: '#FFFFFF',
  bg: '#F4F5F7',
  border: '#E5E7EB',
  mapPlaceholder: '#E0F2FE',
  cardLight: '#D4E2FC',
  ticketCardBg: '#286EF033',
};

export const layout = {
  mobileWidth: '402px',
  mobileHeight: '874px',
  screenRadius: '20px',
  contentPadding: '24px',
  contentPaddingLeft: '20px',
  buttonHeight: '56px',
  buttonRadius: '28px',
  cardRadius: '20px',
};

export const typography = {
  fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
  titleSize: '26px',
  bodySize: '18px',
  buttonSize: '18px',
  lineHeight: '1.5',
};

/** 버튼 variant 객체 — Zustand/화면에서 참조 */
export const buttonVariants = {
  primary: {
    background: colors.primary,
    color: colors.white,
    activeBackground: colors.dark,
  },
  secondary: {
    background: colors.gray,
    color: colors.white,
    activeBackground: colors.black,
  },
  outline: {
    background: colors.white,
    color: colors.primary,
    border: `2px solid ${colors.primary}`,
    activeBackground: '#F0F5FF',
  },
  ghost: {
    background: 'transparent',
    color: colors.gray,
    activeBackground: '#F4F5F7',
  },
};

/** 화면(step) 메타 객체 */
export const screenConfig = {
  SMS: { label: '문자 안내', showHeader: false, showMap: false },
  S1: { label: '진입', showHeader: true, showMap: false },
  S2: { label: '위치 권한', showHeader: true, showMap: false },
  S3: { label: '2층 확인', showHeader: true, showMap: false },
  S4: { label: '타는 곳 확정', showHeader: true, showMap: false },
  S5: { label: '길찾기', showHeader: false, showMap: false, fullBleed: true },
  S5_1: { label: '도착', showHeader: false, showMap: false, fullBleed: true },
  E1: { label: '정적 안내', showHeader: true, showMap: false },
  E2: { label: '2층 이동', showHeader: true, showMap: false },
};
