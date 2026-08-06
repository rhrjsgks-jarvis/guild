'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * 한국어 / 中文 전환.
 *
 * 여기 담는 것은 **화면에 고정된 문구**입니다 (탭·버튼·라벨·안내문 …).
 * 사람 이름·아이템명·게시글 같은 **사용자 데이터는 절대 번역하지 않습니다.**
 * 이름을 기계가 바꿔버리면 다른 사람으로 읽혀 다이아가 엉뚱한 곳으로 갑니다
 * (CLAUDE.md 규칙 7). 혈맹원의 한자 표기는 멤버DB G열에 관리자가 직접 확인해
 * 넣은 값만 쓰고, 앱은 그걸 "한글 (漢字)" 형태로 보여주기만 합니다.
 *
 * 새 문구를 추가할 때는 DICT 에 [한국어, 중문] 한 줄만 넣으면 됩니다.
 * `npm run verify:gs` 가 두 언어가 모두 채워졌는지 검사합니다.
 */

export type Lang = 'ko' | 'zh';

const LANG_KEY = 'gm_lang';

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'ko';
  return window.localStorage.getItem(LANG_KEY) === 'zh' ? 'zh' : 'ko';
}

export function storeLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANG_KEY, lang);
}

/* ────────────────────────── 사전 ────────────────────────── */

type Entry = [ko: string, zh: string];

