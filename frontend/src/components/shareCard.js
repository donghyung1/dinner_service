// 월간 회고 공유 카드: 1080x1920 캔버스에 식권 스타일로 그리고, 미리보기 모달로 공유/저장한다.
import { h, nextId } from './dom.js';
import { icon } from './icon.js';
import { categoryLabel } from '../constants.js';

const W = 1080;
const H = 1920;
const C = { steel: '#E9ECEA', mint: '#CFE6D8', ink: '#1E2A47', stamp: '#C8242B', pot: '#E9B825', paper: '#FBFCFA', muted: '#4B566E' };
const DISPLAY = '"Black Han Sans", "Pretendard Variable", Pretendard, sans-serif';
const BODY = '"Pretendard Variable", Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
// 분포 막대 색(붉은색 제외): 잉크/민트/포트 계열
const SEGMENT_COLORS = [C.ink, C.pot, '#7FB093', '#5B6785', '#F3D878'];

const pct = (x) => `${Math.round(x * 1000) / 10}%`;

// 최대 너비에 맞게 말줄임
function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = Array.from(text);
  while (s.length > 1 && ctx.measureText(`${s.join('')}…`).width > maxW) s.pop();
  return `${s.join('')}…`;
}

function rr(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, { font, color = C.ink, align = 'left', maxW } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(maxW ? fitText(ctx, str, maxW) : str, x, y);
}

// "2026-10-03" -> "10월 3일"
function shortDate(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return `${m}월 ${d}일`;
}

export function shareAltText(data, monthLabel) {
  const total = data.total_visits ?? 0;
  const dist = [...(data.category_distribution || [])].sort((a, b) => b.count - a.count);
  const top = (data.top_restaurants || []).slice(0, 3).map((t) => `${t.name} ${t.count}회`).join(', ');
  const parts = [`${monthLabel} 회고 카드. 총 ${total}건 방문.`];
  if (dist[0]) parts.push(`가장 많이 먹은 카테고리는 ${categoryLabel(dist[0].category)} ${pct(dist[0].ratio ?? dist[0].count / total)}.`);
  if (top) parts.push(`자주 간 식당: ${top}.`);
  const acc = data.recommendation?.accept_ratio;
  if (acc != null) parts.push(`추천 수락 ${pct(acc)}.`);
  const st = data.longest_category_streak;
  if (st) parts.push(`최장 연속 ${categoryLabel(st.category)} ${st.length}번.`);
  return parts.join(' ');
}

