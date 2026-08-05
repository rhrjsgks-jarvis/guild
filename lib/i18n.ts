'use client';

/**
 * 한국어 / 中文 화면 전환.
 *
 * 여기 담는 것은 **화면에 고정된 문구**뿐입니다 (탭 이름, 버튼, 표 머리글 …).
 * 사람 이름·아이템명·서버명 같은 **데이터는 절대 번역하지 않습니다.**
 * 이름을 기계가 바꿔버리면 다른 사람으로 읽혀 다이아가 엉뚱한 곳으로 갑니다
 * (CLAUDE.md 규칙 7). 혈맹원의 한자 표기는 멤버DB G열에 관리자가
 * 직접 확인해 넣은 값만 쓰고, 앱은 그걸 "한글 (漢字)" 형태로 보여주기만 합니다.
 */

export type Lang = 'ko' | 'zh';

const LANG_KEY = 'gm_lang';

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'ko';
  return window.localStorage.getItem(LANG_KEY) === 'zh' ? 'zh' : 'ko';
}

export function setLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANG_KEY, lang);
}

type Dict = Record<string, [ko: string, zh: string]>;

const DICT: Dict = {
  /* 탭 */
  'tab.balance': ['잔액', '余额'],
  'tab.items': ['아이템', '物品'],
  'tab.board': ['게시판', '公告板'],
  'tab.alliance': ['연합', '联盟'],
  'tab.me': ['내 정보', '我的'],
  'tab.admin': ['관리', '管理'],

  /* 공통 */
  'common.refresh': ['새로고침', '刷新'],
  'common.retry': ['다시 시도', '重试'],
  'common.close': ['닫기', '关闭'],
  'common.cancel': ['취소', '取消'],
  'common.back': ['뒤로', '返回'],
  'common.save': ['저장', '保存'],
  'common.delete': ['삭제', '删除'],
  'common.write': ['글쓰기', '写帖'],
  'common.loading': ['불러오는 중…', '加载中…'],
  'common.empty': ['내용이 없습니다.', '暂无内容。'],
  'common.admin': ['관리자', '管理员'],
  'common.master': ['마스터관리자', '主管理员'],
  'common.season': ['시즌', '赛季'],
  'common.server': ['서버', '服务器'],
  'common.amount': ['금액', '金额'],
  'common.people': ['인원', '人数'],
  'common.item': ['아이템명', '物品名'],
  'common.ratio': ['비중', '比例'],
  'common.total': ['합계', '合计'],
  'common.loadFailed': ['데이터를 불러오지 못했습니다.', '数据加载失败。'],

  /* 잔액 */
  'balance.pending': ['분배전', '待发放'],
  'balance.paid': ['분배완료', '已发放'],
  'balance.count': ['참여횟수', '参与次数'],
  'balance.search': ['이름 검색', '搜索名称'],
  'balance.onlyLeft': ['받을 잔액 남은 사람만', '仅显示有余额者'],
  'balance.payout': ['지급', '发放'],

  /* 아이템 */
  'items.distribute': ['분배', '分配'],
  'items.waiting': ['미분배 아이템', '未分配物品'],
  'items.register': ['아이템 등록', '登记物品'],

  /* 게시판 */
  'board.title': ['게시판', '公告板'],
  'board.notice': ['공지', '公告'],
  'board.post': ['일반', '一般'],
  'board.newTitle': ['제목', '标题'],
  'board.newBody': ['내용', '内容'],
  'board.author': ['작성자', '作者'],
  'board.asNotice': ['공지로 올리기 (관리자)', '发布为公告（管理员）'],
  'board.empty': ['아직 글이 없습니다. 첫 글을 남겨보세요.', '还没有帖子，来写第一篇吧。'],

  /* 연합 */
  'alliance.title': ['연합 정산', '联盟结算'],
  'alliance.byServer': ['서버별 누적', '各服务器累计'],
  'alliance.credited': ['누적 적립', '累计入账'],
  'alliance.add': ['연합 정산 등록', '登记联盟结算'],
  'alliance.photoCount': ['인증샷으로 인원 세기', '用截图统计人数'],
  'alliance.empty': ['등록된 연합 정산이 없습니다.', '暂无联盟结算记录。'],

  /* 관리 */
  'admin.unlock': ['관리자 잠금 해제', '解锁管理员'],
  'admin.lock': ['잠그기', '锁定'],
  'admin.pin': ['PIN', 'PIN'],
  'admin.roster': ['혈맹원 관리', '成员管理'],
  'admin.renameHistory': ['아이디 변경 이력', '改名记录'],
  'admin.weight': ['분배비중', '分配比例'],
  'admin.hanja': ['한자표기', '汉字标注'],
  'admin.appName': ['앱 이름', '应用名称'],
  'admin.changeAdminPin': ['관리자 PIN 변경', '修改管理员 PIN'],
};

export function makeT(lang: Lang) {
  return (key: string): string => {
    const row = DICT[key];
    if (!row) return key;
    return lang === 'zh' ? row[1] : row[0];
  };
}