const DICT: Record<string, Entry> = {
  /* ── 공통 ── */
  'app.title': ['길드정산', '血盟结算'],
  'tab.balance': ['잔액', '余额'],
  'tab.items': ['아이템', '物品'],
  'tab.board': ['게시판', '公告板'],
  'tab.alliance': ['연합', '联盟'],
  'tab.me': ['내 정보', '我的'],
  'tab.admin': ['관리', '管理'],

  'c.refresh': ['새로고침', '刷新'],
  'c.retry': ['다시 시도', '重试'],
  'c.close': ['닫기', '关闭'],
  'c.cancel': ['취소', '取消'],
  'c.back': ['뒤로', '返回'],
  'c.save': ['저장', '保存'],
  'c.delete': ['삭제', '删除'],
  'c.view': ['보기', '查看'],
  'c.manage': ['관리', '管理'],
  'c.run': ['실행', '执行'],
  'c.write': ['글쓰기', '发帖'],
  'c.loading': ['불러오는 중…', '加载中…'],
  'c.processing': ['처리 중…', '处理中…'],
  'c.saving': ['저장 중…', '保存中…'],
  'c.deleting': ['삭제 중…', '删除中…'],
  'c.running': ['실행 중…', '执行中…'],
  'c.checking': ['확인 중…', '确认中…'],
  'c.admin': ['관리자', '管理员'],
  'c.master': ['마스터관리자', '主管理员'],
  'c.season': ['시즌', '赛季'],
  'c.server': ['서버', '服务器'],
  'c.amount': ['금액', '金额'],
  'c.people': ['인원', '人数'],
  'c.itemName': ['아이템명', '物品名'],
  'c.ratio': ['비중', '比例'],
  'c.total': ['합계', '合计'],
  'c.persons': ['{n}명', '{n}人'],
  'c.times': ['{n}회', '{n}次'],
  'c.cases': ['{n}건', '{n}件'],
  'c.loadFailed': ['데이터를 불러오지 못했습니다.', '数据加载失败。'],
  'c.checkSetup': ['설정 점검하기', '检查设置'],
  'c.unit.diamond': ['다이아', '钻石'],
  'c.pending': ['분배전', '待发放'],
  'c.paid': ['분배완료', '已发放'],
  'c.done': ['완료', '完成'],
  'c.joined': ['참여', '参与'],
  'c.fundName': ['혈맹운영비', '血盟运营费'],

  /* ── 잔액 탭 ── */
  'bal.waitingItems': ['⏳ 미분배 아이템', '⏳ 未分配物品'],
  'bal.owedPeople': ['💰 잔액 남은 인원', '💰 有余额人数'],
  'bal.pendingTotal': ['분배전 합계', '待发放合计'],
  'bal.sect': ['💰 멤버별 잔액 · 분배완료 누적 {v}', '💰 成员余额 · 已发放累计 {v}'],
  'bal.search': ['이름 검색', '搜索名称'],
  'bal.onlyOwed': ['받을 잔액이 남은 사람만 보기', '仅显示还有余额的人'],
  'bal.noMatch': ['조건에 맞는 멤버가 없습니다.', '没有符合条件的成员。'],
  'bal.noMember': ['멤버가 없습니다.', '暂无成员。'],
  'bal.payout': ['지급', '发放'],

  /* ── 아이템 탭 ── */
  'items.sect': ['⏳ 미분배 아이템', '⏳ 未分配物品'],
  'items.sectAdmin': ['⏳ 미분배 아이템 — [분배]를 눌러 판매금액을 입력하세요', '⏳ 未分配物品 — 点击[分配]输入售出金额'],
  'items.empty': ['미분배 아이템이 없습니다.', '没有未分配的物品。'],
  'items.distribute': ['분배', '分配'],
  'items.waiting': ['대기중', '等待中'],
  'items.viewerHint': [
    '아이템 등록·분배는 관리자만 할 수 있습니다. 하단 [관리] 탭에서 PIN을 입력하면 여기에 버튼이 나타납니다.',
    '只有管理员才能登记和分配物品。在下方[管理]标签输入 PIN 后，按钮就会出现在这里。',
  ],
  'items.newSect': ['📝 새 아이템 등록 (레이드 직후)', '📝 登记新物品（副本结束后）'],
  'items.name': ['📦 아이템명', '📦 物品名'],
  'items.namePh': ['예: 기란 세금', '例：奇岩税金'],
  'items.photoLabel': ['📷 인증샷 (사진에서 참여자를 자동으로 찾아 체크합니다)', '📷 截图（自动识别并勾选参与者）'],
  'items.photoPick': ['📎 사진 선택 / 촬영', '📎 选择照片 / 拍摄'],
  'items.photoAlt': ['인증샷 미리보기', '截图预览'],
  'items.ocrShow': ['🔍 인식된 텍스트 보기', '🔍 查看识别文本'],
  'items.ocrHide': ['🔍 인식된 텍스트 숨기기', '🔍 隐藏识别文本'],
  'items.linkLabel': ['🔗 인증샷 링크 (사진을 넣으면 자동으로 채워집니다)', '🔗 截图链接（上传照片后自动填入）'],
  'items.membersLabel': ['👥 참여 멤버 — {n}명 선택됨', '👥 参与成员 — 已选 {n} 人'],
  'items.selectAll': ['전체 선택', '全选'],
  'items.clearAll': ['전체 해제', '全部取消'],
  'items.checkNote': [
    '⚠️ 등록 전에 체크된 참여자가 맞는지 꼭 확인해주세요. 자동 감지는 참고용입니다.',
    '⚠️ 登记前请务必确认勾选的参与者是否正确。自动识别仅供参考。',
  ],
  'items.submit': ['📝 아이템 등록', '📝 登记物品'],
  'items.analyzing': ['분석 중… (드라이브 저장 + 글자 인식)', '分析中…（保存到云端 + 文字识别）'],
  'items.analyzeFailed': ['분석 실패: {v}', '分析失败：{v}'],
  'items.analyzeDone': ['분석 완료', '分析完成'],
  'items.readFailed': ['사진을 읽지 못했습니다.', '无法读取照片。'],
  'items.formatFailed': ['사진 형식을 인식하지 못했습니다.', '无法识别照片格式。'],
  'items.noCanvas': ['이 브라우저에서는 사진 분석을 지원하지 않습니다.', '此浏览器不支持照片分析。'],
  'items.confirmTitle': ['⚠️ 참여자를 다시 확인해주세요', '⚠️ 请再次确认参与者'],
  'items.confirmSub': ['등록하면 {n}명의 참여횟수가 즉시 올라갑니다.', '登记后 {n} 人的参与次数会立即增加。'],
  'items.confirmItem': ['📦 아이템', '📦 物品'],
  'items.confirmJoin': ['👥 참여', '👥 参与'],
  'items.andMore': [' 외 {n}명', ' 等 {n} 人'],
  'items.confirmDo': ['등록하기', '确认登记'],

  /* ── 분배 시트 ── */
  'dist.sub': ['참여 {n}명 · {fund} {pct}% 공제 후 1/N 분배', '参与 {n} 人 · 扣除 {fund} {pct}% 后平均分配'],
  'dist.amount': ['판매금액 ({unit})', '售出金额（{unit}）'],
  'dist.amountPh': ['예: 50000', '例：50000'],
  'dist.sale': ['💎 판매금액', '💎 售出金额'],
  'dist.fund': ['🏦 {fund} ({pct}%)', '🏦 {fund}（{pct}%）'],
  'dist.base': ['👥 기본 1인당 × {n}명', '👥 基础每人 × {n} 人'],
  'dist.remainder': ['➕ 잔여분 → {fund}', '➕ 剩余 → {fund}'],
  'dist.fundTotal': ['🏦 {fund} 최종 적립', '🏦 {fund} 最终入账'],
  'dist.needInt': ['판매금액은 양의 정수여야 합니다.', '售出金额必须是正整数。'],
  'dist.enterAmount': ['금액을 입력하면 분배 결과를 미리 보여드립니다.', '输入金额后会显示分配预览。'],
  'dist.do': ['분배하기', '确认分配'],

  /* ── 지급 시트 ── */
  'pay.title': ['💰 {name} 지급', '💰 发放给 {name}'],
  'pay.sub': ['분배전 잔액 {v}', '待发放余额 {v}'],
  'pay.label': ['지급할 금액 ({unit})', '发放金额（{unit}）'],
  'pay.full': ['전액 {v}', '全额 {v}'],
  'pay.half': ['절반 {v}', '一半 {v}'],
  'pay.give': ['지급', '发放'],
  'pay.left': ['지급 후 남는 분배전', '发放后剩余待发放'],
  'pay.partial': ['부분 지급입니다', '这是部分发放'],
  'pay.whole': ['전액 지급입니다', '这是全额发放'],
  'pay.tooMuch': ['분배전 잔액({v})보다 클 수 없습니다.', '不能超过待发放余额（{v}）。'],
  'pay.needInt': ['지급액은 양의 정수여야 합니다.', '发放金额必须是正整数。'],
  'pay.do': ['지급 처리', '确认发放'],

  /* ── 내 정보 ── */
  'me.sect': ['🙋 내 다이아 조회', '🙋 查询我的钻石'],
  'me.pick': ['이름 선택 (다음부터는 자동으로 불러옵니다)', '选择名称（下次会自动加载）'],
  'me.pickPh': ['이름을 선택하세요', '请选择名称'],
  'me.looking': ['조회 중…', '查询中…'],
  'me.look': ['조회하기', '查询'],
  'me.needName': ['이름을 선택해주세요.', '请选择名称。'],
  'me.failed': ['조회하지 못했습니다.', '查询失败。'],
  'me.pendingBox': ['분배전 (받을 예정)', '待发放（即将领取）'],
  'me.paidBox': ['분배완료 (받은 누적)', '已发放（累计领取）'],
  'me.meta': ['시즌 {s} · 참여 {n}회 · 단위 {unit}', '赛季 {s} · 参与 {n} 次 · 单位 {unit}'],

  /* ── 게시판 ── */
  'board.title': ['게시판', '公告板'],
  'board.notice': ['공지', '公告'],
  'board.newTitle': ['제목', '标题'],
  'board.newBody': ['내용', '内容'],
  'board.author': ['작성자', '作者'],
  'board.asNotice': ['공지로 올리기 (관리자)', '发布为公告（管理员）'],
  'board.empty': ['아직 글이 없습니다. 첫 글을 남겨보세요.', '还没有帖子，来写第一篇吧。'],
  'board.noBody': ['(내용 없음)', '（无内容）'],
  'board.posting': ['등록 중…', '发布中…'],
  'board.needSheet': [
    '구글시트 쪽 코드가 아직 v10.0 이 아니면 [게시판] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤 다시 열어주세요.',
    '如果表格端代码还不是 v10.0，就没有[公告板]功能。请把新代码粘贴到 Apps Script，通过[管理部署]→新版本部署后再打开。',
  ],

  /* ── 연합 ── */
  'ali.title': ['연합 정산', '联盟结算'],
  'ali.byServer': ['서버별 누적', '各服务器累计'],
  'ali.records': ['🧾 등록 내역', '🧾 登记记录'],
  'ali.add': ['연합 정산 등록', '登记联盟结算'],
  'ali.photoCount': ['인증샷으로 인원 세기', '用截图统计人数'],
  'ali.empty': ['등록된 연합 정산이 없습니다.', '暂无联盟结算记录。'],
  'ali.serverN': ['{s} 서버', '{s} 服'],
  'ali.addSub': ['인증샷은 인원수만 셉니다 (아이디 판별 없음)', '截图只统计人数（不识别 ID）'],
  'ali.none': ['(지정 안 함)', '（不指定）'],
  'ali.credited': ['🎯 {s} 서버 × {pct}%', '🎯 {s} 服 × {pct}%'],
  'ali.photoFailed': ['사진을 분석하지 못했습니다.', '照片分析失败。'],
  'ali.needSheet': [
    '구글시트 쪽 코드가 아직 v10.0 이 아니면 [연합] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤 다시 열어주세요.',
    '如果表格端代码还不是 v10.0，就没有[联盟]功能。请把新代码粘贴到 Apps Script，通过[管理部署]→新版本部署后再打开。',
  ],

  /* ── 지난 시즌 ── */
  'season.title': ['🗓️ 지난 시즌', '🗓️ 往期赛季'],
  'season.sub': ['지금은 시즌 {n} 진행 중입니다', '当前是第 {n} 赛季'],
  'season.detailSub': ['{n}명 · 총 {v}', '{n} 人 · 共 {v}'],
  'season.noRecord': ['이 시즌에는 정산 기록이 없습니다.', '本赛季没有结算记录。'],
  'season.more': ['자세히 보기 (아이템·지급 이력)', '查看详情（物品·发放记录）'],
  'season.less': ['간단히 보기', '简要显示'],
  'season.backToList': ['시즌 목록으로', '返回赛季列表'],
  'season.noRows': ['기록 없음', '无记录'],
  'season.emptyGuide': [
    '보관된 시즌 기록이 없습니다.\n\n예전 파일에서 쓰던 시즌 기록이 있다면 [⚙️ 관리] → 관리 도구 → [📚 지난 시즌 기록만 가져오기] 로 옮겨오세요. 멤버·잔액은 건드리지 않습니다.',
    '没有已保存的赛季记录。\n\n如果旧文件里有赛季记录，请到[⚙️ 管理]→管理工具→[📚 仅导入往期赛季记录]搬过来。不会改动成员和余额。',
  ],
  'season.loadFailed': ['시즌 기록을 불러오지 못했습니다.', '赛季记录加载失败。'],

  /* ── 관리 탭 ── */
  'adm.langSect': ['🌏 언어 / 语言', '🌏 语言 / 언어'],
  'adm.langNote': [
    '화면에 고정된 문구만 바뀝니다. 사람 이름·아이템명은 번역하지 않습니다 — 기계가 이름을 바꾸면 다른 사람으로 읽힐 수 있기 때문입니다. 혈맹원 한자 표기는 [혈맹원 관리]에서 직접 넣어주세요.',
    '只切换界面上的固定文字。人名和物品名不翻译 — 机器改动名称可能被认成别人。血盟成员的汉字标注请在[成员管理]中手动填写。',
  ],
  'adm.masterMode': ['👑 마스터관리자 모드', '👑 主管理员模式'],
  'adm.adminMode': ['🔓 관리자 모드', '🔓 管理员模式'],
  'adm.needAuth': ['🔒 관리자 인증', '🔒 管理员认证'],
  'adm.onDesc': [
    '{role} 모드가 켜져 있습니다. [잔액] 탭에서 지급, [아이템] 탭에서 등록·분배를 할 수 있습니다.',
    '{role}模式已开启。可在[余额]标签发放，在[物品]标签登记和分配。',
  ],
  'adm.masterExtra': [' 여기에 더해 앱 이름과 관리자 PIN을 바꿀 수 있습니다.', ' 此外还可以修改应用名称和管理员 PIN。'],
  'adm.keepHint': [
    '이 기기에서 30일간 유지됩니다. 공용 기기라면 쓰고 나서 꼭 잠가주세요.',
    '在此设备上保持 30 天。如果是公用设备，用完请务必锁定。',
  ],
  'adm.lock': ['🔒 관리자 모드 잠그기', '🔒 锁定管理员模式'],
  'adm.pin': ['관리자 PIN', '管理员 PIN'],
  'adm.pinPh': ['PIN 입력', '输入 PIN'],
  'adm.unlock': ['🔓 잠금 해제', '🔓 解锁'],
  'adm.pinHint': [
    'PIN 없이도 잔액·아이템 현황은 자유롭게 볼 수 있습니다. 등록·분배·지급만 관리자 전용입니다.',
    '没有 PIN 也可以自由查看余额和物品。只有登记·分配·发放才需要管理员。',
  ],
  'adm.emailSect': ['📧 기록용 이메일', '📧 记录用邮箱'],
  'adm.emailHint': [
    '누가 등록·분배·지급했는지 시트 [작업기록]에 남기기 위한 값입니다. 이 기기에만 저장되고 다른 사람에게 보이지 않습니다.',
    '用于在表格[操作记录]中留下谁做了登记·分配·发放。只保存在本设备，其他人看不到。',
  ],
  'adm.emailSaved': ['저장했습니다: {v}', '已保存：{v}'],
  'adm.emailCleared': ['이메일을 지웠습니다.', '已清除邮箱。'],
  'adm.installSect': ['📲 앱처럼 쓰기', '📲 像应用一样使用'],
  'adm.installed': ['✅ 홈 화면 앱으로 실행 중입니다.', '✅ 正在以主屏幕应用方式运行。'],
  'adm.installIos': ['iPhone — 사파리 하단 공유(⬆️) → "홈 화면에 추가"', 'iPhone — Safari 底部分享(⬆️) →「添加到主屏幕」'],
  'adm.installAos': ['Android — 크롬 우측 상단 ⋮ → "앱 설치"', 'Android — Chrome 右上角 ⋮ →「安装应用」'],
  'adm.installHint': ['홈 화면에서 열면 주소창 없이 전체화면으로 뜹니다.', '从主屏幕打开时会全屏显示，没有地址栏。'],
  'adm.healthSect': ['🩺 설정 점검', '🩺 设置检查'],
  'adm.healthBtn': ['연결 상태 확인하기', '检查连接状态'],
  'adm.healthHint': [
    '화면이 계속 안 뜬다면 여기서 어떤 환경변수가 비었는지, 구글시트 연결이 되는지 바로 볼 수 있습니다.',
    '如果画面一直打不开，可以在这里看到哪个环境变量是空的、表格是否连上。',
  ],

  /* ── 공유 카드 ── */
  'share.sect': ['📤 길드원에게 공유하기', '📤 分享给血盟成员'],
  'share.qrAlt': ['앱 주소 QR 코드', '应用地址二维码'],
  'share.caption': ['길드 전용 정산 앱', '血盟专用结算应用'],
  'share.share': ['공유', '分享'],
  'share.copy': ['링크 복사', '复制链接'],
  'share.copied': ['🔗 링크를 복사했습니다.', '🔗 已复制链接。'],
  'share.copyFailed': ['복사에 실패했습니다. 주소창의 주소를 직접 복사해주세요.', '复制失败，请手动复制地址栏中的地址。'],
  'share.shareText': ['길드 다이아 정산 현황 보기', '查看血盟钻石结算情况'],
  'share.hint': [
    '이 링크를 받은 사람은 조회만 할 수 있습니다. 등록·분배·지급은 PIN을 아는 관리자만 가능하니 그대로 공유하셔도 됩니다.',
    '收到此链接的人只能查看。登记·分配·发放只有知道 PIN 的管理员才能做，可以放心分享。',
  ],

  /* ── 혈맹원 관리 ── */
  'ros.sect': ['👥 혈맹원 관리', '👥 血盟成员管理'],
  'ros.add': ['➕ 혈맹원 추가', '➕ 添加成员'],
  'ros.addSub': ['새로 가입한 혈맹원을 명단에 넣습니다', '把新加入的成员加进名单'],
  'ros.addHint': [
    '게임에서 아이디를 바꾼 사람은 눌러서 수정하세요. 잔액과 참여횟수는 새 이름으로 그대로 따라갑니다.',
    '游戏里改过 ID 的人，点进去修改即可。余额和参与次数会跟着新名称转移。',
  ],
  'ros.loadFailed': ['명단을 불러오지 못했습니다.', '名单加载失败。'],
  'ros.fundBadge': ['운영비', '运营费'],
  'ros.id': ['아이디', 'ID'],
  'ros.idPh': ['게임 아이디', '游戏 ID'],
  'ros.idHint': [
    '게임에서 보이는 이름과 정확히 같게 입력하세요. 띄어쓰기·괄호·한자까지 그대로여야 인증샷에서 자동으로 찾아냅니다.',
    '请输入与游戏中显示完全一致的名称。空格、括号、汉字都要一样，截图才能自动识别。',
  ],
  'ros.adding': ['추가 중…', '添加中…'],
  'ros.addDo': ['추가하기', '确认添加'],
  'ros.memberTitle': ['👤 혈맹원 관리', '👤 成员管理'],
  'ros.current': ['현재: {v}', '当前：{v}'],
  'ros.carried': ['따라오는 분배전', '跟随转移的待发放'],
  'ros.oldDisplay': ['기존 게임표시명', '原游戏显示名'],
  'ros.rename': ['변경하기', '确认修改'],
  'ros.weight': ['분배비중 (%)', '分配比例（%）'],
  'ros.weightHint': [
    '기본 1인당 금액의 이 비율만 받습니다. 남는 금액은 전액 혈맹운영비로 귀속됩니다. 이미 분배된 아이템에는 영향이 없습니다 (그때 금액이 그대로 기록돼 있습니다).',
    '只领取基础每人金额的这个比例。剩余金额全部归入血盟运营费。对已分配的物品没有影响（当时的金额已原样记录）。',
  ],
  'ros.hanja': ['한자표기 (중국어)', '汉字标注（中文）'],
  'ros.hanjaPh': ['예: 车武植', '例：车武植'],
  'ros.hanjaHint': [
    '중국어권 혈맹원에게 "{name} ({h})" 형태로 함께 보여줍니다. 이름은 시스템이 추측하지 않습니다 — 게임에서 쓰는 표기를 직접 확인해 넣어주세요.',
    '会以「{name}（{h}）」的形式显示给中文成员。系统不会猜测名称 — 请自行确认游戏中使用的写法后填入。',
  ],
  'ros.saveSettings': ['설정 저장', '保存设置'],
  'ros.remove': ['➖ 탈퇴 처리', '➖ 退盟处理'],
  'ros.removeHint': [
    '명단에서만 빼고 기록은 남깁니다. 잔액이나 참여 이력이 있으면 잔액현황에 "(미등록)"으로 보존되고, 이력이 전혀 없을 때만 목록에서 사라집니다.',
    '只从名单移除，记录会保留。如果还有余额或参与记录，会以「(未登记)」保存在余额表中；完全没有记录时才会从列表消失。',
  ],
  'ros.mergeTitle': ['⚠️ 계정을 합칩니다', '⚠️ 将合并账号'],
  'ros.confirmTitle': ['⚠️ 확인이 필요합니다', '⚠️ 需要确认'],
  'ros.merge': ['합치기', '确认合并'],
  'ros.removeDo': ['탈퇴 처리', '确认退盟'],
  'ros.histSect': ['🕘 아이디 변경 이력', '🕘 ID 变更记录'],
  'ros.histOpen': ['이력 보기', '查看记录'],
  'ros.histHint': [
    '누가 언제 어떤 이름에서 어떤 이름으로 바뀌었는지 [작업기록]에서 가져옵니다.',
    '从[操作记录]中读取谁在何时把名称从什么改成了什么。',
  ],
  'ros.histEmpty': ['아직 아이디를 바꾼 기록이 없습니다.', '还没有修改 ID 的记录。'],
  'ros.merged': ['병합', '已合并'],

  /* ── 아이템 정정·삭제 ── */
  'led.sect': ['🗂️ 등록된 모든 아이템 — 정정 · 삭제', '🗂️ 所有已登记物品 — 更正 · 删除'],
  'led.empty': ['등록된 아이템이 없습니다.', '没有已登记的物品。'],
  'led.currentAmount': ['지금 분배된 금액', '当前已分配金额'],
  'led.notDistributed': ['아직 분배되지 않은 아이템입니다. 되돌릴 금액이 없습니다.', '这是尚未分配的物品，没有可撤回的金额。'],
  'led.blocked': [
    '⚠️ 되돌릴 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다.\n\n{v}\n\n먼저 [최근 지급 취소]로 지급을 되돌린 뒤 다시 시도하세요.',
    '⚠️ 无法撤回。以下对象已完成发放✓，待发放余额不足。\n\n{v}\n\n请先用[撤销最近发放]撤回发放后再试。',
  ],
  'led.correct': ['🔄 판매금액 정정', '🔄 更正售出金额'],
  'led.delete': ['🗑️ 아이템 완전 삭제', '🗑️ 彻底删除物品'],
  'led.newAmount': ['새 판매금액 ({unit}) — 비우면 되돌리기만 합니다', '新的售出金额（{unit}）— 留空则仅撤回'],
  'led.currentPh': ['현재 {v}', '当前 {v}'],
  'led.newFund': ['새 {fund}', '新的 {fund}'],
  'led.newBase': ['새 기본 1인당 × {n}명', '新的基础每人 × {n} 人'],
  'led.newRemainder': ['잔여분 → {fund}', '剩余 → {fund}'],
  'led.weightNote': [
    '비중이 100% 미만인 참여자가 있으면 그만큼 덜 받고, 남는 금액은 {fund}로 갑니다. 정확한 금액은 재분배 직후 결과 메시지에 나옵니다.',
    '如果有比例低于 100% 的参与者，会相应少领，剩余部分归入{fund}。准确金额会在重新分配后的结果消息中显示。',
  ],
  'led.revertOnly': ['되돌리기만 하고 ⏳미분배 상태로 돌아갑니다.', '仅撤回并回到⏳未分配状态。'],
  'led.revert': ['되돌리기', '撤回'],
  'led.correctDo': ['정정하기', '确认更正'],
  'led.deleteNote': [
    '"{item}" 기록을 완전히 삭제합니다.\n되돌릴 수 없고, 참여자의 참여횟수도 이 항목만큼 줄어듭니다.\n삭제 이력 자체는 [작업기록]에 영구히 남습니다.',
    '将彻底删除「{item}」的记录。\n无法撤销，参与者的参与次数也会相应减少。\n删除这件事本身会永久记录在[操作记录]中。',
  ],
  'led.deleteAlsoRevert': ['분배된 금액은 먼저 자동으로 되돌립니다.', '已分配的金额会先自动撤回。'],
  'led.deleteDo': ['삭제합니다', '确认删除'],

  /* ── 관리 도구 ── */
  'tool.undoSect': ['↩️ 최근 지급 취소', '↩️ 撤销最近发放'],
  'tool.payAmount': ['지급액', '发放金额'],
  'tool.undoBtn': ['이 지급 되돌리기', '撤回这笔发放'],
  'tool.undoHint': ['분배완료 → 분배전으로 되돌립니다. 취소 이력은 [작업기록]에 남습니다.', '从已发放退回待发放。撤销记录会留在[操作记录]中。'],
  'tool.undoNone': ['되돌릴 지급 기록이 없습니다.', '没有可撤回的发放记录。'],
  'tool.undoTitle': ['↩️ 지급 취소', '↩️ 撤销发放'],
  'tool.undoNote': [
    '{v} 를 분배완료에서 분배전으로 되돌립니다.\n실제로 다이아를 이미 건네주셨다면 되돌리지 마세요.',
    '把 {v} 从已发放退回待发放。\n如果实际上已经把钻石给出去了，请不要撤回。',
  ],
  'tool.sect': ['🧰 관리 도구', '🧰 管理工具'],
  'tool.irreversible': ['되돌릴 수 없음', '不可撤销'],
  'tool.phraseNote': [
    '이 작업은 되돌릴 수 없습니다.\n정말 실행하려면 아래에 "{v}" 을(를) 정확히 입력하세요.',
    '此操作无法撤销。\n确定要执行请在下面准确输入「{v}」。',
  ],
  'tool.phraseAria': ['확인 문구', '确认文字'],

  /* ── 마스터 ── */
  'mst.sect': ['👑 마스터관리자 전용', '👑 主管理员专用'],
  'mst.appName': ['앱 이름', '应用名称'],
  'mst.appNameBtn': ['앱 이름 바꾸기', '修改应用名称'],
  'mst.appNameHint': ['앱 상단에 표시되는 이름입니다. 모든 사람에게 바로 반영됩니다.', '显示在应用顶部的名称，会立即对所有人生效。'],
  'mst.newPin': ['새 관리자 PIN', '新的管理员 PIN'],
  'mst.newPinPh': ['6~32자 (비우면 환경변수 PIN으로 복귀)', '6~32 位（留空则恢复为环境变量 PIN）'],
  'mst.newPinAgain': ['한 번 더 입력', '再输入一次'],
  'mst.pinBtn': ['관리자 PIN 바꾸기', '修改管理员 PIN'],
  'mst.pinMismatch': ['두 번 입력한 PIN이 서로 다릅니다.', '两次输入的 PIN 不一致。'],
  'mst.pinHint': [
    '관리자가 바뀔 때 쓰세요. 바꾸는 즉시 기존 관리자는 다음 로그인부터 새 PIN이 필요합니다 (이미 잠금 해제된 기기는 30일 세션이 끝날 때까지 유지되므로, 급하면 그 사람에게 [관리] 탭에서 잠그도록 알려주세요). 마스터 PIN 자체는 Vercel 환경변수 MASTER_PIN 에서만 바꿉니다.',
    '换管理员时使用。修改后原管理员下次登录起需要新 PIN（已解锁的设备会保持到 30 天会话结束，着急的话请让对方在[管理]标签锁定）。主管理员 PIN 本身只能在 Vercel 环境变量 MASTER_PIN 中修改。',
  ],

  /* ── 결과 메시지 (앱이 직접 만드는 것) ── */
  'r.saved': ['저장했습니다.', '已保存。'],
  'r.deleted': ['삭제했습니다.', '已删除。'],
  'r.deleteFailed': ['삭제하지 못했습니다.', '删除失败。'],
  'r.registered': ['등록되었습니다.', '已登记。'],
  'r.registerFailed': ['등록에 실패했습니다.', '登记失败。'],
  'r.distributed': ['분배했습니다.', '已分配。'],
  'r.distributeFailed': ['분배에 실패했습니다.', '分配失败。'],
  'r.paid': ['지급했습니다.', '已发放。'],
  'r.payFailed': ['지급에 실패했습니다.', '发放失败。'],
  'r.changed': ['변경했습니다.', '已修改。'],
  'r.changeFailed': ['변경하지 못했습니다.', '修改失败。'],
  'r.removed': ['탈퇴 처리했습니다.', '已做退盟处理。'],
  'r.removeFailed': ['처리하지 못했습니다.', '处理失败。'],
  'r.added': ['추가했습니다.', '已添加。'],
  'r.addFailed': ['추가하지 못했습니다.', '添加失败。'],
  'r.done': ['처리했습니다.', '已处理。'],
  'r.failed': ['처리하지 못했습니다.', '处理失败。'],
  'r.undone': ['취소했습니다.', '已撤销。'],
  'r.undoFailed': ['취소하지 못했습니다.', '撤销失败。'],
  'r.completed': ['완료했습니다.', '已完成。'],
  'r.runFailed': ['실행하지 못했습니다.', '执行失败。'],
  'r.posted': ['등록했습니다.', '已发布。'],
  'r.postFailed': ['등록하지 못했습니다.', '发布失败。'],
  'r.loginFailed': ['로그인에 실패했습니다.', '登录失败。'],
  'r.loggedOut': ['로그아웃했습니다.', '已登出。'],
};

