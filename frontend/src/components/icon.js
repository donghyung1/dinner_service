// lucide(프레임워크 없는 버전) 아이콘 헬퍼. 모든 SVG 는 createElement 로 만들며 innerHTML 을 쓰지 않는다.
import {
  createElement, ArrowLeft, ArrowUpRight, Bookmark, Calendar, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleCheck, CircleX, Coins, Dices, Footprints, History, Hourglass, Info, Landmark, ListChecks, MapPin, NotebookPen,
  Pencil, Plus, RotateCcw, RotateCw, Repeat, Save, Search, SlidersHorizontal, SkipForward, Sparkles, Star,
  StickyNote, Tag, ThumbsUp, Trash2, Trophy, TriangleAlert, Unlink, Utensils, Wallet, X, List, Layers,
  Share2, Download, Compass, Store, Ellipsis, Funnel,
} from 'lucide';
import { h } from './dom.js';

const ICONS = {
  'arrow-left': ArrowLeft, 'arrow-up-right': ArrowUpRight, bookmark: Bookmark, calendar: Calendar, chart: ChartColumn,
  check: Check, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'circle-check': CircleCheck, 'circle-x': CircleX, coins: Coins, dices: Dices, footprints: Footprints, history: History,
  hourglass: Hourglass, info: Info, landmark: Landmark, 'list-checks': ListChecks, list: List, layers: Layers,
  'map-pin': MapPin, 'notebook-pen': NotebookPen, pencil: Pencil, plus: Plus, 'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw, repeat: Repeat, save: Save, search: Search, sliders: SlidersHorizontal, skip: SkipForward,
  sparkles: Sparkles, star: Star, note: StickyNote, tag: Tag, 'thumbs-up': ThumbsUp, trash: Trash2, trophy: Trophy,
  alert: TriangleAlert, unlink: Unlink, utensils: Utensils, wallet: Wallet, x: X,
  share: Share2, download: Download, compass: Compass, store: Store, more: Ellipsis, funnel: Funnel,
};

/** 장식용 SVG 아이콘(스크린리더에서 숨김). fill: true 면 면을 currentColor 로 채운다. */
export function icon(name, { size = '1.25em', cls = '' } = {}) {
  const node = ICONS[name];
  const svg = createElement(node);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon icon-${name}${cls ? ` ${cls}` : ''}`);
  return svg;
}

/** 텍스트 없이 아이콘만 있는 비대화형 라벨. 스크린리더용 sr-only 텍스트와 title 툴팁을 함께 둔다. */
export function iconLabel(name, text, { cls = '', tag = 'span' } = {}) {
  return h(tag, { class: `icon-label ${cls}`.trim(), title: text }, [icon(name), h('span', { class: 'sr-only' }, text)]);
}

/**
 * 아이콘 버튼/링크. href 가 있으면 <a>, 아니면 <button type="button">.
 * text 가 있으면 아이콘 옆에 보이는 짧은 글자를 함께 둔다. label 은 접근 가능한 이름과 title 이 된다.
 */
export function iconButton({ name, label, text, cls = 'btn', href, onClick, disabled, attrs = {} }) {
  const isLink = href !== undefined;
  const el = h(isLink ? 'a' : 'button', {
    ...(isLink ? { href } : { type: 'button' }),
    class: `${cls}${text ? '' : ' btn-icon'}`,
    'aria-label': label,
    title: label,
    disabled,
    onClick,
    ...attrs,
  }, [icon(name), text && h('span', {}, text)]);
  return el;
}

/** 버튼 안의 아이콘을 바꾼다. */
export function setButtonIcon(btn, name) {
  btn.querySelector('svg')?.replaceWith(icon(name));
}
