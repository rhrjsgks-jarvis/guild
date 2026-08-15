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
  /** 등록 당시 참여자 명단 — 분배 미리보기에서 비중을 적용하는 데 쓴다 */
  names: string[];
  /** 인증샷 — v11.0 부터 한 아이템에 여러 장 (옛 기록은 0~1장) */
  photos?: string[];
};

export type GuildState = {
  rows: BalanceRow[];
  items: LedgerItem[];
  members: string[];
  /** 멤버별 부가정보 (분배비중·서버·한자표기) */
  memberInfo: MemberInfo[];
  /** 혈맹운영비 적립 계정명 — 참여자 선택 목록에서는 제외한다 */
  fundName: string;
  /** 혈맹운영비 비율 (0.1 = 10%) */
  fundRate: number;
  /** 비중을 지정하지 않은 멤버의 기본값 (100) */
  defaultWeight: number;
  /** 선택 가능한 서버 목록 ('01'~'12') */
  serverList: string[];
  /** 이번 시즌 서버 이름 (표시 전용, 비어 있을 수 있음) */
  seasonServer: string;
  /** 마스터관리자가 정한 앱 이름 */
  appName: string;
  /** 항상 최상단에 띄울 최신 공지 (없으면 null) */
  notice: { id: number; title: string; at: string } | null;
  /** 재화 단위 표기 ('다이아') */
  unit: string;
  season: number;
  /** 구글시트에 붙여넣은 .gs 의 버전. 앱 버전과 다르면 재배포가 안 된 것이다 */
  version?: string;
};

/** 멤버DB E·F·G 열 — 정산에 쓰이는 건 weight 뿐이고 나머지는 표시용이다 */
export type MemberInfo = {
  name: string;
  /** 분배비중 1~100 (%). 비워두면 100 */
  weight: number;
  /** '01'~'12' 또는 빈 문자열 */
  server: string;
  /** 중국어권 혈맹원용 한자 표기 — 관리자가 눈으로 확인해 저장한 값만 들어온다 */
  hanja: string;
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
  /** 혈맹운영비 계정은 앱에서 바꿀 수 없다 */
  isFund: boolean;
  weight?: number;
  server?: string;
  hanja?: string;
  /** 리니지W 클래스 (v11.5) — 공식 13종 중 하나이거나 빈칸. 한 사람에 하나다 */
  cls?: string;
};

/** 아이디 변경 이력 — 변경 전/후를 나란히 보여준다 */
export type RenameRecord = {
  at: string;
  before: string;
  after: string;
  by: string;
  /** 이미 있는 이름으로 바꿔 두 계정이 합쳐진 건 */
  merged: boolean;
  detail: string;
};

/** 게시판 글 — kind 'notice' 는 앱에서 항상 맨 위에 고정된다 */
export type BoardPost = {
  id: number;
  kind: 'notice' | 'post';
  title: string;
  body: string;
  author: string;
  at: string;
};

/** 연합 정산 — 혈맹 내부 분배와 완전히 분리된 장부. 시트의 한 줄 = 한 서버의 몫 */
export type AllianceRow = {
  row: number;
  date: string;
  server: string;
  item: string;
  amount: number;
  /** v10.9 이하 기록에만 값이 있다 (v11.0 부터 인원수 비례로 바뀌었다) */
  pct: number;
  people: number;
  credited: number;
  photos: string[];
  /** 같은 아이템을 여러 서버가 나눠 가진 경우 이 값으로 한 건을 묶는다 */
  group: string;
  /** 혈맹운영비로 귀속된 몫 — 묶음의 첫 줄에만 값이 있다 */
  fund: number;
  by: string;
  /** '⏳미분배' | '✅분배완료' — v10.2 이하 행은 금액 유무로 판정된다 */
  status: string;
  done: boolean;
};

/** 아이템 하나 = 여러 서버 줄을 묶은 것. 화면은 항상 이 단위로 보여준다 */
export type AllianceGroup = {
  group: string;
  date: string;
  item: string;
  by: string;
  amount: number;
  fund: number;
  people: number;
  credited: number;
  photos: string[];
  /** 서버별 줄 — 인증샷도 **줄마다 그 서버의 것**이다 (v11.3) */
  servers: { server: string; people: number; credited: number; photos?: string[] }[];
  rows: number[];
  done: boolean;
};