export async function renderShareCard(data, monthLabel) {
  try {
    await Promise.all([
      document.fonts.load('400 60px "Black Han Sans"', '오늘 뭐 먹지? 0123456789'),
      document.fonts.load('700 36px "Pretendard Variable"', '방문 회고'),
      document.fonts.load('400 36px "Pretendard Variable"', '방문 회고'),
    ]);
  } catch { /* 폰트 로딩 실패 시 대체 폰트로 그린다 */ }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const total = data.total_visits ?? 0;
  const dist = [...(data.category_distribution || [])].filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const top = (data.top_restaurants || []).slice(0, 3);
  const acc = data.recommendation || {};
  const st = data.longest_category_streak;

  // 배경
  ctx.fillStyle = C.steel;
  ctx.fillRect(0, 0, W, H);

  // 앱 이름
  text(ctx, '오늘 뭐 먹지?', W / 2, 135, { font: `400 64px ${DISPLAY}`, align: 'center' });

  // 식권 본체 (좌우에 노치)
  const tx = 70, ty = 200, tw = W - 140, th = 1660, perfY = 1400, notch = 40;
  ctx.save();
  rr(ctx, tx, ty, tw, th, 16);
  ctx.fillStyle = C.mint;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = C.steel;
  for (const x of [tx, tx + tw]) {
    ctx.beginPath();
    ctx.arc(x, perfY, notch, 0, Math.PI * 2);
    ctx.fill();
  }
  // 절취선
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(tx + notch + 20, perfY);
  ctx.lineTo(tx + tw - notch - 20, perfY);
  ctx.stroke();
  ctx.setLineDash([]);
  // 안쪽 테두리
  ctx.lineWidth = 3;
  rr(ctx, tx + 24, ty + 24, tw - 48, th - 48, 10);
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const px = tx + 80;
  const pw = tw - 160;

  // 제목
  text(ctx, monthLabel, px, ty + 140, { font: `400 96px ${DISPLAY}`, maxW: pw });
  text(ctx, '월간 회고', px, ty + 210, { font: `700 44px ${BODY}`, color: C.muted });

  // 총 방문
  text(ctx, '총 방문', px, ty + 330, { font: `700 40px ${BODY}`, color: C.muted });
  ctx.font = `400 200px ${DISPLAY}`;
  const numW = ctx.measureText(String(total)).width;
  text(ctx, String(total), px, ty + 510, { font: `400 200px ${DISPLAY}` });
  text(ctx, '건', px + numW + 20, ty + 510, { font: `400 64px ${DISPLAY}` });

  // 카테고리 분포 막대
  const barY = ty + 590;
  if (dist.length) {
    const lead = dist[0];
    const leadRatio = lead.ratio ?? lead.count / total;
    text(ctx, `${categoryLabel(lead.category)} ${pct(leadRatio)}`, px, barY, { font: `400 56px ${DISPLAY}`, maxW: pw });
    text(ctx, '가장 많이 먹은 카테고리', px, barY + 50, { font: `600 32px ${BODY}`, color: C.muted });

    const by = barY + 90, bh = 56;
    const shown = dist.slice(0, 4);
    const rest = dist.slice(4).reduce((s, c) => s + c.count, 0);
    const segs = shown.map((c) => ({ label: categoryLabel(c.category), count: c.count }));
    if (rest > 0) segs.push({ label: '기타', count: rest });
    const sum = segs.reduce((s, c) => s + c.count, 0) || 1;
    ctx.save();
    rr(ctx, px, by, pw, bh, 12);
    ctx.clip();
    let cx = px;
    segs.forEach((s, i) => {
      const w = (s.count / sum) * pw;
      ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      ctx.fillRect(cx, by, w, bh);
      if (i > 0) { ctx.fillStyle = C.mint; ctx.fillRect(cx - 2, by, 4, bh); }
      cx += w;
    });
    ctx.restore();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    rr(ctx, px, by, pw, bh, 12);
    ctx.stroke();
    // 범례
    let lx = px, ly = by + bh + 46;
    segs.forEach((s, i) => {
      const label = `${s.label} ${s.count}`;
      ctx.font = `600 30px ${BODY}`;
      const lw = ctx.measureText(label).width + 44 + 28;
      if (lx + lw > px + pw) { lx = px; ly += 46; }
      ctx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      ctx.fillRect(lx, ly - 24, 26, 26);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(lx, ly - 24, 26, 26);
      text(ctx, label, lx + 38, ly, { font: `600 30px ${BODY}` });
      lx += lw;
    });
  }

  // TOP 3
  const topY = ty + 880;
  text(ctx, '가장 많이 간 식당 TOP 3', px, topY, { font: `700 38px ${BODY}`, color: C.muted });
  if (top.length) {
    top.forEach((t, i) => {
      const y = topY + 80 + i * 78;
      ctx.beginPath();
      ctx.arc(px + 30, y - 14, 30, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? C.pot : C.paper;
      ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
      text(ctx, String(i + 1), px + 30, y - 1, { font: `400 36px ${DISPLAY}`, align: 'center' });
      ctx.font = `700 44px ${BODY}`;
      const cnt = `${t.count}회`;
      const cw = ctx.measureText(cnt).width;
      text(ctx, cnt, px + pw, y, { font: `700 44px ${BODY}`, align: 'right' });
      text(ctx, t.name, px + 80, y, { font: `700 44px ${BODY}`, maxW: pw - 80 - cw - 24 });
    });
  } else {
    text(ctx, '-', px, topY + 80, { font: `700 44px ${BODY}` });
  }

  // 스텁(절취선 아래): 수락 비율, 연속 기록
  const sy = perfY + 90;
  const half = pw / 2;
  text(ctx, '추천 수락', px, sy, { font: `700 34px ${BODY}`, color: C.muted });
  text(ctx, acc.accept_ratio == null ? '-' : pct(acc.accept_ratio), px, sy + 80, { font: `400 72px ${DISPLAY}` });
  if (acc.accepted_count != null) text(ctx, `추천으로 ${acc.accepted_count}건`, px, sy + 122, { font: `600 30px ${BODY}`, color: C.muted });

  text(ctx, '최장 연속 카테고리', px, sy + 200, { font: `700 34px ${BODY}`, color: C.muted });
  if (st) {
    text(ctx, `${categoryLabel(st.category)} ${st.length}번 연속`, px, sy + 265, { font: `400 52px ${DISPLAY}`, maxW: half + 100 });
    const range = st.from === st.to ? shortDate(st.from) : `${shortDate(st.from)} ~ ${shortDate(st.to)}`;
    text(ctx, range, px, sy + 310, { font: `600 30px ${BODY}`, color: C.muted });
  } else {
    text(ctx, '-', px, sy + 265, { font: `400 52px ${DISPLAY}` });
  }

  // 붉은 도장 (회전)
  ctx.save();
  ctx.translate(tx + tw - 230, perfY + 240);
  ctx.rotate((-14 * Math.PI) / 180);
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = C.stamp;
  ctx.fillStyle = C.stamp;
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, 130, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI * 2); ctx.stroke();
  text(ctx, '이달의', 0, -14, { font: `400 54px ${DISPLAY}`, color: C.stamp, align: 'center' });
  text(ctx, '식권', 0, 54, { font: `400 68px ${DISPLAY}`, color: C.stamp, align: 'center' });
  ctx.restore();

  // 하단 문구
  text(ctx, '오늘 뭐 먹지?', W / 2, H - 22, { font: `600 30px ${BODY}`, color: C.muted, align: 'center' });

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했어요.'))), 'image/png'));
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export async function openShareDialog(canvas, { filename = 'dinner.png', title = '공유 카드', alt = '' } = {}) {
  const opener = document.activeElement;
  let blob;
  try {
    blob = await canvasToBlob(canvas);
  } catch (e) {
    alert(e.message);
    return;
  }
  const url = URL.createObjectURL(blob);
  const file = new File([blob], filename, { type: 'image/png' });
  const canShare = typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] });

  const titleId = nextId('share-title');
  const status = h('p', { class: 'share-status muted small', role: 'status' });
  const img = h('img', { class: 'share-img', src: url, alt: alt || title, width: W, height: H });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    backdrop.remove();
    document.body.classList.remove('share-open');
    URL.revokeObjectURL(url);
    if (opener && opener.isConnected) opener.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  const btn = (name, label, cls, onClick) => h('button', { type: 'button', class: cls, onClick }, [icon(name), label]);

  const shareBtn = canShare
    ? btn('share', '공유하기', 'btn btn-primary', async () => {
        try {
          await navigator.share({ files: [file], title });
        } catch (e) {
          if (e.name !== 'AbortError') status.textContent = '공유하지 못했어요. 이미지 저장을 이용해 주세요.';
        }
      })
    : null;
  const saveBtn = btn('download', '이미지 저장', canShare ? 'btn' : 'btn btn-primary', () => {
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    status.textContent = '이미지를 저장했어요.';
  });
  const closeBtn = btn('x', '닫기', 'btn', close);

  const dialog = h('div', { class: 'share-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' }, [
    h('h2', { id: titleId, class: 'share-title' }, title),
    h('div', { class: 'share-preview' }, img),
    status,
    h('div', { class: 'share-actions' }, [shareBtn, saveBtn, closeBtn]),
  ]);
  const backdrop = h('div', { class: 'share-backdrop', onClick: (e) => { if (e.target === backdrop) close(); } }, dialog);

  document.body.append(backdrop);
  document.body.classList.add('share-open');
  document.addEventListener('keydown', onKey, true);
  // 다른 화면으로 이동하면 모달도 닫는다.
  window.addEventListener('hashchange', close);
  (shareBtn || saveBtn).focus();
}
