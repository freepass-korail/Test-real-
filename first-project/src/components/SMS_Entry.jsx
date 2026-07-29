import { useMemo, useState } from 'react';
import styled from 'styled-components';
import useFlowStore from '../store/useFlowStore';
import { bootstrapTicketGuide, getTicketIdFromUrl } from '../api/bootstrapGuide';
import { APP_ORIGIN, buildTicketGuideUrl } from '../api/ticketUrl';
import { sendTestSms } from '../api/sms';
import { typography } from '../styles/theme';

/* ─── 전체 프레임 ─── */
const Frame = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #fff;
  font-family: -apple-system, 'SF Pro Text', ${typography.fontFamily};
  overflow: hidden;
`;

/* ─── 상태바 ─── */
const StatusBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 6px;
  flex-shrink: 0;
`;

const StatusTime = styled.span`
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.3px;
`;

const StatusIcons = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

/* ─── 네비게이션 바 ─── */
const NavBar = styled.div`
  display: flex;
  align-items: center;
  padding: 4px 12px 10px;
  border-bottom: 0.5px solid #C6C6C8;
  flex-shrink: 0;
`;

const NavBack = styled.button`
  display: flex;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  color: #007AFF;
  font-size: 17px;
  font-family: inherit;
  padding: 4px 0;
  cursor: pointer;
  white-space: nowrap;
`;

const NavCenter = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const NavAvatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #C7C7CC;
`;

const NavName = styled.div`
  font-size: 12px;
  color: #000;
  font-weight: 400;
  display: flex;
  align-items: center;
  gap: 2px;
`;

const NavChevron = styled.span`
  color: #3C3C43;
  opacity: 0.6;
  font-size: 11px;
`;

const NavAction = styled.button`
  background: none;
  border: none;
  color: #007AFF;
  cursor: pointer;
  padding: 4px;
`;

/* ─── 메시지 영역 ─── */
const MessageArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
`;

const DateStamp = styled.div`
  text-align: center;
  font-size: 12px;
  color: #8E8E93;
  margin-bottom: 10px;
`;

const BubbleRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 2px;
`;

const BubbleAvatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #C7C7CC;
  flex-shrink: 0;
`;

const Bubble = styled.div`
  max-width: 78%;
  background: #E9E9EB;
  border-radius: 18px 18px 18px 4px;
  padding: 10px 14px;
  font-size: 15px;
  line-height: 1.45;
  color: #000;
  white-space: pre-wrap;
  word-break: break-all;
`;

const BubbleLink = styled.button`
  display: block;
  background: none;
  border: none;
  padding: 0;
  margin-top: 4px;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.45;
  color: #007AFF;
  text-decoration: underline;
  cursor: pointer;
  text-align: left;
  word-break: break-all;

  &:disabled {
    opacity: 0.55;
    cursor: wait;
  }
`;

const BubbleUrl = styled.a`
  display: block;
  font-size: 15px;
  color: #007AFF;
  text-decoration: underline;
  word-break: break-all;
`;

const ErrorBubble = styled.div`
  margin-top: 6px;
  padding: 8px 12px;
  background: #FEE2E2;
  border-radius: 12px;
  font-size: 13px;
  color: #B91C1C;
`;

/* ─── 입력 바 ─── */
const InputBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 20px;
  border-top: 0.5px solid #C6C6C8;
  background: #fff;
  flex-shrink: 0;
`;

const InputField = styled.div`
  flex: 1;
  min-height: 36px;
  border: 1px solid #C6C6C8;
  border-radius: 18px;
  padding: 8px 14px;
  font-size: 15px;
  color: #8E8E93;
  display: flex;
  align-items: center;
`;

/* ─── SVG 아이콘 모음 ─── */
function SignalIcon() {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden>
      {[0,1,2,3].map((i) => (
        <rect key={i} x={i * 4.5} y={12 - (i + 1) * 3} width="3.5" height={(i + 1) * 3} rx="0.5" fill="black" />
      ))}
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden>
      <path d="M8 9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" fill="black"/>
      <path d="M4.2 6.8A5.5 5.5 0 0 1 11.8 6.8" stroke="black" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      <path d="M1.5 4A9 9 0 0 1 14.5 4" stroke="black" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="black" strokeOpacity="0.35"/>
      <rect x="2" y="2" width="17" height="8" rx="2" fill="black"/>
      <path d="M23 4v4a2 2 0 0 0 0-4Z" fill="black" fillOpacity="0.4"/>
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="#007AFF" aria-hidden>
      <path d="M13 2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/>
      <path d="m15 6 6-3v10l-6-3V6Z"/>
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#8E8E93" aria-hidden>
      <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Z"/>
      <path d="M19 12a7 7 0 0 1-14 0" stroke="#8E8E93" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <line x1="12" y1="19" x2="12" y2="23" stroke="#8E8E93" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function AppStoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="11" stroke="#8E8E93" strokeWidth="1.5"/>
      <path d="M9 12h6M12 9v6" stroke="#8E8E93" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const UserIdRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #d1d1d6;
`;

const UserIdInput = styled.input`
  width: 70px;
  padding: 8px 10px;
  border: 1px solid #c6c6c8;
  border-radius: 10px;
  font-size: 15px;
  font-family: inherit;
  color: #000;
  text-align: center;
  outline: none;
  &:focus { border-color: #007aff; }
`;

const UserIdButton = styled.button`
  flex: 1;
  padding: 9px 0;
  background: #007aff;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  &:disabled { opacity: 0.55; cursor: wait; }
`;

