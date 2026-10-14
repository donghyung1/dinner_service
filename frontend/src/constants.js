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

// 공공데이터 출처 표기 (FR-86). 라이선스(공공누리 유형 등) 확인 결과에 따라 이 한 곳만 수정한다.
export const DATA_SOURCE_NOTICE =
  '식당 검색 데이터 출처: 공공데이터포털 소상공인시장진흥공단_상가(상권)정보 (공공데이터포털 data.go.kr)';

/** 공공데이터 항목 -> 폼 값 (PRD 5.11.4 채움 규칙). */
export function placeToFormValues(p) {
  const name = p.branch_name ? `${p.name} ${p.branch_name}` : p.name;
  return { name: name.slice(0, 100), location: (p.location || '').slice(0, 255), category: p.category, place_no: p.place_no };
}
