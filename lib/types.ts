/** 구글시트(Apps Script api_getState)가 내려주는 데이터 형태 */

export type BalanceRow = {
  name: string;
  /** 분배전 — 분배는 됐지만 아직 지급받지 않은 다이아 */
  pending: number;
  /** 분배완료 — 실제로 지급된 누적 다이아 */
  paid: number;
  /** 참여횟수 (레이드 출석 지표, 금액과 무관) */
  cnt: number;
};

export type LedgerItem = {
  /** 분배대기중 시트의 행 번호 — 분배 API에 그대로 넘긴다 */
  row: number;
  item: string;
  /** MM/DD */
  date: string;
  cnt: number;
};

export type GuildState = {
  rows: BalanceRow[];
  items: LedgerItem[];
  members: string[];
  /** 혈비 적립 계정명 — 참여자 선택 목록에서는 제외한다 */
  fundName: string;
  /** 1/N 나머지가 귀속되는 대상 */
  remainderName: string;
  /** 혈비 비율 (0.1 = 10%) */
  fundRate: number;
  /** 재화 단위 표기 ('다이아') */
  unit: string;
  season: number;
};

export type LookupResult = {
  name: string;
  pending: number;
  paid: number;
  cnt: number;
};

/** 혈맹원 관리 화면용 — 이름과 게임표시명, 그리고 이름을 바꿀 때 따라올 잔액 */
export type RosterEntry = {
  name: string;
  /** 멤버DB D열 — 게임 표시 이름이 DB 표기와 다를 때만 채워진다 */
  displayName: string;
  pending: number;
  /** 혈비 계정은 앱에서 바꿀 수 없다 */
  isFund: boolean;
};

export type PhotoResult = {
  photoUrl?: string;
  matched?: string[];
  ocrPreview?: string;
  msg?: string;
};

/** 모든 API 응답의 공통 봉투 */
export type Envelope<T> =
  | ({ ok: true } & T)
  | { ok: false; msg: string };
