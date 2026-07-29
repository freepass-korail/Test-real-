/** 문자/딥링크용 프론트 공개 origin (BE SMS에 넣을 베이스) */
export const APP_ORIGIN = String(
  import.meta.env.VITE_APP_ORIGIN || 'https://freepass-korail.vercel.app',
).replace(/\/$/, '');

/**
 * 문자에 넣을 티켓 안내 URL
 * 예: https://freepass-korail.vercel.app/?ticketId=19
 *
 * @param {number|string} ticketId
 * @param {{ origin?: string }} [opts]
 */
export function buildTicketGuideUrl(ticketId, opts = {}) {
  const origin = (opts.origin || APP_ORIGIN).replace(/\/$/, '');
  const url = new URL(`${origin}/`);
  url.searchParams.set('ticketId', String(ticketId));
  return url.toString();
}