const SmsTestButton = styled(UserIdButton)`
  background: #34c759;
  margin-top: 8px;
  flex: none;
  width: 100%;
`;

const Hint = styled.p`
  margin: 8px 0 0;
  font-size: 12px;
  color: #8e8e93;
  line-height: 1.35;
  word-break: break-all;
`;

/* ─── 메인 컴포넌트 ─── */
function SMS_Entry() {
  const { setStep } = useFlowStore();
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [smsOk, setSmsOk] = useState(null);
  const [ticketId, setTicketId] = useState(() => String(getTicketIdFromUrl() ?? '19'));

  const guideDeepLink = useMemo(() => {
    const id = Number(ticketId);
    if (!id || id <= 0) return `${APP_ORIGIN}/?ticketId=`;
    return buildTicketGuideUrl(id);
  }, [ticketId]);

  const handleGuideLink = () => {
    const id = Number(ticketId);
    if (!id || id <= 0) {
      setError('올바른 승차권 ID(ticketId)를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    setSmsOk(null);

    // 문자 딥링크와 동일: /api/tickets/{ticketId}/guide(+steps)
    const url = new URL(window.location.href);
    url.searchParams.set('ticketId', String(id));
    url.searchParams.delete('userId');
    url.searchParams.delete('user');
    url.searchParams.delete('type');
    url.searchParams.delete('guide');
    window.history.replaceState({}, '', url);

    bootstrapTicketGuide(id)
      .then((nextStep) => setStep(nextStep))
      .catch((err) => {
        console.error('[tickets/guide]', err);
        setError(err.message ?? '승차권 안내 정보를 불러오지 못했습니다.');
      })
      .finally(() => setLoading(false));
  };

  /** POST /sms/test/{ticketId} — BE 테스트 문자 즉시 발송 */
  const handleSendTestSms = () => {
    const id = Number(ticketId);
    if (!id || id <= 0) {
      setError('올바른 승차권 ID(ticketId)를 입력해 주세요.');
      return;
    }
    setSmsLoading(true);
    setError(null);
    setSmsOk(null);
    sendTestSms(id)
      .then((res) => {
        console.log('[SMS] sendTest ok', res);
        setSmsOk(`ticket ${id} 안내 문자 발송 요청 완료`);
      })
      .catch((err) => {
        console.error('[SMS] sendTest', err);
        setError(err.message ?? '문자 발송에 실패했습니다.');
      })
      .finally(() => setSmsLoading(false));
  };

  return (
    <Frame>
      {/* 상태바 */}
      <StatusBar>
        <StatusTime>7:10</StatusTime>
        <StatusIcons>
          <SignalIcon />
          <WifiIcon />
          <BatteryIcon />
        </StatusIcons>
      </StatusBar>

      {/* 네비게이션 */}
      <NavBar>
        <NavBack type="button">
          ‹ 문자
        </NavBack>
        <NavCenter>
          <NavAvatar />
          <NavName>
            코레일 한국철도
            <NavChevron> ›</NavChevron>
          </NavName>
        </NavCenter>
        <NavAction type="button" aria-label="영상통화">
          <VideoIcon />
        </NavAction>
      </NavBar>

      {/* 메시지 */}
      <MessageArea>
        <DateStamp>오늘 7:10</DateStamp>

        <BubbleRow>
          <BubbleAvatar />
          <Bubble>
            {`[Web발신]
코레일 동행안내
(서울역▶ 제천역)
[KTX 1063]
출발시각: 7시 25분

안녕하세요.
예매하신 열차 출발 15분 전입니다.
현재 위치를 확인하여 탑승 승강장
까지 안내해 드립니다.
`}
            <BubbleLink
              type="button"
              onClick={handleGuideLink}
              disabled={loading || smsLoading}
            >
              {loading ? '불러오는 중…' : '▶ 승강장 안내 서비스 시작하기'}
            </BubbleLink>
            <BubbleUrl
              href={guideDeepLink}
              onClick={(e) => {
                e.preventDefault();
                handleGuideLink();
              }}
            >
              {guideDeepLink}
            </BubbleUrl>

            {error && <ErrorBubble>{error}</ErrorBubble>}
            {smsOk && <Hint style={{ color: '#34c759' }}>{smsOk}</Hint>}

            <UserIdRow>
              <UserIdInput
                type="number"
                min="1"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGuideLink()}
                aria-label="승차권 ID (ticketId)"
              />
              <UserIdButton
                type="button"
                onClick={handleGuideLink}
                disabled={loading || smsLoading}
              >
                {loading ? '불러오는 중…' : `ticket ${ticketId} 시작`}
              </UserIdButton>
            </UserIdRow>
            <SmsTestButton
              type="button"
              onClick={handleSendTestSms}
              disabled={loading || smsLoading}
            >
              {smsLoading ? '문자 발송 중…' : `SMS 테스트 발송 (ticket ${ticketId})`}
            </SmsTestButton>
            <Hint>
              문자용 URL: {guideDeepLink}
              <br />
              POST /sms/test/&#123;ticketId&#125; — 해당 승차권 유저 번호로 안내 문자 즉시 발송
            </Hint>
          </Bubble>
        </BubbleRow>
      </MessageArea>

      {/* 입력 바 */}
      <InputBar>
        <AppStoreIcon />
        <InputField>Message</InputField>
        <MicIcon />
      </InputBar>
    </Frame>
  );
}

export default SMS_Entry;
