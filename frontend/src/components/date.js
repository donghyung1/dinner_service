// 'YYYY-MM-DD' 날짜 문자열을 로컬 시간 기준으로 읽기 쉽게 바꾼다.
import { h } from './dom.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function parse(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** '10월 12일 (일)' */
function monthDay(d) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

/** 오늘/어제/N일 전 같은 상대 표현. 7일 이상 지나면 날짜 자체를 보여 준다. */
export function relativeDate(iso) {
  const d = parse(iso);
  if (!d) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff >= 2 && diff <= 6) return `${diff}일 전`;
  return d.getFullYear() === today.getFullYear() ? monthDay(d) : `${d.getFullYear()}년 ${monthDay(d)}`;
}

/** '2026년 10월 12일 (일)' */
export function fullDate(iso) {
  const d = parse(iso);
  return d ? `${d.getFullYear()}년 ${monthDay(d)}` : '';
}

/** 상대 표현 뒤에 날짜를 덧붙인다: '어제 · 10월 13일 (화)'. 이미 날짜 형태면 그대로. */
export function relativeDateWithDay(iso) {
  const rel = relativeDate(iso);
  const d = parse(iso);
  if (!d || !/^(오늘|어제|\d+일 전)$/.test(rel)) return rel;
  return `${rel} · ${monthDay(d)}`;
}

/** <time datetime> 요소. text 를 주지 않으면 relativeDate 를 쓴다. 전체 날짜는 title 로 제공한다. */
export function timeEl(iso, text) {
  if (!iso) return '';
  return h('time', { datetime: iso, title: fullDate(iso) }, text ?? relativeDate(iso));
}