/**
 * 시트(.gs)가 내려주는 관리 도구 이름·설명.
 * 도구 id 는 고정이라 여기서 안전하게 갈아끼울 수 있다.
 */
const TOOL_ZH: Record<string, { name: string; desc: string }> = {
  recalcCounts: { name: '🔁 重算参与次数', desc: '重新统计登记记录来校正参与次数。不会改动钻石余额。' },
  tidy: { name: '📐 整理表格', desc: '把表格顺序、行高和名称格式恢复为标准状态。' },
  discord: { name: '🔗 Discord 通知设置', desc: '登记·分配时自动发送 Discord 通知。留空 Webhook 地址即关闭通知。' },
  importSeasons: { name: '📚 仅导入往期赛季记录', desc: '只复制旧文件的[赛季N]工作表。完全不改动成员·余额·物品·操作记录。已存在的赛季会跳过。' },
  seasonServer: { name: '🗺️ 设置本赛季服务器', desc: '新赛季开始时指定本赛季的服务器名称。仅用于显示，不影响结算。' },
  renameFund: { name: '🏦 将血费账户统一为血盟运营费', desc: '把 v9 以下的「唯一分配(血费)」账户改成 v10 的名称。余额和参与次数原样保留。已经改过则不做任何事。' },
  seasonEnd: { name: '🏁 结束赛季', desc: '保存记录后初始化，开始下一个赛季。' },
  importData: { name: '📥 从旧文件导入', desc: '把之前使用的表格数据搬过来。旧文件只读取，不会改动。' },
  install: { name: '🚀 首次安装', desc: '在空白表格中建立工作表结构。已安装的文件请勿执行。' },
  factoryReset: { name: '⚠️ 恢复出厂设置', desc: '包括赛季记录在内全部删除，回到初始状态。只保留操作记录。' },
};

