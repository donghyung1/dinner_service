export const CATEGORIES = [
  ['KOREAN', '한식'],
  ['CHINESE', '중식'],
  ['JAPANESE', '일식'],
  ['WESTERN', '양식'],
  ['SNACK', '분식'],
  ['ETC', '기타'],
];
export const STATUSES = [
  ['REGULAR', '자주 감'],
  ['WISHLIST', '가보고 싶음'],
];
export const PRICES = [
  [1, '1만원 미만'],
  [2, '1만원대'],
  [3, '2만원대'],
  [4, '3만원 이상'],
];
export const SORTS = [
  ['created_desc', '최근 등록순'],
  ['name', '이름순'],
  ['last_visited_desc', '최근 방문순'],
];

export const categoryLabel = (v) => CATEGORIES.find(([k]) => k === v)?.[1] ?? v;
export const statusLabel = (v) => STATUSES.find(([k]) => k === v)?.[1] ?? v;
export const priceLabel = (v) => (v == null ? '' : PRICES.find(([k]) => k === v)?.[1] ?? '');

export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