export type AllianceTotal = {
  server: string;
  credited: number;
  amount: number;
  count: number;
  people: number;
};

export type AllianceState = {
  rows: AllianceRow[];
  groups: AllianceGroup[];
  /** 아직 금액이 안 정해진 등록 건 (서버별 누적에는 들어가지 않는다) */
  waiting: AllianceGroup[];
  records: AllianceGroup[];
  totals: AllianceTotal[];
  serverList: string[];
  unit: string;
};

/** 전체 아이템 (미분배 + 분배완료) — 정정·삭제 대상 선택용 */
export type LedgerEntry = {
  row: number;
  item: string;
  status: string;
  date: string;
  cnt: number;
  amount: number;
  perPerson: number;
  /** 지금 참여자 명단 — 마스터가 분배완료 건을 고칠 때 쓴다 (v11.1) */
  names?: string[];
  fund: number;
};

/** 정정·삭제 전에 "무슨 일이 일어나는지" 미리 보여줄 내용 */
export type ReversePreview = {
  item: string;
  status: string;
  n: number;
  amount: number;
  needsReverse: boolean;
  fundName?: string;
  /** 참여자에게서 회수할 합계 */
  toMembers?: number;
  /** 혈맹운영비에서 회수할 금액 */
  fund?: number;
  /** 누구에게서 얼마를 빼는지 — 분배 시점 금액 그대로 */
  lines?: { name: string; amount: number }[];
  /** 이미 지급된 사람이 있어 되돌릴 수 없는 상태 */
  blocked: boolean;
  insufficient?: string[];
};

export type PayoutRecord = {
  name: string;
  amount: number;
  date: string;
};

/** 관리 도구 — 서버가 목록을 내려주므로 앱은 화면만 그린다 */
export type Tool = {
  id: string;
  name: string;
  desc: string;
  /** 1=되돌릴 수 있음 · 2=데이터 변경 · 3=되돌릴 수 없음(확인 문구 필요) */
  danger: number;
  /** 마스터관리자만 실행할 수 있는가 (되돌릴 수 없는 도구) */
  master?: boolean;
  /** danger 3 일 때 정확히 입력해야 하는 문구 */
  confirm: string;
  inputs: { key: string; label: string; placeholder?: string }[];
};

/** 보관된 시즌 목록 항목 */
export type SeasonInfo = {
  num: number;
  name: string;
  /** 시트 첫 줄 제목 (종료일·정산 건수 포함) */
  title: string;
  summary: { label: string; value: string }[];
};

/** 시즌 상세 — 시트의 섹션(잔액·아이템·요약·지급)을 그대로 표로 */
export type SeasonDetail = {
  num: number;
  name: string;
  title: string;
  sections: { title: string; headers: string[]; rows: string[][] }[];
};

export type PhotoResult = {
  photoUrl?: string;
  matched?: string[];
  ocrPreview?: string;
  msg?: string;
};

/**
 * 보스 시간표 한 줄 (v10.8).
 *
 * 한 보스가 여러 요일에 나오면 **요일마다 한 줄**이다. 한 줄에 '월,수,금' 처럼
 * 몰아 넣으면 오늘 것만 골라내는 계산이 불가능해진다.
 */
export type RaidRow = {
  /** 시트 행 번호 — 수정·삭제에 쓴다 */
  row: number;
  /** 1=월 … 7=일. 자바스크립트 getDay()(0=일)와 다르다 */
  day: number;
  /** 'HH:MM' 24시간 */
  time: string;
  boss: string;
  note: string;
};

export type RaidState = {
  rows: RaidRow[];
  /** ['월','화',…] — 시트가 쓰는 표기 그대로 (앱은 화면 언어로 다시 그린다) */
  days: string[];
};

/** 모든 API 응답의 공통 봉투 */
export type Envelope<T> =
  | ({ ok: true } & T)
  | { ok: false; msg: string };