/** 도구 입력칸 라벨 */
const TOOL_INPUT_ZH: Record<string, string> = {
  url: '地址',
  server: '服务器名称',
};

/* ────────────────────────── 컨텍스트 ────────────────────────── */

export type T = (key: string, vars?: Record<string, string | number>) => string;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  /** 재화 단위 — 시트는 '다이아'를 내려주지만 중문 화면에서는 '钻石'으로 보여준다 */
  unit: (raw: string) => string;
  /** 서버가 내려준 도구 이름·설명 */
  tool: (id: string, field: 'name' | 'desc', fallback: string) => string;
  toolInput: (key: string, fallback: string) => string;
};

const LangContext = createContext<Ctx | null>(null);

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  // 서버 렌더링과 첫 페인트를 맞추기 위해 항상 'ko'로 시작하고, 마운트 뒤에 저장값을 반영한다
  const [lang, setLangState] = useState<Lang>('ko');

  useEffect(() => {
    setLangState(getLang());
  }, []);

  const setLang = useCallback((l: Lang) => {
    storeLang(l);
    setLangState(l);
  }, []);

  const value = useMemo<Ctx>(() => {
    const t: T = (key, vars) => {
      const row = DICT[key];
      if (!row) return key; // 사전에 없으면 키를 그대로 — 검사에서 잡힌다
      return interpolate(lang === 'zh' ? row[1] : row[0], vars);
    };
    return {
      lang,
      setLang,
      t,
      unit: (raw) => (lang === 'zh' && raw === '다이아' ? '钻石' : raw),
      tool: (id, field, fallback) => (lang === 'zh' && TOOL_ZH[id] ? TOOL_ZH[id][field] : fallback),
      toolInput: (key, fallback) => (lang === 'zh' && TOOL_INPUT_ZH[key] ? TOOL_INPUT_ZH[key] : fallback),
    };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useT 는 <LangProvider> 안에서만 쓸 수 있습니다.');
  return ctx;
}

/** 검사용 — 사전 전체를 노출한다 (두 언어가 다 채워졌는지 확인) */
export const __DICT = DICT;
