'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * 한국어 / 中文 / English 전환.
 *
 * 여기 담는 것은 **화면에 고정된 문구**입니다 (탭·버튼·라벨·안내문 …).
 * 사람 이름·아이템명·게시글 같은 **사용자 데이터는 절대 번역하지 않습니다.**
 * 이름을 기계가 바꿔버리면 다른 사람으로 읽혀 다이아가 엉뚱한 곳으로 갑니다
 * (CLAUDE.md 규칙 7). 혈맹원의 한자 표기는 멤버DB G열에 관리자가 직접 확인해
 * 넣은 값만 쓰고, 앱은 그걸 "한글 (漢字)" 형태로 보여주기만 합니다.
 *
 * 새 문구를 추가할 때는 DICT 에 [한국어, 중문, 영문] 한 줄만 넣으면 됩니다.
 * `npm run verify:gs` 가 세 언어가 모두 채워졌는지 검사합니다.
 */

export type Lang = 'ko' | 'zh' | 'en';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
];

const LANG_KEY = 'gm_lang';

function normalize(v: string | null | undefined): Lang {
  return v === 'zh' || v === 'en' ? v : 'ko';
}

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'ko';
  return normalize(window.localStorage.getItem(LANG_KEY));
}

/**
 * 서버(Apps Script)가 내려주는 결과 메시지도 같은 언어로 받아야 하므로,
 * 브라우저 저장소뿐 아니라 쿠키에도 남긴다 — Vercel 라우트가 이 쿠키를 읽어
 * 시트 호출에 언어를 실어 보낸다 (라우트마다 따로 넘기면 빠뜨리는 곳이 생긴다).
 */
export function storeLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANG_KEY, lang);
  document.cookie = `${LANG_KEY}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/* ────────────────────────── 사전 ────────────────────────── */

type Entry = [ko: string, zh: string, en: string];

const DICT: Record<string, Entry> = {
  /* ── 공통 ── */
  'app.title': ['길드정산', '血盟结算', 'Guild Ledger'],
  'tab.balance': ['잔액', '余额', 'Balance'],
  'tab.items': ['아이템', '物品', 'Items'],
  'tab.board': ['게시판', '公告板', 'Board'],
  'tab.alliance': ['연합', '联盟', 'Alliance'],
  'tab.me': ['내 정보', '我的', 'Me'],
  'tab.admin': ['관리', '管理', 'Admin'],

  'c.refresh': ['새로고침', '刷新', 'Refresh'],
  'c.syncing': ['갱신 중', '更新中', 'Syncing'],
  'c.justNow': ['방금', '刚刚', 'just now'],
  'c.agoMin': ['{n}분 전', '{n}分钟前', '{n} min ago'],
  'c.agoHour': ['{n}시간 전', '{n}小时前', '{n} h ago'],
  'c.retry': ['다시 시도', '重试', 'Try again'],
  'c.close': ['닫기', '关闭', 'Close'],
  'c.cancel': ['취소', '取消', 'Cancel'],
  'c.back': ['뒤로', '返回', 'Back'],
  'c.save': ['저장', '保存', 'Save'],
  'c.delete': ['삭제', '删除', 'Delete'],
  'c.view': ['보기', '查看', 'View'],
  'c.manage': ['관리', '管理', 'Manage'],
  'c.run': ['실행', '执行', 'Run'],
  'c.write': ['글쓰기', '发帖', 'New post'],
  'c.loading': ['불러오는 중…', '加载中…', 'Loading…'],
  'c.processing': ['처리 중…', '处理中…', 'Working…'],
  'c.saving': ['저장 중…', '保存中…', 'Saving…'],
  'c.deleting': ['삭제 중…', '删除中…', 'Deleting…'],
  'c.running': ['실행 중…', '执行中…', 'Running…'],
  'c.checking': ['확인 중…', '确认中…', 'Checking…'],
  'c.admin': ['관리자', '管理员', 'Admin'],
  'c.master': ['마스터관리자', '主管理员', 'Master admin'],
  'c.season': ['시즌', '赛季', 'Season'],
  'c.server': ['서버', '服务器', 'Server'],
  'c.amount': ['금액', '金额', 'Amount'],
  'c.people': ['인원', '人数', 'People'],
  'c.itemName': ['아이템명', '物品名', 'Item name'],
  'c.ratio': ['비중', '比例', 'Share'],
  'c.total': ['합계', '合计', 'Total'],
  'c.persons': ['{n}명', '{n}人', '{n}'],
  'c.times': ['{n}회', '{n}次', '{n}×'],
  'c.cases': ['{n}건', '{n}件', '{n}'],
  'c.loadFailed': ['데이터를 불러오지 못했습니다.', '数据加载失败。', 'Could not load the data.'],
  'c.checkSetup': ['설정 점검하기', '检查设置', 'Check setup'],
  'c.unit.diamond': ['다이아', '钻石', 'dia'],
  'c.pending': ['분배전', '待发放', 'Unpaid'],
  'c.paid': ['분배완료', '已发放', 'Paid'],
  'c.done': ['완료', '完成', 'Paid'],
  'c.joined': ['참여', '参与', 'Joined'],
  'c.fundName': ['혈맹운영비', '血盟运营费', 'Guild fund'],
  'c.edit': ['수정', '修改', 'Edit'],
  'tab.raid': ['레이드', '副本', 'Raids'],

  /* ── 홈 (v11.2.1) ── */
  'home.todo': ['지금 처리할 일', '现在要处理的事', 'Needs attention'],
  'home.now': ['지금 상황', '当前情况', 'Right now'],
  'home.clear': [
    '지금 처리할 일이 없습니다.',
    '目前没有待处理的事项。',
    'Nothing needs attention right now.',
  ],
  'home.items': ['미분배 아이템', '未分配物品', 'Undistributed items'],
  'home.ally': ['연합 금액 대기', '联盟待填金额', 'Alliance awaiting amount'],
  'home.owed': ['지급할 사람', '待发放人数', 'Awaiting payout'],
  'home.raidToday': ['오늘 보스', '今日首领', 'Bosses today'],
  'home.all': ['모든 화면', '全部页面', 'All screens'],
  'home.raidSub': ['보스 시간표', '首领时间表', 'Boss schedule'],
  'home.raidCount': ['오늘 {n}개', '今日{n}个', '{n} today'],
  'home.balanceSub': ['분배전 {v}', '待发放 {v}', 'Unpaid {v}'],
  'home.itemsSub': ['등록·분배', '登记·分配', 'Register & split'],
  'home.allySub': ['서버별 정산', '各服务器结算', 'By server'],
  'home.meSub': ['내 잔액', '我的余额', 'My balance'],
  'home.boardSub': ['공지·글', '公告·帖子', 'Notices & posts'],
  'home.adminSub': ['PIN·도구', 'PIN·工具', 'PIN & tools'],
  'home.goHome': ['홈으로', '返回主页', 'Home'],
  'home.termSub': ['한·中·EN 이름', '韩·中·英 名称', 'KO·ZH·EN names'],
  'home.lang': ['언어', '语言', 'Language'],
  'home.langSub': ['한·中·EN', '韩·中·英', 'KO·ZH·EN'],

  /* ── 공유 버튼 (v10.8) ── */
  'sh.share': ['공유', '分享', 'Share'],
  'sh.copied': ['📋 복사했습니다. 붙여넣기 하세요.', '📋 已复制，可以粘贴了。', '📋 Copied — paste it anywhere.'],
  'sh.failed': [
    '내보내지 못했습니다. 화면을 길게 눌러 직접 복사해주세요.',
    '导出失败，请长按屏幕手动复制。',
    'Could not export — long-press the screen and copy manually.',
  ],
  'sh.empty': ['공유할 내용이 없습니다.', '没有可分享的内容。', 'Nothing to share.'],

  /* ── 잔액 탭 ── */
  'bal.waitingItems': ['⏳ 미분배 아이템', '⏳ 未分配物品', '⏳ Undistributed'],
  'bal.owedPeople': ['💰 잔액 남은 인원', '💰 有余额人数', '💰 Awaiting payout'],
  'bal.pendingTotal': ['분배전 합계', '待发放合计', 'Unpaid total'],
  'bal.sect': ['💰 멤버별 잔액 · 분배완료 누적 {v}', '💰 成员余额 · 已发放累计 {v}', '💰 Balances · paid to date {v}'],
  'bal.search': ['이름 검색', '搜索名称', 'Search by name'],
  /* ── 📚 용어 사전 (v11.4) ── */
  'adm.termSect': ['📚 용어 사전', '📚 词汇表', '📚 Glossary'],
  'adm.termDesc': [
    '아이템명·보스명을 칠 때 자동완성에 쓰는 표입니다. 한국어 · 中文 · English 를 모아두면 어느 언어로 쳐도 찾아집니다.',
    '用于物品名·首领名自动完成的词汇表。填好韩/中/英后，用任意语言都能搜到。',
    'Used for item and boss name autocomplete. Fill KO · ZH · EN and any language finds it.',
  ],
  'adm.termOpen': ['용어 사전 열기', '打开词汇表', 'Open glossary'],
  'term.title': ['용어', '词汇', 'Glossary'],
  'term.sect': ['리니지W 용어 {n}개', '天堂W 词汇 {n} 条', '{n} Lineage W terms'],
  'term.search': ['한국어 · 中文 · English 로 검색', '用韩/中/英搜索', 'Search in KO · ZH · EN'],
  'term.searchHint': [
    '어느 언어로 쳐도 찾습니다. 오른쪽 [공유]를 누르면 세 언어가 한 줄로 복사됩니다.',
    '任意语言均可搜索。点右侧[分享]可复制三种语言。',
    'Search in any language. [Share] copies all three.',
  ],
  'term.catAll': ['전체', '全部', 'All'],
  'term.empty': [
    '아직 용어가 없습니다. [관리] → 관리 도구 → [📚 용어 목록 채우기] 를 실행해보세요.',
    '还没有词汇。请在[管理]→工具中运行[📚 填充词汇表]。',
    'No terms yet. Run [📚 Fill glossary] in Admin → Tools.',
  ],
  'term.noMatch': ['찾는 말이 없습니다.', '未找到。', 'No match.'],
  'term.needCheck': ['中文·English 미입력', '中文·English 未填', 'ZH·EN not filled in'],
  'term.add': ['용어 추가', '添加词汇', 'Add term'],
  'term.cat': ['분류', '分类', 'Category'],
  'term.ko': ['한국어 (앱에 저장되는 이름)', '韩语（保存到表格的名称）', 'Korean (the stored name)'],
  'term.editSub': [
    '모르는 표기는 비워두세요 — 지어내지 않습니다.',
    '不确定的请留空 — 系统不会编造。',
    'Leave unknown fields blank — nothing is invented.',
  ],
  'term.blankOk': [
    '中文·English 는 비워도 됩니다. 비어 있으면 앱이 한국어 그대로 보여줍니다.',
    '中文·English 可留空，留空时按韩语原样显示。',
    'ZH·EN may stay empty; the Korean name is shown as is.',
  ],
  'term.bulk': ['붙여넣기로 여러 개', '批量粘贴', 'Paste many'],
  'term.bulkSub': [
    '홈페이지 표를 복사해 그대로 붙여넣으세요.',
    '把官网表格复制后直接粘贴即可。',
    'Copy a table from a site and paste it here.',
  ],
  'term.bulkLabel': ['한 줄에 하나씩', '每行一条', 'One per line'],
  /* 자리표시자 — 순서(국문 → 中文 → English)를 보여주는 예시다.
     영문 화면에는 한글 예시를 두지 않는다 (화면 문구 검사가 이것도 잡는다) */
  'term.bulkPh': [
    '용의 심장\t龙之心\tDragon Heart',
    '용의 심장\t龙之心\tDragon Heart',
    'KO name\tZH name\tEN name',
  ],
  'term.bulkHint': [
    '탭·쉼표·슬래시로 나뉜 줄을 모두 받습니다. 한국어만 있어도 됩니다 — 나머지는 나중에 채우면 됩니다.',
    '支持用制表符·逗号·斜杠分隔。只有韩语也可以，其余以后再补。',
    'Tabs, commas or slashes all work. Korean alone is fine — fill the rest later.',
  ],
  'term.bulkCount': ['{n}줄을 넣습니다.', '将添加 {n} 行。', 'Will add {n} rows.'],
  'term.bulkDone': [
    '✅ {n}개를 넣었습니다. (이미 있어 건너뜀 {k}개)',
    '✅ 已添加 {n} 条（跳过 {k} 条）。',
    '✅ Added {n} ({k} skipped).',
  ],
  'term.img': ['아이콘 그림 주소 (선택)', '图标地址（可选）', 'Icon image URL (optional)'],
  'term.imgHint': [
    '구글 드라이브에 올린 그림 주소를 넣으면 목록에 함께 보입니다. 비워도 됩니다.',
    '可填写上传到 Google Drive 的图片地址，留空也可以。',
    'Paste a Google Drive image link, or leave it empty.',
  ],
  'term.delAsk': ['"{item}" 을(를) 용어 목록에서 지울까요?', '要从词汇表删除「{item}」吗？', 'Remove "{item}" from the glossary?'],
  'term.pickHint': [
    '누르면 한국어 이름이 들어갑니다 (기록은 한 가지 이름으로 모읍니다).',
    '点击后填入韩语名称（记录统一用一种名称）。',
    'Tap to insert the Korean name (records keep one name).',
  ],

  'bal.byServer': ['서버로 좁혀 보기', '按服务器筛选', 'Filter by server'],
  'bal.onlyOwed': ['받을 잔액이 남은 사람만 보기', '仅显示还有余额的人', 'Only those still owed'],
  'bal.noMatch': ['조건에 맞는 멤버가 없습니다.', '没有符合条件的成员。', 'No members match.'],
  'bal.noMember': ['멤버가 없습니다.', '暂无成员。', 'No members yet.'],
  'bal.payout': ['지급', '发放', 'Pay out'],

  /* ── 아이템 탭 ── */
  'items.sect': ['⏳ 미분배 아이템', '⏳ 未分配物品', '⏳ Undistributed items'],
  'items.sectAdmin': [
    '⏳ 미분배 아이템 — [분배]를 눌러 판매금액을 입력하세요',
    '⏳ 未分配物品 — 点击[分配]输入售出金额',
    '⏳ Undistributed — tap [Distribute] and enter the sale amount',
  ],
  'items.empty': ['미분배 아이템이 없습니다.', '没有未分配的物品。', 'Nothing waiting to be distributed.'],
  'items.distribute': ['분배', '分配', 'Distribute'],
  'items.waiting': ['대기중', '等待中', 'Waiting'],
  'items.viewerHint': [
    '아이템 등록·분배는 관리자만 할 수 있습니다. 하단 [관리] 탭에서 PIN을 입력하면 여기에 버튼이 나타납니다.',
    '只有管理员才能登记和分配物品。在下方[管理]标签输入 PIN 后，按钮就会出现在这里。',
    'Only admins can register and distribute items. Enter the PIN in the [Admin] tab and the buttons appear here.',
  ],
  'items.newSect': ['📝 새 아이템 등록 (레이드 직후)', '📝 登记新物品（副本结束后）', '📝 Register an item (right after the raid)'],
  'items.name': ['📦 아이템명', '📦 物品名', '📦 Item name'],
  'items.namePh': ['예: 기란 세금', '例：奇岩税金', 'e.g. Giran tax'],
  'items.photoLabel': [
    '📷 인증샷 (사진에서 참여자를 자동으로 찾아 체크합니다)',
    '📷 截图（自动识别并勾选参与者）',
    '📷 Screenshot (participants are detected and ticked for you)',
  ],
  'items.photoMulti': [
    '여러 장을 한꺼번에 고를 수 있습니다. 장마다 찾은 사람이 계속 더해집니다.',
    '可一次选择多张。每张识别到的人会累加勾选。',
    'You can pick several at once — matches from each add up.',
  ],
  'items.edit': ['수정', '修改', 'Edit'],
  'led.editMembers': ['👥 참여 인원·금액 고치기', '👥 修改参与人员·金额', '👥 Edit people & amount'],
  'led.editNote': [
    '이미 나눠준 다이아를 분배 시점 금액 그대로 회수한 뒤, 새 명단·새 금액으로 다시 나눕니다. {fund}도 함께 맞춰집니다.',
    '按分配时的金额收回已发放的钻石，再按新名单和新金额重新分配。{fund} 也会同步调整。',
    'The original amounts are reclaimed exactly as distributed, then split again with the new list and amount. {fund} follows.',
  ],
  'items.editSub': [
    '아직 분배하지 않은 아이템만 고칠 수 있습니다. 참여자를 바꾸면 참여횟수도 다시 계산됩니다.',
    '仅可修改尚未分配的物品。改动参与者后参与次数会重新统计。',
    'Only items that have not been distributed yet. Changing participants recounts attendance.',
  ],
  'items.photoPick': ['📎 사진 선택 / 촬영', '📎 选择照片 / 拍摄', '📎 Choose or take a photo'],
  'items.photoAlt': ['인증샷 미리보기', '截图预览', 'Screenshot preview'],
  'items.ocrShow': ['🔍 인식된 텍스트 보기', '🔍 查看识别文本', '🔍 Show recognised text'],
  'items.ocrHide': ['🔍 인식된 텍스트 숨기기', '🔍 隐藏识别文本', '🔍 Hide recognised text'],
  'items.linkLabel': [
    '🔗 인증샷 링크 (사진을 넣으면 자동으로 채워집니다)',
    '🔗 截图链接（上传照片后自动填入）',
    '🔗 Screenshot link (filled in automatically when you attach a photo)',
  ],
  'items.membersLabel': ['👥 참여 멤버 — {n}명 선택됨', '👥 参与成员 — 已选 {n} 人', '👥 Participants — {n} selected'],
  'items.selectAll': ['전체 선택', '全选', 'Select all'],
  'items.clearAll': ['전체 해제', '全部取消', 'Clear all'],
  /* 서버로 좁히기 (v10.8.6) */
  'items.svAsk': [
    '🗂️ 서버를 선택해주세요. 그 서버의 혈맹원만 보여드립니다. (고르지 않으면 전원)',
    '🗂️ 请选择服务器，只显示该服务器的成员。（不选则显示全部）',
    '🗂️ Pick a server to show only its members. (None picked = everyone)',
  ],
  'items.svMore': [
    '🗂️ 더 추가하실 서버는 없나요? 여러 개를 함께 고를 수 있습니다.',
    '🗂️ 还要加别的服务器吗？可以同时选择多个。',
    '🗂️ Any more servers? You can pick several at once.',
  ],
  'items.svShowing': [
    '{total}명 중 {n}명을 보고 있습니다. 체크한 사람은 다른 서버여도 계속 보입니다.',
    '正在显示 {total} 人中的 {n} 人。已勾选的人即使不同服务器也会一直显示。',
    'Showing {n} of {total}. Anyone you ticked stays visible even from another server.',
  ],
  'items.svUnfold': ['+ 나머지 {n}명도 보기', '+ 显示其余 {n} 人', '+ Show the other {n}'],
  'items.svFold': ['− 나머지 접기', '− 收起其余', '− Collapse the rest'],
  'items.checkNote': [
    '⚠️ 등록 전에 체크된 참여자가 맞는지 꼭 확인해주세요. 자동 감지는 참고용입니다.',
    '⚠️ 登记前请务必确认勾选的参与者是否正确。自动识别仅供参考。',
    '⚠️ Check the ticked participants before registering. Auto-detection is only a suggestion.',
  ],
  'items.submit': ['📝 아이템 등록', '📝 登记物品', '📝 Register item'],
  'items.analyzing': [
    '분석 중… (드라이브 저장 + 글자 인식)',
    '分析中…（保存到云端 + 文字识别）',
    'Analysing… (saving to Drive + reading text)',
  ],
  'items.analyzeFailed': ['분석 실패: {v}', '分析失败：{v}', 'Analysis failed: {v}'],
  'items.analyzeDone': ['분석 완료', '分析完成', 'Analysis complete'],
  'items.readFailed': ['사진을 읽지 못했습니다.', '无法读取照片。', 'Could not read the photo.'],
  'items.formatFailed': ['사진 형식을 인식하지 못했습니다.', '无法识别照片格式。', 'Unsupported photo format.'],
  'items.noCanvas': [
    '이 브라우저에서는 사진 분석을 지원하지 않습니다.',
    '此浏览器不支持照片分析。',
    'This browser cannot analyse photos.',
  ],
  'items.confirmTitle': ['⚠️ 참여자를 다시 확인해주세요', '⚠️ 请再次确认参与者', '⚠️ Please double-check the participants'],
  'items.confirmSub': [
    '등록하면 {n}명의 참여횟수가 즉시 올라갑니다.',
    '登记后 {n} 人的参与次数会立即增加。',
    'Registering raises the join count for {n} members straight away.',
  ],
  'items.confirmItem': ['📦 아이템', '📦 物品', '📦 Item'],
  'items.confirmJoin': ['👥 참여', '👥 参与', '👥 Participants'],
  'items.andMore': [' 외 {n}명', ' 等 {n} 人', ' and {n} more'],
  'items.confirmDo': ['등록하기', '确认登记', 'Register'],

  /* ── 분배 시트 ── */
  'dist.sub': [
    '참여 {n}명 · {fund} {pct}% 공제 후 1/N 분배',
    '参与 {n} 人 · 扣除 {fund} {pct}% 后平均分配',
    '{n} participants · split evenly after {pct}% {fund}',
  ],
  'dist.amount': ['판매금액 ({unit})', '售出金额（{unit}）', 'Sale amount ({unit})'],
  'dist.amountPh': ['예: 50000', '例：50000', 'e.g. 50000'],
  'dist.sale': ['💎 판매금액', '💎 售出金额', '💎 Sale amount'],
  'dist.fund': ['🏦 {fund} ({pct}%)', '🏦 {fund}（{pct}%）', '🏦 {fund} ({pct}%)'],
  'dist.base': ['👥 기본 1인당 × {n}명', '👥 基础每人 × {n} 人', '👥 Base per head × {n}'],
  'dist.remainder': ['➕ 잔여분 → {fund}', '➕ 剩余 → {fund}', '➕ Remainder → {fund}'],
  'dist.fundTotal': ['🏦 {fund} 최종 적립', '🏦 {fund} 最终入账', '🏦 {fund} total credited'],
  'dist.needInt': ['판매금액은 양의 정수여야 합니다.', '售出金额必须是正整数。', 'The sale amount must be a positive whole number.'],
  'dist.enterAmount': [
    '금액을 입력하면 분배 결과를 미리 보여드립니다.',
    '输入金额后会显示分配预览。',
    'Enter an amount to preview the split.',
  ],
  'dist.do': ['분배하기', '确认分配', 'Distribute'],

  /* ── 지급 시트 ── */
  'pay.title': ['💰 {name} 지급', '💰 发放给 {name}', '💰 Pay {name}'],
  'pay.sub': ['분배전 잔액 {v}', '待发放余额 {v}', 'Unpaid balance {v}'],
  'pay.label': ['지급할 금액 ({unit})', '发放金额（{unit}）', 'Amount to pay ({unit})'],
  'pay.full': ['전액 {v}', '全额 {v}', 'All {v}'],
  'pay.half': ['절반 {v}', '一半 {v}', 'Half {v}'],
  'pay.give': ['지급', '发放', 'Paying'],
  'pay.left': ['지급 후 남는 분배전', '发放后剩余待发放', 'Unpaid after this'],
  'pay.partial': ['부분 지급입니다', '这是部分发放', 'This is a partial payout'],
  'pay.whole': ['전액 지급입니다', '这是全额发放', 'This pays the full balance'],
  'pay.tooMuch': ['분배전 잔액({v})보다 클 수 없습니다.', '不能超过待发放余额（{v}）。', 'Cannot exceed the unpaid balance ({v}).'],
  'pay.needInt': ['지급액은 양의 정수여야 합니다.', '发放金额必须是正整数。', 'The payout must be a positive whole number.'],
  'pay.do': ['지급 처리', '确认发放', 'Pay out'],

  /* ── 내 정보 ── */
  'me.sect': ['🙋 내 다이아 조회', '🙋 查询我的钻石', '🙋 My balance'],
  'me.pick': ['이름 선택 (다음부터는 자동으로 불러옵니다)', '选择名称（下次会自动加载）', 'Pick your name (remembered next time)'],
  'me.pickPh': ['이름을 선택하세요', '请选择名称', 'Select a name'],
  'me.looking': ['조회 중…', '查询中…', 'Looking up…'],
  'me.look': ['조회하기', '查询', 'Look up'],
  'me.needName': ['이름을 선택해주세요.', '请选择名称。', 'Please pick a name.'],
  'me.failed': ['조회하지 못했습니다.', '查询失败。', 'Lookup failed.'],
  'me.pendingBox': ['분배전 (받을 예정)', '待发放（即将领取）', 'Unpaid (due to you)'],
  'me.paidBox': ['분배완료 (받은 누적)', '已发放（累计领取）', 'Paid (received so far)'],
  'me.meta': ['시즌 {s} · 참여 {n}회 · 단위 {unit}', '赛季 {s} · 参与 {n} 次 · 单位 {unit}', 'Season {s} · joined {n}× · in {unit}'],

  /* ── 게시판 ── */
  'board.title': ['게시판', '公告板', 'Board'],
  'board.notice': ['공지', '公告', 'Notice'],
  'board.newTitle': ['제목', '标题', 'Title'],
  'board.newBody': ['내용', '内容', 'Body'],
  'board.author': ['작성자', '作者', 'Author'],
  'board.asNotice': ['공지로 올리기 (관리자)', '发布为公告（管理员）', 'Post as a notice (admin)'],
  'board.empty': ['아직 글이 없습니다. 첫 글을 남겨보세요.', '还没有帖子，来写第一篇吧。', 'No posts yet — write the first one.'],
  'board.noBody': ['(내용 없음)', '（无内容）', '(no body)'],
  'board.posting': ['등록 중…', '发布中…', 'Posting…'],
  'board.needSheet': [
    '구글시트 쪽 코드가 아직 v10.0 이 아니면 [게시판] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤 다시 열어주세요.',
    '如果表格端代码还不是 v10.0，就没有[公告板]功能。请把新代码粘贴到 Apps Script，通过[管理部署]→新版本部署后再打开。',
    'The Board needs sheet code v10.0. Paste the new code into Apps Script, deploy a new version under [Manage deployments], then reopen.',
  ],

  /* ── 연합 ── */
  'ali.title': ['연합 정산', '联盟结算', 'Alliance ledger'],
  'ali.byServer': ['서버별 누적', '各服务器累计', 'Totals by server'],
  'ali.filterServer': ['서버로 좁혀 보기', '按服务器筛选', 'Filter by server'],
  /* 레이드일·보스·루팅 (v11.6) — 연합·아이템이 같은 문구를 쓴다 */
  'loot.raidDate': ['레이드 날짜', '突襲日期', 'Raid date'],
  'loot.raidHint': [
    '비워두면 등록한 날로만 남습니다. 잡은 날과 등록한 날이 다르면 채워주세요.',
    '留空則只記錄登錄日期。若打倒日與登錄日不同請填寫。',
    'Leave blank to keep only the registration date. Fill it in if the raid was on another day.',
  ],
  'loot.boss': ['보스', '首領', 'Boss'],
  'loot.lootServer': ['루팅 서버', '拾取伺服器', 'Looting server'],
  'loot.lootChar': ['루팅 캐릭터', '拾取角色', 'Looter'],
  'loot.lootCharHint': [
    '명단에 없는 이름도 넣을 수 있습니다 (연합은 다른 혈맹원이 먹기도 합니다).',
    '也可輸入名單以外的名字（聯盟有時由其他血盟成員拾取）。',
    'Names outside the roster are allowed — in alliances someone else may loot it.',
  ],
  'loot.editTitle': ['레이드·루팅 정보', '突襲與拾取資訊', 'Raid & loot info'],
  'loot.editSub': [
    '아이템명에 함께 적어둔 내용을 칸으로 옮겨 두면 보스별·사람별로 찾을 수 있습니다.',
    '把寫在道具名稱裡的內容分到各欄，就能依首領或人員查詢。',
    'Split what you packed into the item name so you can search by boss or looter.',
  ],
  'loot.origin': ['지금 아이템명 (원문)', '目前道具名稱（原文）', 'Current item name (as is)'],
  'loot.itemHint': [
    '사전에서 고르면 등급 테두리와 티어가 붙습니다. 비워두면 지금 이름 그대로 둡니다.',
    '從字典選擇後會顯示等級外框與階級。留空則保持現有名稱。',
    'Pick from the dictionary to get the grade frame and tier. Leave blank to keep the current name.',
  ],
  'loot.none': ['아직 없음', '尚未填寫', 'Not set'],
  'ali.records': ['🧾 정산 완료', '🧾 已结算', '🧾 Settled'],
  'ali.register': ['연합 등록', '登记联盟', 'Register'],
  'ali.registerSub': [
    '아이템명과 참여 서버별 인원만 먼저 넣습니다. 금액은 팔린 뒤에 넣습니다.',
    '先填物品名和各服务器参与人数。金额等卖出后再填。',
    'Item name and the head count per server first. The amount comes after it sells.',
  ],
  'ali.registerHint': [
    '혈맹 아이템과 같은 순서입니다 — 먼저 등록해두고, 팔린 뒤에 [금액 넣기]로 나누세요.',
    '与血盟物品流程相同 — 先登记，卖出后用[填入金额]分配。',
    'Same flow as guild items — register now, then use [Enter amount] once it sells.',
  ],
  'ali.waitingSect': ['금액 대기 중', '待填金额', 'Awaiting amount'],
  'ali.waitingEmpty': [
    '금액을 기다리는 연합 건이 없습니다.',
    '没有待填金额的联盟记录。',
    'Nothing is waiting for an amount.',
  ],
  'ali.credit': ['금액 넣기', '填入金额', 'Enter amount'],
  'ali.creditSub': [
    '서버 {sv}곳 · 모두 {n}명 — 혈비를 뗀 나머지를 인원수에 맞춰 나눕니다.',
    '{sv} 个服务器 · 共 {n} 人 — 扣除运营费后按人数分配。',
    '{sv} servers · {n} people — the pool is split by head count after the guild fee.',
  ],
  /* v11.0 — 아이템 하나에 여러 서버 · 사진 여러 장 */
  'ali.serversLabel': ['참여 서버 · 인원', '参与服务器 · 人数', 'Servers & head count'],
  'ali.addServer': ['＋ 서버 추가', '＋ 添加服务器', '+ Add server'],
  'ali.dupServer': [
    '같은 서버를 두 번 넣을 수 없습니다.',
    '同一服务器不能填两次。',
    'The same server cannot be added twice.',
  ],
  /* v11.3 — 인증샷은 서버 줄마다 따로 붙는다 */
  'ali.photoAddServer': ['📷 {s}서버 사진 추가', '📷 添加{s}服照片', '📷 Add photo for server {s}'],
  'ali.photoSaved': ['이미 붙어 있는 사진 {n}장', '已附加照片 {n} 张', '{n} already attached'],
  'ali.photoOptional': [
    '인증샷은 없어도 등록됩니다. 사진을 넣으면 인원수를 대신 세어줍니다.',
    '没有截图也能登记。上传照片可自动统计人数。',
    'Screenshots are optional. If you add one, it counts heads for you.',
  ],
  'ali.photoN': ['📷 {n}장', '📷 {n} 张', '📷 {n}'],
  'ali.photoRead': ['📷{i} {n}명', '📷{i} {n}人', '📷{i} {n}'],
  'ali.remove': ['빼기', '移除', 'Remove'],
  'ali.fundShare': ['🏦 {fund} (혈비 + 잔여)', '🏦 {fund}（运营费 + 余数）', '🏦 {fund} (fee + remainder)'],
  'ali.detail': ['참여 서버 보기', '查看参与服务器', 'View servers'],
  'ali.serverLine': ['{s} 서버 · {n}명', '{s} 服 · {n}人', 'Server {s} · {n}'],
  /* 정정 (v11.1 · 마스터관리자) */
  'ali.pendingN': ['⏳ 대기 {n}명 ({k}건)', '⏳ 待结算 {n}人（{k}件）', '⏳ {n} pending ({k})'],
  'ali.addSv': ['참여 서버 추가', '添加参与服务器', 'Add servers'],
  'ali.addSvSub': [
    '이미 들어 있는 서버는 그대로 두고, 빠진 서버만 더합니다.',
    '保留已有的服务器，只添加遗漏的。',
    'Existing servers stay as they are — this only adds missing ones.',
  ],
  'ali.have': ['이미 들어 있는 서버', '已有的服务器', 'Already included'],
  'ali.allServers': [
    '모든 서버가 이미 들어 있습니다. 인원을 고치려면 정정을 쓰세요.',
    '所有服务器都已包含。要修改人数请使用修正。',
    'Every server is already included — use correction to change head counts.',
  ],
  'ali.editWaitSub': [
    '아직 금액이 안 들어간 건입니다. 아이템명과 서버별 인원을 고칩니다.',
    '尚未填入金额。可修改物品名和各服务器人数。',
    'No amount yet — edit the item name and head counts.',
  ],
  'ali.editDoneSub': [
    '이미 정산된 건입니다. 고치면 서버별 몫과 {fund} 가 다시 계산됩니다.',
    '已结算。修改后各服务器份额和 {fund} 会重新计算。',
    'Already settled — the shares and {fund} are recalculated.',
  ],
  'ali.editDoneHint': [
    '{fund}는 바뀐 만큼만 더하거나 뺍니다. 아래 숫자를 확인하고 저장하세요.',
    '{fund} 只按差额增减。请核对下面的数字后保存。',
    'Only the difference is applied to {fund}. Check the numbers below before saving.',
  ],
  /* 인증샷 보기 (v11.1) */
  'shot.sect': ['📷 인증샷', '📷 截图', '📷 Screenshots'],
  'shot.alt': ['인증샷 {n}번', '截图 {n}', 'Screenshot {n}'],
  'shot.failed': [
    '사진을 못 불러왔습니다 (눌러서 원본 열기)',
    '无法加载图片（点击打开原图）',
    'Could not load it (tap for the original)',
  ],
  'shot.origin': ['원본 열기', '打开原图', 'Open original'],
  'shot.none': ['등록된 인증샷이 없습니다.', '没有截图。', 'No screenshots.'],
  'items.detailSub': [
    '등록할 때 체크한 참여자와 붙인 인증샷입니다.',
    '登记时勾选的参与者和附上的截图。',
    'The participants ticked and the screenshots attached at registration.',
  ],
  'ali.add': ['연합 정산 등록', '登记联盟结算', 'Add alliance entry'],
  'ali.photoCount': ['인증샷으로 인원 세기', '用截图统计人数', 'Count people from a screenshot'],
  'ali.empty': ['등록된 연합 정산이 없습니다.', '暂无联盟结算记录。', 'No alliance entries yet.'],
  'ali.serverN': ['{s} 서버', '{s} 服', 'Server {s}'],
  'ali.addSub': [
    '인증샷은 인원수만 셉니다 (아이디 판별 없음)',
    '截图只统计人数（不识别 ID）',
    'Screenshots only count heads — no ID matching',
  ],
  'ali.none': ['(지정 안 함)', '（不指定）', '(none)'],
  'ali.credited': ['🎯 {s} 서버 × {pct}%', '🎯 {s} 服 × {pct}%', '🎯 Server {s} × {pct}%'],
  'ali.photoFailed': ['사진을 분석하지 못했습니다.', '照片分析失败。', 'Could not analyse the photo.'],
  'ali.needSheet': [
    '구글시트 쪽 코드가 아직 v10.0 이 아니면 [연합] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤 다시 열어주세요.',
    '如果表格端代码还不是 v10.0，就没有[联盟]功能。请把新代码粘贴到 Apps Script，通过[管理部署]→新版本部署后再打开。',
    'Alliance needs sheet code v10.0. Paste the new code into Apps Script, deploy a new version under [Manage deployments], then reopen.',
  ],

  /* ── 레이드 (보스 시간표, v10.8) ── */
  'raid.title': ['보스 시간표', '首领时间表', 'Boss timetable'],
  'raid.d1': ['월', '周一', 'Mon'],
  'raid.d2': ['화', '周二', 'Tue'],
  'raid.d3': ['수', '周三', 'Wed'],
  'raid.d4': ['목', '周四', 'Thu'],
  'raid.d5': ['금', '周五', 'Fri'],
  'raid.d6': ['토', '周六', 'Sat'],
  'raid.d7': ['일', '周日', 'Sun'],
  'raid.am': ['오전', '上午', 'AM'],
  'raid.pm': ['오후', '下午', 'PM'],
  'raid.pickDay': ['요일 고르기', '选择星期', 'Pick a day'],
  'raid.todaySect': ['📅 오늘 ({d}) 등장 보스', '📅 今天（{d}）出现的首领', '📅 Today ({d})'],
  'raid.daySect': ['📅 {d} 등장 보스', '📅 {d} 出现的首领', '📅 {d}'],
  'raid.empty': ['이 요일에 등록된 보스가 없습니다.', '这一天没有登记的首领。', 'No bosses listed for this day.'],
  'raid.add': ['보스 추가', '添加首领', 'Add a boss'],
  'raid.addTitle': ['🗡️ 보스 추가', '🗡️ 添加首领', '🗡️ Add a boss'],
  'raid.editTitle': ['🗡️ 보스 수정', '🗡️ 修改首领', '🗡️ Edit boss'],
  'raid.sheetSub': [
    '여러 요일에 나오는 보스는 요일마다 한 번씩 넣어주세요.',
    '在多个星期出现的首领，请按星期分别添加。',
    'A boss that appears on several days needs one entry per day.',
  ],
  'raid.day': ['요일', '星期', 'Day'],
  'raid.time': ['시간', '时间', 'Time'],
  'raid.timeHint': [
    '게임 안 시계 기준으로 넣으세요. 화면에는 오전/오후로 보여줍니다.',
    '请按游戏内时间填写，界面上会显示为上午/下午。',
    'Use the in-game clock. The list shows it as AM/PM.',
  ],
  'raid.boss': ['보스 이름', '首领名称', 'Boss name'],
  'raid.bossPh': ['예: 오만10층', '例：傲慢10层', 'e.g. Tower floor 10'],
  'raid.note': ['비고 (선택)', '备注（可选）', 'Note (optional)'],
  'raid.notePh': ['예: 젠 간격 3시간', '例：刷新间隔3小时', 'e.g. respawns every 3 h'],
  'raid.needBoss': ['보스 이름을 입력해주세요.', '请输入首领名称。', 'Enter the boss name.'],
  'raid.needTime': [
    '시간을 24시간 형식(예 20:20)으로 넣어주세요.',
    '请用24小时制填写时间（例 20:20）。',
    'Enter the time in 24-hour form (e.g. 20:20).',
  ],
  'raid.viewerHint': [
    '시간표는 관리자가 관리합니다. 틀린 부분이 있으면 게시판에 남겨주세요.',
    '时间表由管理员维护。发现有误请在公告板留言。',
    'Admins maintain this timetable. Post on the board if something is wrong.',
  ],
  'raid.needSheet': [
    '구글시트 쪽 코드가 아직 v10.8 이 아니면 [레이드] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤, [⚙️ 관리] → 관리 도구 → [🗡️ 보스 시간표 기본값 채우기] 를 한 번 실행해주세요.',
    '如果表格端代码还不是 v10.8，就没有[副本]功能。请把新代码粘贴到 Apps Script，通过[管理部署]→新版本部署，然后执行一次[⚙️ 管理]→管理工具→[🗡️ 填入首领时间表默认值]。',
    'Raids need sheet code v10.8. Paste the new code into Apps Script, deploy a new version under [Manage deployments], then run [⚙️ Admin] → Tools → [🗡️ Fill the default boss timetable] once.',
  ],

  /* ── 지난 시즌 ── */
  'season.title': ['🗓️ 지난 시즌', '🗓️ 往期赛季', '🗓️ Past seasons'],
  'season.sub': ['지금은 시즌 {n} 진행 중입니다', '当前是第 {n} 赛季', 'Season {n} is running now'],
  'season.detailSub': ['{n}명 · 총 {v}', '{n} 人 · 共 {v}', '{n} members · {v} total'],
  'season.noRecord': ['이 시즌에는 정산 기록이 없습니다.', '本赛季没有结算记录。', 'No settlements in this season.'],
  'season.more': ['자세히 보기 (아이템·지급 이력)', '查看详情（物品·发放记录）', 'Show details (items & payouts)'],
  'season.less': ['간단히 보기', '简要显示', 'Show less'],
  'season.backToList': ['시즌 목록으로', '返回赛季列表', 'Back to seasons'],
  'season.noRows': ['기록 없음', '无记录', 'No rows'],
  'season.emptyGuide': [
    '보관된 시즌 기록이 없습니다.\n\n예전 파일에서 쓰던 시즌 기록이 있다면 [⚙️ 관리] → 관리 도구 → [📚 지난 시즌 기록만 가져오기] 로 옮겨오세요. 멤버·잔액은 건드리지 않습니다.',
    '没有已保存的赛季记录。\n\n如果旧文件里有赛季记录，请到[⚙️ 管理]→管理工具→[📚 仅导入往期赛季记录]搬过来。不会改动成员和余额。',
    'No archived seasons.\n\nIf an older file has season sheets, bring them over with [⚙️ Admin] → Tools → [📚 Import past seasons only]. Members and balances are untouched.',
  ],
  'season.loadFailed': ['시즌 기록을 불러오지 못했습니다.', '赛季记录加载失败。', 'Could not load season records.'],

  /* ── 관리 탭 ── */
  'adm.langSect': ['🌏 언어 / Language', '🌏 语言 / Language', '🌏 Language'],
  'adm.langNote': [
    '화면에 고정된 문구만 바뀝니다. 사람 이름·아이템명은 번역하지 않습니다 — 기계가 이름을 바꾸면 다른 사람으로 읽힐 수 있기 때문입니다. 혈맹원 한자 표기는 [혈맹원 관리]에서 직접 넣어주세요.',
    '只切换界面上的固定文字。人名和物品名不翻译 — 机器改动名称可能被认成别人。血盟成员的汉字标注请在[成员管理]中手动填写。',
    'Only fixed interface text changes. Player and item names are never translated — a machine-altered name could be read as someone else. Add hanja for members under [Members].',
  ],
  'adm.masterMode': ['👑 마스터관리자 모드', '👑 主管理员模式', '👑 Master admin mode'],
  'adm.adminMode': ['🔓 관리자 모드', '🔓 管理员模式', '🔓 Admin mode'],
  'adm.needAuth': ['🔒 관리자 인증', '🔒 管理员认证', '🔒 Admin sign-in'],
  'adm.onDesc': [
    '{role} 모드가 켜져 있습니다. [잔액] 탭에서 지급, [아이템] 탭에서 등록·분배를 할 수 있습니다.',
    '{role}模式已开启。可在[余额]标签发放，在[物品]标签登记和分配。',
    '{role} mode is on. Pay out from [Balance], register and distribute from [Items].',
  ],
  'adm.masterExtra': [
    ' 여기에 더해 앱 이름과 관리자 PIN을 바꿀 수 있습니다.',
    ' 此外还可以修改应用名称和管理员 PIN。',
    ' You can also change the app name and the admin PIN.',
  ],
  'adm.keepHint': [
    '이 기기에서 30일간 유지됩니다. 공용 기기라면 쓰고 나서 꼭 잠가주세요.',
    '在此设备上保持 30 天。如果是公用设备，用完请务必锁定。',
    'Stays unlocked on this device for 30 days. On a shared device, lock it when you are done.',
  ],
  'adm.lock': ['🔒 관리자 모드 잠그기', '🔒 锁定管理员模式', '🔒 Lock admin mode'],
  'adm.pin': ['관리자 PIN', '管理员 PIN', 'Admin PIN'],
  'adm.pinPh': ['PIN 입력', '输入 PIN', 'Enter PIN'],
  'adm.unlock': ['🔓 잠금 해제', '🔓 解锁', '🔓 Unlock'],
  'adm.pinShow': ['PIN 보기', '显示 PIN', 'Show PIN'],
  'adm.pinHide': ['PIN 숨기기', '隐藏 PIN', 'Hide PIN'],
  'adm.pinHint': [
    'PIN 없이도 잔액·아이템 현황은 자유롭게 볼 수 있습니다. 등록·분배·지급만 관리자 전용입니다.',
    '没有 PIN 也可以自由查看余额和物品。只有登记·分配·发放才需要管理员。',
    'Anyone can view balances and items without a PIN. Only registering, distributing and paying out need admin.',
  ],
  'adm.emailSect': ['📧 기록용 이메일', '📧 记录用邮箱', '📧 Email for the audit log'],
  'adm.emailHint': [
    '누가 등록·분배·지급했는지 시트 [작업기록]에 남기기 위한 값입니다. 이 기기에만 저장되고 다른 사람에게 보이지 않습니다.',
    '用于在表格[操作记录]中留下谁做了登记·分配·发放。只保存在本设备，其他人看不到。',
    'Recorded in the sheet’s audit log so you can see who did what. Stored only on this device.',
  ],
  'adm.emailSaved': ['저장했습니다: {v}', '已保存：{v}', 'Saved: {v}'],
  'adm.emailCleared': ['이메일을 지웠습니다.', '已清除邮箱。', 'Email cleared.'],
  'adm.installSect': ['📲 앱처럼 쓰기', '📲 像应用一样使用', '📲 Use it like an app'],
  'adm.installed': ['✅ 홈 화면 앱으로 실행 중입니다.', '✅ 正在以主屏幕应用方式运行。', '✅ Running as a home-screen app.'],
  'adm.installIos': [
    'iPhone — 사파리 하단 공유(⬆️) → "홈 화면에 추가"',
    'iPhone — Safari 底部分享(⬆️) →「添加到主屏幕」',
    'iPhone — Safari share (⬆️) → “Add to Home Screen”',
  ],
  'adm.installAos': [
    'Android — 크롬 우측 상단 ⋮ → "앱 설치"',
    'Android — Chrome 右上角 ⋮ →「安装应用」',
    'Android — Chrome ⋮ menu → “Install app”',
  ],
  'adm.installHint': [
    '홈 화면에서 열면 주소창 없이 전체화면으로 뜹니다.',
    '从主屏幕打开时会全屏显示，没有地址栏。',
    'Opening from the home screen gives you full screen with no address bar.',
  ],
  'adm.healthSect': ['🩺 설정 점검', '🩺 设置检查', '🩺 Setup check'],
  'adm.healthBtn': ['연결 상태 확인하기', '检查连接状态', 'Check the connection'],
  'adm.healthHint': [
    '화면이 계속 안 뜬다면 여기서 어떤 환경변수가 비었는지, 구글시트 연결이 되는지 바로 볼 수 있습니다.',
    '如果画面一直打不开，可以在这里看到哪个环境变量是空的、表格是否连上。',
    'If the app will not load, this shows which env vars are missing and whether the sheet is reachable.',
  ],

  /* ── 공유 카드 ── */
  'share.sect': ['📤 길드원에게 공유하기', '📤 分享给血盟成员', '📤 Share with the guild'],
  'share.qrAlt': ['앱 주소 QR 코드', '应用地址二维码', 'QR code for the app link'],
  'share.caption': ['길드 전용 정산 앱', '血盟专用结算应用', 'Guild settlement app'],
  'share.share': ['공유', '分享', 'Share'],
  'share.copy': ['링크 복사', '复制链接', 'Copy link'],
  'share.copied': ['🔗 링크를 복사했습니다.', '🔗 已复制链接。', '🔗 Link copied.'],
  'share.copyFailed': [
    '복사에 실패했습니다. 주소창의 주소를 직접 복사해주세요.',
    '复制失败，请手动复制地址栏中的地址。',
    'Copy failed — please copy the address from the address bar.',
  ],
  'share.shareText': ['길드 다이아 정산 현황 보기', '查看血盟钻石结算情况', 'See the guild settlement status'],
  'share.hint': [
    '이 링크를 받은 사람은 조회만 할 수 있습니다. 등록·분배·지급은 PIN을 아는 관리자만 가능하니 그대로 공유하셔도 됩니다.',
    '收到此链接的人只能查看。登记·分配·发放只有知道 PIN 的管理员才能做，可以放心分享。',
    'Anyone with this link can only view. Registering, distributing and paying out need the admin PIN, so it is safe to share.',
  ],

  /* ── 서버 고르기 · 일괄 지정 (v10.8.5) ── */
  'sv.more': ['다른 서버 {n}개', '其他 {n} 个服务器', '{n} more servers'],
  'sv.title': ['서버 일괄 지정', '批量设置服务器', 'Assign servers in bulk'],
  'sv.sub': [
    '서버를 고르고 사람을 체크하면 한 번에 지정됩니다.',
    '先选服务器，再勾选成员，一次性设置。',
    'Pick a server, tick the members, apply once.',
  ],
  'sv.pickServer': ['① 어느 서버로 지정할까요?', '① 设置到哪个服务器？', '① Which server?'],
  'sv.pickPeople': ['② 지정할 사람 — {n}명 선택됨', '② 选择成员 — 已选 {n} 人', '② Pick members — {n} selected'],
  'sv.onlyEmpty': [
    '서버가 비어 있는 사람만 보기 ({n}명)',
    '只显示未设置服务器的人（{n} 人）',
    'Only those without a server ({n})',
  ],
  /* 클래스로 좁혀 보기 (v11.6.1) — 클래스 이름 13종은 CLASS_I18N 에 있다 */
  'cls.filter': ['클래스로 좁혀 보기', '按职业筛选', 'Filter by class'],
  'cls.all': ['전체 클래스 ({n})', '全部职业（{n}）', 'All classes ({n})'],
  'cls.none': ['클래스 미지정 ({n})', '未设职业（{n}）', 'No class ({n})'],

  'sv.none': ['미지정', '未设置', 'none'],
  'sv.noneChip': ['서버 미지정', '未设服务器', 'No server'],

  'sv.allDone': [
    '서버가 비어 있는 사람이 없습니다.',
    '没有未设置服务器的成员。',
    'Everyone already has a server.',
  ],
  'sv.apply': ['{n}명을 {s} 서버로 지정', '将 {n} 人设为 {s} 服', 'Assign {n} to server {s}'],
  'sv.applying': ['지정 중… ({done}/{total})', '设置中…（{done}/{total}）', 'Applying… ({done}/{total})'],
  'sv.applied': ['✅ {n}명을 {s} 서버로 지정했습니다.', '✅ 已将 {n} 人设为 {s} 服。', '✅ Assigned {n} to server {s}.'],
  'sv.partial': [
    '⚠️ {n}명은 {s} 서버로 지정했지만 {failN}명은 실패했습니다: {failList}',
    '⚠️ 已将 {n} 人设为 {s} 服，但 {failN} 人失败：{failList}',
    '⚠️ Assigned {n} to server {s}, but {failN} failed: {failList}',
  ],
  'sv.hint': [
    '한 명씩 차례로 저장하므로 인원이 많으면 조금 걸립니다. 중간에 실패한 사람이 있으면 이름을 알려드립니다.',
    '会逐个保存，人多时需要一点时间。若中途有失败，会列出姓名。',
    'Saved one by one, so a large batch takes a moment. Any failures are listed by name.',
  ],
  'sv.needAssign': [
    '⚠️ 서버가 비어 있는 혈맹원이 {n}명입니다. [🗂️ 서버 일괄 지정]으로 채워두면 아이템 등록에서 서버로 걸러낼 수 있습니다.',
    '⚠️ 有 {n} 名成员未设置服务器。用[🗂️ 批量设置服务器]填好后，登记物品时就能按服务器筛选。',
    '⚠️ {n} members have no server yet. Fill them in with [🗂️ Assign servers in bulk] so item registration can filter by server.',
  ],

  /* ── 혈맹원 관리 ── */
  'ros.sect': ['👥 혈맹원 관리', '👥 血盟成员管理', '👥 Members'],
  'ros.add': ['➕ 혈맹원 추가', '➕ 添加成员', '➕ Add member'],
  'ros.addHint': [
    '한 명이든 여럿이든 [혈맹원 추가]에서 넣습니다 (직접 입력·사진 모두). 게임에서 아이디를 바꾼 사람은 아래에서 눌러 수정하세요 — 잔액과 참여횟수는 새 이름으로 그대로 따라갑니다.',
    '一个人或多个人都用[添加成员]（可手输，也可拍照）。游戏里改过 ID 的人，点下方修改即可 — 余额和参与次数会跟着新名称转移。',
    'Add one member or many from [Add member] (type or photo). To rename someone after an in-game change, tap them below — balance and join count follow.',
  ],
  'ros.loadFailed': ['명단을 불러오지 못했습니다.', '名单加载失败。', 'Could not load the roster.'],
  'ros.fundBadge': ['운영비', '运营费', 'Fund'],

  /* ── 이전 아이디에서 기록 가져오기 (v10.9.1) ── */
  'ros.idTaken': [
    '⚠️ "{name}" 은(는) 이미 명단에 있는 아이디입니다. 그 사람의 기록을 이 아이디로 가져오시려면 아래 [⏪ 이전 아이디에서 불러오기]를 쓰세요.',
    '⚠️ "{name}" 已在名单中。若要把该成员的记录转到这个 ID，请使用下方的[⏪ 从旧 ID 转入]。',
    '⚠️ "{name}" is already on the roster. To bring their records into this ID, use [⏪ Pull from an old ID] below.',
  ],
  'ros.pullOpen': ['이전 아이디에서 불러오기', '从旧 ID 转入', 'Pull from an old ID'],
  'ros.pullOpenHint': [
    '게임에서 아이디를 바꾼 사람을 먼저 새 아이디로 넣어두셨다면, 여기서 옛 아이디를 골라 분배전·분배완료·참여횟수를 가져올 수 있습니다.',
    '如果该成员改名后先以新 ID 添加，可在此选择旧 ID，把待分配·已发放·参与次数一并转入。',
    'If you added the new ID first, pick the old one here to bring over the balance, payout total and participation count.',
  ],
  'ros.pullTitle': ['⏪ 이전 아이디에서 불러오기', '⏪ 从旧 ID 转入', '⏪ Pull from an old ID'],
  'ros.pullSub': ['기록을 "{v}" 로 가져옵니다.', '把记录转入 "{v}"。', 'Records will move into "{v}".'],
  'ros.pullNote': [
    '누구의 기록을 가져올지 고르세요. 옆의 금액이 이 아이디로 따라옵니다.',
    '请选择要转入谁的记录。右侧金额会一并转过来。',
    'Pick whose records to bring over. The amount shown will follow.',
  ],
  'ros.pullNone': ['가져올 수 있는 다른 아이디가 없습니다.', '没有可转入的其他 ID。', 'No other ID to pull from.'],
  'ros.pullHint': [
    '고른 아이디는 사라지고 기록만 이 아이디로 넘어옵니다. 실행 전에 금액을 한 번 더 보여드립니다. (지난 시즌 기록은 그때의 이름 그대로 남습니다)',
    '所选 ID 会消失，记录转入本 ID。执行前会再确认一次金额。（历史赛季记录仍保留当时的名字）',
    'The picked ID disappears and its records move here. The amounts are shown once more before applying. (Past-season records keep the old name.)',
  ],
  'ros.id': ['아이디', 'ID', 'ID'],
  'ros.idHint': [
    '게임에서 보이는 이름과 정확히 같게 입력하세요. 띄어쓰기·괄호·한자까지 그대로여야 인증샷에서 자동으로 찾아냅니다.',
    '请输入与游戏中显示完全一致的名称。空格、括号、汉字都要一样，截图才能自动识别。',
    'Type it exactly as the game shows it — spaces, brackets and hanja included — so screenshots match.',
  ],
  'ros.memberTitle': ['👤 혈맹원 관리', '👤 成员管理', '👤 Member'],
  'ros.current': ['현재: {v}', '当前：{v}', 'Currently: {v}'],
  'ros.carried': ['따라오는 분배전', '跟随转移的待发放', 'Unpaid carried over'],
  'ros.oldDisplay': ['기존 게임표시명', '原游戏显示名', 'Previous in-game name'],
  'ros.rename': ['변경하기', '确认修改', 'Rename'],
  'ros.weight': ['분배비중 (%)', '分配比例（%）', 'Share of the split (%)'],
  'ros.weightHint': [
    '기본 1인당 금액의 이 비율만 받습니다. 남는 금액은 전액 혈맹운영비로 귀속됩니다. 이미 분배된 아이템에는 영향이 없습니다 (그때 금액이 그대로 기록돼 있습니다).',
    '只领取基础每人金额的这个比例。剩余金额全部归入血盟运营费。对已分配的物品没有影响（当时的金额已原样记录）。',
    'They receive this share of the base per-head amount; the rest goes entirely to the guild fund. Already-distributed items are unaffected — those amounts are recorded as paid.',
  ],
  'ros.byServer': ['서버로 좁혀 보기', '按服务器筛选', 'Filter by server'],
  /* 티어는 시트에 '3티어' 로 저장되지만 화면에는 언어별로 그린다 —
     아이템 이름과 달리 '티어'는 고유명사가 아니라 일반 명사다 */
  'item.tierN': ['{n}티어', '{n}階', 'Tier {n}'],
  'ros.cls': ['클래스', '职业', 'Class'],
  'ros.clsNone': ['고르지 않음', '未选择', 'Not set'],
  'ros.hanja': ['한자표기 (중문)', '汉字标注（中文）', 'Hanja spelling (Chinese)'],
  'ros.hanjaPh': ['예: 车武植', '例：车武植', 'e.g. 车武植'],
  'ros.hanjaHint': [
    '[잔액]·[아이템]·[내 정보]에 "{v}" 로 함께 나옵니다. 이름은 시스템이 추측하지 않습니다 — 게임에서 쓰는 표기를 직접 확인해 넣어주세요. 아이디에 이미 괄호로 한자가 붙어 있으면 비워두셔도 됩니다.',
    '会在[余额]·[物品]·[我的]中以「{v}」显示。系统不会猜测名称 — 请自行确认游戏中使用的写法后填入。如果 ID 里已用括号写了汉字，这里可以留空。',
    'Appears as “{v}” under [Balance], [Items] and [Me]. The system never guesses a name — check the in-game spelling yourself. Leave it blank if the ID already carries the hanja in brackets.',
  ],
  'ros.nameOkRestFailed': [
    '아이디는 바뀌었지만 나머지 설정은 저장되지 않았습니다. 다시 열어 저장해주세요.',
    'ID 已修改，但其余设置未保存。请重新打开后再保存一次。',
    'The ID was changed but the other settings were not saved. Reopen and save again.',
  ],
  'ros.remove': ['➖ 탈퇴 처리', '➖ 退盟处理', '➖ Remove from roster'],
  'ros.removeHint': [
    '명단에서만 빼고 기록은 남깁니다. 잔액이나 참여 이력이 있으면 잔액현황에 "(미등록)"으로 보존되고, 이력이 전혀 없을 때만 목록에서 사라집니다.',
    '只从名单移除，记录会保留。如果还有余额或参与记录，会以「(未登记)」保存在余额表中；完全没有记录时才会从列表消失。',
    'Removes them from the roster but keeps the records. With any balance or history they stay as “(unlisted)”; only a completely empty record disappears.',
  ],
  'ros.mergeTitle': ['⚠️ 계정을 합칩니다', '⚠️ 将合并账号', '⚠️ These accounts will be merged'],
  'ros.confirmTitle': ['⚠️ 확인이 필요합니다', '⚠️ 需要确认', '⚠️ Please confirm'],
  'ros.merge': ['합치기', '确认合并', 'Merge'],
  'ros.removeDo': ['탈퇴 처리', '确认退盟', 'Remove'],
  'ros.histSect': ['🕘 아이디 변경 이력', '🕘 ID 变更记录', '🕘 Rename history'],
  'ros.histOpen': ['이력 보기', '查看记录', 'Show history'],
  'ros.histHint': [
    '누가 언제 어떤 이름에서 어떤 이름으로 바뀌었는지 [작업기록]에서 가져옵니다.',
    '从[操作记录]中读取谁在何时把名称从什么改成了什么。',
    'Read from the sheet’s audit log: who changed which name, when.',
  ],
  'ros.histEmpty': ['아직 아이디를 바꾼 기록이 없습니다.', '还没有修改 ID 的记录。', 'No renames recorded yet.'],
  'ros.merged': ['병합', '已合并', 'merged'],

  /* ── 아이템 정정·삭제 ── */
  'led.sect': ['🗂️ 등록된 모든 아이템 — 정정 · 삭제', '🗂️ 所有已登记物品 — 更正 · 删除', '🗂️ All items — correct or delete'],
  'led.empty': ['등록된 아이템이 없습니다.', '没有已登记的物品。', 'No items registered.'],
  'led.currentAmount': ['지금 분배된 금액', '当前已分配金额', 'Currently distributed'],
  'led.notDistributed': [
    '아직 분배되지 않은 아이템입니다. 되돌릴 금액이 없습니다.',
    '这是尚未分配的物品，没有可撤回的金额。',
    'This item has not been distributed, so there is nothing to reverse.',
  ],
  'led.blocked': [
    '⚠️ 되돌릴 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다.\n\n{v}\n\n먼저 [최근 지급 취소]로 지급을 되돌린 뒤 다시 시도하세요.',
    '⚠️ 无法撤回。以下对象已完成发放✓，待发放余额不足。\n\n{v}\n\n请先用[撤销最近发放]撤回发放后再试。',
    '⚠️ Cannot reverse. These members were already paid, so their unpaid balance is too low.\n\n{v}\n\nUndo the payout first with [Undo last payout], then try again.',
  ],
  'led.correct': ['🔄 판매금액 정정', '🔄 更正售出金额', '🔄 Correct the sale amount'],
  'led.delete': ['🗑️ 아이템 완전 삭제', '🗑️ 彻底删除物品', '🗑️ Delete the item'],
  'led.newAmount': [
    '새 판매금액 ({unit}) — 비우면 되돌리기만 합니다',
    '新的售出金额（{unit}）— 留空则仅撤回',
    'New sale amount ({unit}) — leave blank to only reverse',
  ],
  'led.currentPh': ['현재 {v}', '当前 {v}', 'now {v}'],
  'led.newFund': ['새 {fund}', '新的 {fund}', 'New {fund}'],
  'led.newBase': ['새 기본 1인당 × {n}명', '新的基础每人 × {n} 人', 'New base per head × {n}'],
  'led.newRemainder': ['잔여분 → {fund}', '剩余 → {fund}', 'Remainder → {fund}'],
  'led.weightNote': [
    '비중이 100% 미만인 참여자가 있으면 그만큼 덜 받고, 남는 금액은 {fund}로 갑니다. 정확한 금액은 재분배 직후 결과 메시지에 나옵니다.',
    '如果有比例低于 100% 的参与者，会相应少领，剩余部分归入{fund}。准确金额会在重新分配后的结果消息中显示。',
    'Members set below 100% receive proportionally less, and the difference goes to {fund}. Exact figures appear in the result message.',
  ],
  'led.revertOnly': [
    '되돌리기만 하고 ⏳미분배 상태로 돌아갑니다.',
    '仅撤回并回到⏳未分配状态。',
    'Reverses only and returns the item to ⏳ undistributed.',
  ],
  'led.revert': ['되돌리기', '撤回', 'Reverse'],
  'led.correctDo': ['정정하기', '确认更正', 'Correct'],
  'led.deleteNote': [
    '"{item}" 기록을 완전히 삭제합니다.\n되돌릴 수 없고, 참여자의 참여횟수도 이 항목만큼 줄어듭니다.\n삭제 이력 자체는 [작업기록]에 영구히 남습니다.',
    '将彻底删除「{item}」的记录。\n无法撤销，参与者的参与次数也会相应减少。\n删除这件事本身会永久记录在[操作记录]中。',
    'Deletes the record for “{item}” for good.\nThis cannot be undone, and participants lose a join count.\nThe deletion itself stays in the audit log.',
  ],
  'led.deleteAlsoRevert': [
    '분배된 금액은 먼저 자동으로 되돌립니다.',
    '已分配的金额会先自动撤回。',
    'Distributed amounts are reversed automatically first.',
  ],
  'led.deleteDo': ['삭제합니다', '确认删除', 'Delete'],

  /* ── 관리 도구 ── */
  'tool.undoSect': ['↩️ 최근 지급 취소', '↩️ 撤销最近发放', '↩️ Undo last payout'],
  'tool.payAmount': ['지급액', '发放金额', 'Amount paid'],
  'tool.undoBtn': ['이 지급 되돌리기', '撤回这笔发放', 'Undo this payout'],
  'tool.undoHint': [
    '분배완료 → 분배전으로 되돌립니다. 취소 이력은 [작업기록]에 남습니다.',
    '从已发放退回待发放。撤销记录会留在[操作记录]中。',
    'Moves it back from paid to unpaid. The undo is recorded in the audit log.',
  ],
  'tool.undoNone': ['되돌릴 지급 기록이 없습니다.', '没有可撤回的发放记录。', 'No payout to undo.'],
  'tool.undoTitle': ['↩️ 지급 취소', '↩️ 撤销发放', '↩️ Undo payout'],
  'tool.undoNote': [
    '{v} 를 분배완료에서 분배전으로 되돌립니다.\n실제로 다이아를 이미 건네주셨다면 되돌리지 마세요.',
    '把 {v} 从已发放退回待发放。\n如果实际上已经把钻石给出去了，请不要撤回。',
    'Moves {v} back from paid to unpaid.\nDo not undo it if you have already handed the diamonds over.',
  ],
  'tool.sect': ['🧰 관리 도구', '🧰 管理工具', '🧰 Admin tools'],
  'tool.irreversible': ['되돌릴 수 없음', '不可撤销', 'irreversible'],
  'tool.phraseNote': [
    '이 작업은 되돌릴 수 없습니다.\n정말 실행하려면 아래에 "{v}" 을(를) 정확히 입력하세요.',
    '此操作无法撤销。\n确定要执行请在下面准确输入「{v}」。',
    'This cannot be undone.\nTo go ahead, type “{v}” below exactly.',
  ],
  'tool.phraseAria': ['확인 문구', '确认文字', 'Confirmation phrase'],

  /* ── 마스터 ── */
  'mst.sect': ['👑 마스터관리자 전용', '👑 主管理员专用', '👑 Master admin only'],
  'mst.appName': ['앱 이름', '应用名称', 'App name'],
  'mst.appNameBtn': ['앱 이름 바꾸기', '修改应用名称', 'Change app name'],
  'mst.appNameHint': [
    '앱 상단에 표시되는 이름입니다. 모든 사람에게 바로 반영됩니다. 이름이 길면 엔터로 줄을 바꿔 두 줄로 만들 수 있습니다 (24자, 2줄까지).',
    '显示在应用顶部的名称，会立即对所有人生效。名称较长时可以按回车换行，最多两行（24 字以内）。',
    'The name shown at the top of the app. Everyone sees it immediately. For long names press Enter to split it into two lines (24 chars, 2 lines max).',
  ],
  'mst.newPin': ['새 관리자 PIN', '新的管理员 PIN', 'New admin PIN'],
  'mst.newPinPh': [
    '6~32자 (비우면 환경변수 PIN으로 복귀)',
    '6~32 位（留空则恢复为环境变量 PIN）',
    '6–32 chars (blank restores the env-var PIN)',
  ],
  'mst.newPinAgain': ['한 번 더 입력', '再输入一次', 'Type it again'],
  'mst.pinBtn': ['관리자 PIN 바꾸기', '修改管理员 PIN', 'Change admin PIN'],
  'mst.pinMismatch': ['두 번 입력한 PIN이 서로 다릅니다.', '两次输入的 PIN 不一致。', 'The two PINs do not match.'],
  'mst.pinHint': [
    '관리자가 바뀔 때 쓰세요. 바꾸는 즉시 기존 관리자는 다음 로그인부터 새 PIN이 필요합니다 (이미 잠금 해제된 기기는 30일 세션이 끝날 때까지 유지되므로, 급하면 그 사람에게 [관리] 탭에서 잠그도록 알려주세요). 마스터 PIN 자체는 Vercel 환경변수 MASTER_PIN 에서만 바꿉니다.',
    '换管理员时使用。修改后原管理员下次登录起需要新 PIN（已解锁的设备会保持到 30 天会话结束，着急的话请让对方在[管理]标签锁定）。主管理员 PIN 本身只能在 Vercel 环境变量 MASTER_PIN 中修改。',
    'Use this when the admin changes. From then on the old admin needs the new PIN at next sign-in (already-unlocked devices keep their 30-day session — ask them to lock it from [Admin] if it is urgent). The master PIN itself changes only via the Vercel env var MASTER_PIN.',
  ],

  /* ── 혈맹원 일괄 추가 (v10.4) ── */
  'bulk.title': ['혈맹원 추가', '添加成员', 'Add members'],
  'bulk.sub': [
    '한 명이든 여럿이든 여기서 넣습니다. 넣기 전에 한 줄씩 확인합니다.',
    '一个人或多个人都在这里添加。写入前会逐行确认。',
    'One member or many — all added here, and every line is checked first.',
  ],
  'bulk.pasteLabel': ['이름 입력 · 명단 붙여넣기', '输入姓名 · 粘贴名单', 'Type a name or paste a roster'],
  'bulk.pastePh': ['한 줄에 한 명씩 (한 명만 넣어도 됩니다)', '每行一个人（也可以只加一个）', 'One name per line (a single name is fine)'],
  'bulk.pasteHint': [
    '한 명만 넣으실 때도 여기에 이름 하나만 적으시면 됩니다. 쉼표·줄바꿈 어느 쪽으로 구분해도 되고, 앞의 번호(1. 2.)와 [혈맹·서버] 표시는 알아서 떼어냅니다.',
    '只加一个人时，写一个名字即可。用逗号或换行分隔都可以；前面的编号（1. 2.）和[血盟·服务器]标记会自动去掉。',
    'For a single member just type one name. Commas or line breaks both work; leading numbers (1. 2.) and [clan/server] tags are stripped.',
  ],
  'bulk.fromPhoto': ['사진에서 읽기', '从照片识别', 'Read from a photo'],
  'bulk.photoHint': [
    '게임 명단 스크린샷을 넣으면 글자를 읽어옵니다.\n· 한자 이름은 글자가 작으면 잘 안 읽힙니다 — 명단 부분만 크게 잘라서 넣어주세요\n· 화면을 확대한 뒤 찍거나, 한 번에 다 넣지 말고 나눠서 두세 번 읽는 편이 정확합니다\n· 그래도 빠지면 [인식된 텍스트 보기]로 확인하고 손으로 고쳐주세요',
    '可以识别游戏名单截图。\n· 汉字名称在字太小时不易识别 — 请把名单部分放大裁切后再上传\n· 先放大屏幕再截图，或分两三次读取会更准确\n· 若仍有遗漏，请用[查看识别文字]确认并手动修正',
    'Reads a roster screenshot.\n· Hanja names need large glyphs — crop to just the name list\n· Zoom in before capturing, or read the list in two or three batches\n· If names are still missing, open [Show recognised text] and fix them by hand',
  ],
  'bulk.analyze': ['확인하기', '开始检查', 'Check'],
  'bulk.serverLabel': ['서버 지정', '指定服务器', 'Assign a server'],
  'bulk.serverHint': [
    '이번에 추가·개명한 사람에게만 반영됩니다. 기존 멤버의 서버는 건드리지 않습니다.',
    '只对本次添加·改名的人生效，不会改动已有成员的服务器。',
    'Applies only to the people added or renamed here — existing members are untouched.',
  ],
  'bulk.stNew': ['신규', '新增', 'New'],
  'bulk.stRename': ['개명 후보', '疑似改名', 'Possible rename'],
  'bulk.stExists': ['이미 있음', '已存在', 'Already listed'],
  'bulk.stDup': ['입력 중복', '重复输入', 'Duplicate'],
  'bulk.stInvalid': ['확인 필요', '需要确认', 'Needs a look'],
  'bulk.opAdd': ['신규', '新增', 'New'],
  'bulk.opRename': ['개명', '改名', 'Rename'],
  'bulk.opSkip': ['건너뜀', '跳过', 'Skip'],
  'bulk.fromLabel': ['바뀌기 전 이름', '原名', 'Previous name'],
  'bulk.fromPick': ['— 누구였는지 고르세요 —', '— 请选择原来是谁 —', '— pick who this was —'],
  'bulk.suggestMark': ['(비슷함)', '（相似）', '(similar)'],
  'bulk.takenMark': ['— {by} 가 선택함', '— 已被 {by} 选择', '— taken by {by}'],
  'bulk.pickRequired': [
    '누구였는지 골라야 반영됩니다.',
    '需要选择原来是谁才能生效。',
    'Pick who this was before it can be applied.',
  ],
  'bulk.useOcr': ['읽은 글자를 입력칸에 넣기', '把识别的文字填入输入框', 'Put the read text in the box'],
  /* ★ "지난 시즌 기록도 넘어간다"고 적어두었었지만 사실이 아니다 (v10.9).
     시즌1·시즌2 시트는 그 시점에 얼어붙은 기록이고 개명은 건드리지 않는다 —
     지난 기록을 나중에 고쳐 쓰면 "기록은 지워지지 않는다"는 약속이 깨진다. */
  'bulk.renameNote': [
    '개명으로 지정하면 그 사람의 분배전·분배완료·참여횟수가 새 이름으로 그대로 넘어갑니다. 새로 추가하면 0부터 시작합니다. (지난 시즌 기록은 그때의 이름 그대로 남습니다)',
    '选择"改名"会把该成员的待分配·已发放·参与次数转到新名字；选择"添加"则从 0 开始。（历史赛季记录仍保留当时的名字）',
    'Renaming carries the balance, payout total and participation count over. Adding starts from zero. (Past-season records keep the name used back then.)',
  ],
  'bulk.cleaned': [
    '읽은 줄: {raw} — [혈맹·서버] 표시를 떼어냈습니다',
    '识别原文：{raw} — 已去掉[血盟·服务器]标记',
    'Read as: {raw} — the [clan/server] tag was removed',
  ],
  'bulk.apply': ['추가 {add} · 개명 {ren} 반영', '添加 {add} · 改名 {ren}', 'Apply {add} add · {ren} rename'],
  'bulk.overCap': [
    '정원을 넘습니다 — 추가 {n}명, 남은 자리 {room}명.',
    '超出上限 — 要添加 {n} 人，仅剩 {room} 个位置。',
    'Over capacity — {n} to add but only {room} slots left.',
  ],

  /* ── 결과 메시지 (앱이 직접 만드는 것) ── */
  'r.saved': ['저장했습니다.', '已保存。', 'Saved.'],
  'r.deleted': ['삭제했습니다.', '已删除。', 'Deleted.'],
  'r.deleteFailed': ['삭제하지 못했습니다.', '删除失败。', 'Could not delete.'],
  'r.registered': ['등록되었습니다.', '已登记。', 'Registered.'],
  'r.registerFailed': ['등록에 실패했습니다.', '登记失败。', 'Could not register.'],
  'r.distributed': ['분배했습니다.', '已分配。', 'Distributed.'],
  'r.distributeFailed': ['분배에 실패했습니다.', '分配失败。', 'Could not distribute.'],
  'r.paid': ['지급했습니다.', '已发放。', 'Paid out.'],
  'r.payFailed': ['지급에 실패했습니다.', '发放失败。', 'Could not pay out.'],
  'r.changed': ['변경했습니다.', '已修改。', 'Changed.'],
  'r.changeFailed': ['변경하지 못했습니다.', '修改失败。', 'Could not change.'],
  'r.removed': ['탈퇴 처리했습니다.', '已做退盟处理。', 'Removed from the roster.'],
  'r.removeFailed': ['처리하지 못했습니다.', '处理失败。', 'Could not complete.'],
  'r.added': ['추가했습니다.', '已添加。', 'Added.'],
  'r.addFailed': ['추가하지 못했습니다.', '添加失败。', 'Could not add.'],
  'r.done': ['처리했습니다.', '已处理。', 'Done.'],
  'r.failed': ['처리하지 못했습니다.', '处理失败。', 'Could not complete.'],
  'r.undone': ['취소했습니다.', '已撤销。', 'Undone.'],
  'r.undoFailed': ['취소하지 못했습니다.', '撤销失败。', 'Could not undo.'],
  'r.completed': ['완료했습니다.', '已完成。', 'Completed.'],
  'r.runFailed': ['실행하지 못했습니다.', '执行失败。', 'Could not run.'],
  'r.posted': ['등록했습니다.', '已发布。', 'Posted.'],
  'r.postFailed': ['등록하지 못했습니다.', '发布失败。', 'Could not post.'],
  'r.loginFailed': ['로그인에 실패했습니다.', '登录失败。', 'Sign-in failed.'],
  'r.loggedOut': ['로그아웃했습니다.', '已登出。', 'Signed out.'],

  /* ── 서버(Apps Script) 결과 메시지 ──
   *
   * 시트는 문장을 세 벌로 만들지 않는다. "무슨 일이 있었는지"를 code + vars 로만
   * 내려주고(`_rc`), 문장은 여기서 화면 언어로 조립한다. 사람 이름·아이템명은
   * vars 로 그대로 흘러오며 절대 번역하지 않는다 (CLAUDE.md 규칙 7).
   * 사전에 없는 code 는 시트가 함께 보낸 한국어 msg 로 자동 폴백된다 —
   * 드문 오류를 반쪽만 번역해 문장을 깨뜨리는 것보다 낫다.
   */
  's.reg.ok': [
    '✅ "{item}" 등록 완료 ({n}명)',
    '✅ 已登记「{item}」（{n}人）',
    '✅ Registered "{item}" ({n} members)',
  ],
  's.dist.ok': [
    '✅ "{item}" {amount}다이아 분배 완료 — {fund} {fundTotal} / {n}명 기본 {per}',
    '✅ 已分配「{item}」{amount}钻石 — {fund} {fundTotal} / {n}人 每人 {per}',
    '✅ Distributed "{item}" {amount} dia — {fund} {fundTotal} / {n} members, base {per} each',
  ],
  's.pay.ok': [
    '✅ "{name}" {amount}다이아 지급 완료',
    '✅ 已向「{name}」发放 {amount}钻石',
    '✅ Paid "{name}" {amount} dia',
  ],
  's.ren.ok': [
    '✅ "{from}" → "{to}" 변경 완료',
    '✅ 已将「{from}」改为「{to}」',
    '✅ Renamed "{from}" → "{to}"',
  ],
  's.ren.needMerge': [
    '"{to}" 은(는) 이미 명단에 있는 이름입니다.\n\n그대로 진행하면 두 계정이 하나로 합쳐집니다.\n· {from} 분배전 {fromPending}다이아\n· {to} 분배전 {toPending}다이아\n\n동일 인물이 맞을 때만 진행하세요.',
    '「{to}」已存在于名单中。\n\n继续操作会把两个账号合并为一个。\n· {from} 待分配 {fromPending}钻石\n· {to} 待分配 {toPending}钻石\n\n确认是同一个人时再继续。',
    '"{to}" is already on the roster.\n\nProceeding merges the two accounts into one.\n· {from} unpaid {fromPending} dia\n· {to} unpaid {toPending} dia\n\nContinue only if they are the same person.',
  ],
  's.add.ok': [
    '✅ "{name}" 을(를) 명단에 추가했습니다.',
    '✅ 已将「{name}」加入名单。',
    '✅ Added "{name}" to the roster.',
  ],
  's.rm.ok': [
    '✅ "{name}" 탈퇴 처리 완료',
    '✅ 已完成「{name}」的退盟处理。',
    '✅ Removed "{name}" from the roster.',
  ],
  's.rm.needConfirm': [
    '"{name}" 을(를) 명단에서 뺍니다.\n\n⚠️ 아직 받지 않은 분배전 잔액이 {pending}다이아 남아 있습니다.\n지급하지 않고 빼면 이 금액은 "(미등록)" 상태로 남습니다.\n\n그래도 진행할까요?',
    '将把「{name}」从名单中移除。\n\n⚠️ 仍有尚未领取的待分配余额 {pending}钻石。\n未发放就移除的话，这笔金额会以"(未登记)"状态保留。\n\n仍要继续吗？',
    'This removes "{name}" from the roster.\n\n⚠️ {pending} dia is still unpaid.\nIf you remove them without paying out, that amount stays as "(unregistered)".\n\nProceed anyway?',
  ],
  's.cor.ok': [
    '✅ "{item}" 정정 완료 — {from} → {to}다이아\n{n}명 기본 {per} · 운영비 {fundTotal}',
    '✅ 已更正「{item}」— {from} → {to}钻石\n{n}人 每人 {per} · 运营金 {fundTotal}',
    '✅ Corrected "{item}" — {from} → {to} dia\n{n} members, base {per} each · fund {fundTotal}',
  ],
  's.cor.revert': [
    '✅ "{item}" 되돌리기 완료 — 분배대기중 상태로 돌아갔습니다.',
    '✅ 已撤销「{item}」的分配 — 回到待分配状态。',
    '✅ Reverted "{item}" — back to the pending state.',
  ],
  's.cor.revertBadAmount': [
    '✅ 되돌리기는 완료했지만 새 금액이 올바르지 않아 재분배는 하지 않았습니다.',
    '✅ 已撤销分配，但新金额不正确，因此没有重新分配。',
    '✅ Reverted, but the new amount was invalid so nothing was redistributed.',
  ],
  's.cor.revertNoRedist': [
    '✅ 되돌리기는 완료했으나 재분배에 실패했습니다 ({reason}). [아이템] 탭에서 다시 분배해주세요.',
    '✅ 已撤销分配，但重新分配失败（{reason}）。请在[物品]标签重新分配。',
    '✅ Reverted, but redistribution failed ({reason}). Distribute again from the [Items] tab.',
  ],
  's.cor.insufficient': [
    '정정할 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다:\n\n{list}',
    '无法更正。以下成员已发放✓，待分配余额不足：\n\n{list}',
    'Cannot correct — these members were already paid out and lack the unpaid balance:\n\n{list}',
  ],
  's.cor.partial': [
    '되돌리기가 일부만 반영되어 중단했습니다.\n\n반영됨({okN}): {okList}\n실패({failN}): {failList}\n\n상태는 그대로 두었습니다.',
    '撤销只完成了一部分，已中止。\n\n已完成（{okN}）：{okList}\n失败（{failN}）：{failList}\n\n状态保持不变。',
    'The reversal only partly applied, so it was stopped.\n\nApplied ({okN}): {okList}\nFailed ({failN}): {failList}\n\nThe status was left unchanged.',
  ],
  's.del.ok': [
    '✅ "{item}" 삭제 완료 — 참여횟수가 자동으로 재계산되었습니다.',
    '✅ 已删除「{item}」— 参与次数已自动重新计算。',
    '✅ Deleted "{item}" — participation counts were recalculated.',
  ],
  's.del.insufficient': [
    '삭제할 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다:\n\n{list}',
    '无法删除。以下成员已发放✓，待分配余额不足：\n\n{list}',
    'Cannot delete — these members were already paid out and lack the unpaid balance:\n\n{list}',
  ],
  's.del.partial': [
    '금액 되돌리기가 일부만 반영되어 삭제를 중단했습니다.\n\n반영됨({okN}): {okList}\n실패({failN}): {failList}\n\n행은 삭제하지 않았습니다.',
    '金额撤销只完成了一部分，已中止删除。\n\n已完成（{okN}）：{okList}\n失败（{failN}）：{failList}\n\n该行未被删除。',
    'The amount reversal only partly applied, so the delete was stopped.\n\nApplied ({okN}): {okList}\nFailed ({failN}): {failList}\n\nThe row was not deleted.',
  ],
  's.undo.ok': [
    '✅ "{name}" {amount}다이아가 분배전으로 복구되었습니다.',
    '✅ 「{name}」的 {amount}钻石已恢复为待分配。',
    '✅ Restored {amount} dia to "{name}" as unpaid.',
  ],
  's.post.ok': ['✅ 글을 등록했습니다.', '✅ 已发布。', '✅ Posted.'],
  's.post.noticeOk': ['✅ 공지를 등록했습니다.', '✅ 已发布公告。', '✅ Notice posted.'],
  's.post.delOk': ['✅ 삭제했습니다.', '✅ 已删除。', '✅ Deleted.'],
  /* v11.4 — 용어 사전 (국문 · 中文 · English) */
  's.e.termKo': [
    '한국어 표기를 넣어주세요.',
    '请填写韩语名称。',
    'Enter the Korean name.',
  ],
  's.e.termDup': [
    '"{item}" 은(는) 이미 용어 목록에 있습니다.',
    '「{item}」已在词汇表中。',
    '"{item}" is already in the glossary.',
  ],
  's.e.termEmpty': ['넣을 용어가 없습니다.', '没有可添加的词汇。', 'Nothing to add.'],
  's.term.bulkOk': [
    '✅ 용어 {n}개를 넣었습니다. (이미 있어 건너뜀 {k}개)',
    '✅ 已添加 {n} 条词汇（跳过已存在 {k} 条）。',
    '✅ Added {n} terms ({k} already existed).',
  ],
  's.term.saveOk': ['✅ "{item}" 을(를) 저장했습니다.', '✅ 已保存「{item}」。', '✅ Saved "{item}".'],
  's.term.delOk': ['✅ "{item}" 을(를) 지웠습니다.', '✅ 已删除「{item}」。', '✅ Deleted "{item}".'],

  /* v11.3 — 정산된 연합 건은 마스터만 고친다 (관리자는 미정산 건까지) */
  's.e.allyMasterOnly': [
    '"{item}" 은(는) 이미 정산된 건이라 마스터관리자만 고칠 수 있습니다.',
    '「{item}」已结算，只有主管理员可以修改。',
    '"{item}" is already settled — only the master admin can edit it.',
  ],
  's.e.allyDone': [
    '"{item}" 은(는) 이미 정산된 건입니다. 새로고침해주세요.',
    '「{item}」已结算，请刷新。',
    '"{item}" is already settled. Refresh.',
  ],
  /* ── 연합 v11.0 — 여러 서버 · 서버별 인원 · 사진 여러 장 ── */
  's.ally.regMulti': [
    '✅ "{item}" 등록 완료 — 서버 {sv}곳 · {n}명 (금액은 팔린 뒤에)',
    '✅ 已登记 "{item}" — {sv} 个服务器 · {n} 人（金额待售出后填）',
    '✅ Registered "{item}" — {sv} servers · {n} people (amount comes later)',
  ],
  's.ally.creditMulti': [
    '✅ "{item}" {amount} 정산 완료 — {fund} {fundTotal} · {where}',
    '✅ "{item}" {amount} 结算完成 — {fund} {fundTotal} · {where}',
    '✅ Settled "{item}" {amount} — {fund} {fundTotal} · {where}',
  ],
  's.ally.editOk': [
    '✅ "{item}" 정정 완료 — 서버 {sv}곳 · {n}명',
    '✅ 已修正 "{item}" — {sv} 个服务器 · {n} 人',
    '✅ Corrected "{item}" — {sv} servers · {n} people',
  ],
  's.ally.editAsk': [
    '"{item}" 을(를) 정정하면 {fund} 가 {from} → {to} 로 바뀝니다. 확인 후 다시 실행해주세요.',
    '修正「{item}」后，{fund} 将从 {from} 变为 {to}。确认后请再次执行。',
    'Correcting "{item}" changes {fund} from {from} to {to}. Confirm and run it again.',
  ],
  's.ally.addSv': [
    '✅ "{item}" 에 서버 {sv}곳 · {n}명을 추가했습니다.',
    '✅ 已为「{item}」添加 {sv} 个服务器 · {n} 人。',
    '✅ Added {sv} servers · {n} people to "{item}".',
  ],
  's.ally.delMulti': [
    '✅ 삭제했습니다 — {item} (적립 {credited} 회수 · {fund} 회수)',
    '✅ 已删除 — {item}（收回累计 {credited} · 运营费 {fund}）',
    '✅ Deleted — {item} (reclaimed {credited} · fund {fund})',
  ],
  's.photo.count': [
    '📷 사진에서 {n}명으로 읽었습니다. 실제 인원과 다르면 숫자를 직접 고쳐주세요.',
    '📷 从照片中识别到 {n} 人。与实际人数不同请手动修改。',
    '📷 Read {n} people from the photo. Fix the number by hand if it is wrong.',
  ],
  's.photo.noCount': [
    '📷 사진은 저장했지만 인원수를 읽지 못했습니다. 직접 입력해주세요.',
    '📷 照片已保存，但未能识别人数。请手动输入。',
    '📷 The photo was saved but the head count could not be read. Enter it manually.',
  ],
  's.mem.ok': ['✅ {name} 정보를 저장했습니다.', '✅ 已保存 {name} 的设置。', '✅ Saved settings for {name}.'],
  's.mem.noChange': ['바뀐 내용이 없습니다.', '没有需要修改的内容。', 'Nothing changed.'],
  's.app.nameOk': [
    '✅ 앱 이름을 "{name}" 으로 바꿨습니다.',
    '✅ 已将应用名称改为「{name}」。',
    '✅ App name changed to "{name}".',
  ],
  's.app.pinOk': [
    '✅ 관리자 PIN 을 바꿨습니다. 기존 관리자 기기는 다음 로그인부터 새 PIN 이 필요합니다.',
    '✅ 已修改管理员 PIN。原管理员的设备从下次登录起需要新 PIN。',
    '✅ Admin PIN changed. Existing admin devices need the new PIN at next sign-in.',
  ],
  's.app.pinCleared': [
    '✅ 시트에 저장된 PIN 을 지웠습니다 — 환경변수 PIN 으로 돌아갑니다.',
    '✅ 已清除表格中保存的 PIN — 恢复为环境变量 PIN。',
    '✅ Cleared the PIN stored in the sheet — back to the env-var PIN.',
  ],
  's.app.seasonServerOk': [
    '✅ 이번 시즌 서버를 "{server}" 로 설정했습니다.',
    '✅ 已将本赛季服务器设为「{server}」。',
    '✅ This season’s server is now "{server}".',
  ],
  's.app.seasonServerCleared': [
    '✅ 시즌 서버명을 비웠습니다.',
    '✅ 已清空赛季服务器名。',
    '✅ Cleared the season server name.',
  ],

  /* 서버가 돌려주는 오류 */
  's.e.badRequest': ['요청 형식이 올바르지 않습니다.', '请求格式不正确。', 'The request format is invalid.'],
  's.e.noToken': [
    'API 토큰이 아직 발급되지 않았습니다. 스프레드시트 메뉴에서 [🔑 웹 API 토큰]을 한 번 실행해주세요.',
    'API 令牌尚未发放。请在表格菜单中执行一次[🔑 网页 API 令牌]。',
    'The API token has not been issued yet. Run [🔑 Web API token] once from the spreadsheet menu.',
  ],
  's.e.auth': ['인증에 실패했습니다.', '认证失败。', 'Authentication failed.'],
  's.e.busy': [
    '다른 작업이 처리 중입니다. 잠시 후 다시 시도해주세요.',
    '有其他操作正在处理中，请稍后再试。',
    'Another operation is in progress. Try again shortly.',
  ],
  's.e.server': ['서버 오류가 발생했습니다.', '发生服务器错误。', 'A server error occurred.'],
  's.e.needConfirm': ['확인이 필요합니다.', '需要确认。', 'Confirmation is required.'],
  's.e.nameEmpty': ['아이디를 입력해주세요.', '请输入 ID。', 'Enter an ID.'],
  's.e.nameLong': ['아이디가 너무 깁니다 (30자 이내).', 'ID 太长（30 字以内）。', 'That ID is too long (30 characters max).'],
  's.e.nameSame': ['기존 이름과 같습니다.', '与原来的名称相同。', 'That is the same as the current name.'],
  's.e.fundLocked': [
    '혈비 계정({fund})은 앱에서 바꿀 수 없습니다. PC 시트에서 처리해주세요.',
    '血盟资金账户（{fund}）无法在应用中修改，请在电脑表格中处理。',
    'The guild fund account ({fund}) cannot be changed from the app. Use the spreadsheet.',
  ],
  's.e.noMember': [
    '"{name}" 을(를) 찾지 못했습니다. 새로고침 후 다시 시도해주세요.',
    '未找到「{name}」。请刷新后重试。',
    'Could not find "{name}". Refresh and try again.',
  ],
  's.e.dupMember': ['"{name}" 은(는) 이미 명단에 있습니다.', '「{name}」已在名单中。', '"{name}" is already on the roster.'],
  's.e.maxMembers': [
    '멤버가 최대 인원({max}명)에 도달했습니다.',
    '成员已达上限（{max}人）。',
    'The roster is full ({max} members).',
  ],
  's.e.noSheet': ['{sheet} 시트를 찾을 수 없습니다.', '找不到「{sheet}」工作表。', 'Could not find the "{sheet}" sheet.'],
  's.e.noItem': [
    '아이템을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.',
    '找不到该物品。请刷新后重试。',
    'Item not found. Refresh and try again.',
  ],
  's.e.notDone': [
    '분배완료 상태인 아이템만 정정할 수 있습니다.',
    '只有已分配的物品才能更正。',
    'Only distributed items can be corrected.',
  ],
  's.e.noNames': ['참여자 명단을 읽을 수 없습니다.', '无法读取参与者名单。', 'The participant list could not be read.'],
  's.e.noParticipants': ['참여 멤버를 선택해주세요.', '请选择参与成员。', 'Select the participating members.'],
  's.e.noPayout': ['취소할 지급 기록이 없습니다.', '没有可撤销的发放记录。', 'There is no payout to undo.'],
  's.e.noPost': ['삭제할 글을 찾을 수 없습니다.', '找不到要删除的帖子。', 'Could not find that post.'],
  's.e.postGone': ['이미 삭제된 글입니다.', '该帖子已被删除。', 'That post was already deleted.'],
  's.e.boardEmpty': ['게시판이 비어 있습니다.', '公告板是空的。', 'The board is empty.'],
  's.e.noRecord': ['기록을 찾을 수 없습니다.', '找不到该记录。', 'Could not find that record.'],
  's.e.titleEmpty': ['제목을 입력해주세요.', '请输入标题。', 'Enter a title.'],
  's.e.titleLong': ['제목이 너무 깁니다 ({max}자 이내).', '标题太长（{max} 字以内）。', 'The title is too long ({max} characters max).'],
  's.e.bodyLong': ['내용이 너무 깁니다 ({max}자 이내).', '内容太长（{max} 字以内）。', 'The body is too long ({max} characters max).'],
  's.e.badServer': ['서버를 01~12 중에서 선택해주세요.', '请从 01~12 中选择服务器。', 'Pick a server from 01–12.'],
  's.e.badClass': ['클래스는 목록에서 선택해주세요.', '请从列表中选择职业。', 'Pick a class from the list.'],
  's.meta.saveOk': ['✅ 저장했습니다.', '✅ 已保存。', '✅ Saved.'],
  's.e.dupServer': [
    '{s}서버가 두 번 들어갔습니다. 한 줄로 합쳐주세요.',
    '{s} 服重复了，请合并成一行。',
    'Server {s} appears twice — merge it into one line.',
  ],
  's.e.noParts': [
    '참여자를 한 명 이상 골라주세요.',
    '请至少选择一名参与者。',
    'Pick at least one participant.',
  ],
  's.item.editAsk': [
    '"{item}" 정정 — {from} → {to} · 참여 {fromN}명 → {toN}명. 확인 후 다시 실행해주세요.',
    '修正「{item}」— {from} → {to} · 参与 {fromN}人 → {toN}人。确认后请再次执行。',
    'Correcting "{item}" — {from} → {to} · {fromN} → {toN} people. Confirm and run it again.',
  ],
  's.item.editOk': [
    '✅ "{item}" 수정 완료 — 참여 {n}명',
    '✅ 已修改 "{item}" — 参与 {n} 人',
    '✅ Updated "{item}" — {n} participants',
  ],
  's.e.itemEmpty': ['아이템명을 입력해주세요.', '请输入物品名称。', 'Enter the item name.'],
  's.e.badAmount': ['금액은 양의 정수여야 합니다.', '金额必须是正整数。', 'The amount must be a positive whole number.'],
  's.e.badWeight': [
    '분배비중은 1~100 사이의 정수여야 합니다.',
    '分配比例必须是 1~100 之间的整数。',
    'The share must be a whole number from 1 to 100.',
  ],
  's.e.hanjaLong': ['한자표기가 너무 깁니다 (30자 이내).', '汉字标记太长（30 字以内）。', 'The Hanja name is too long (30 characters max).'],
  's.e.badPin': [
    'PIN 은 6~32자여야 하며 공백은 쓸 수 없습니다.',
    'PIN 必须为 6~32 位，且不能包含空格。',
    'The PIN must be 6–32 characters with no spaces.',
  ],
  's.e.appNameEmpty': ['앱 이름을 입력해주세요.', '请输入应用名称。', 'Enter the app name.'],
  's.e.appNameLong': ['앱 이름이 너무 깁니다 (20자 이내).', '应用名称太长（20 字以内）。', 'The app name is too long (20 characters max).'],
  's.e.serverNameLong': ['서버 이름이 너무 깁니다 (20자 이내).', '服务器名称太长（20 字以内）。', 'The server name is too long (20 characters max).'],
  's.e.alreadyDone': ['이미 분배된 아이템입니다. 새로고침해주세요.', '该物品已分配，请刷新。', 'That item is already distributed. Refresh.'],
  's.e.badRow': ['처리할 수 없는 행입니다.', '该行无法处理。', 'That row cannot be processed.'],
  's.e.payOver': [
    '⚠️ 지급액이 분배전({pending}다이아)보다 큽니다.',
    '⚠️ 发放金额超过待分配（{pending}钻石）。',
    '⚠️ The payout is larger than the unpaid balance ({pending} dia).',
  ],
  's.bulk.analyzed': [
    '읽은 줄 {total} · 신규 {add} · 개명후보 {rename} · 이미있음 {exists} · 중복 {dup} · 확인필요 {invalid}',
    '共 {total} 行 · 新增 {add} · 疑似改名 {rename} · 已存在 {exists} · 重复 {dup} · 需确认 {invalid}',
    '{total} lines · {add} new · {rename} possible renames · {exists} already listed · {dup} duplicates · {invalid} need a look',
  ],
  's.auth.master': [
    '👑 마스터관리자 모드가 켜졌습니다.',
    '👑 已进入主管理员模式。',
    '👑 Master admin mode is on.',
  ],
  's.auth.admin': ['🔓 관리자 모드가 켜졌습니다.', '🔓 已进入管理员模式。', '🔓 Admin mode is on.'],
  's.auth.badPin': ['PIN이 올바르지 않습니다.', 'PIN 不正确。', 'That PIN is not correct.'],
  's.bulk.ocrSetup': [
    '📷 사진은 저장했지만 글자 인식 기능이 준비되지 않았습니다.\n\nApps Script 편집기 왼쪽 [서비스] → [+] → "Drive API" 를 추가한 뒤 저장하면 됩니다.\n지금 당장은 명단을 텍스트로 붙여넣어 주세요.',
    '📷 照片已保存，但文字识别功能尚未启用。\n\n请在 Apps Script 编辑器左侧[服务] → [+] 添加 "Drive API" 并保存。\n目前请先把名单粘贴为文本。',
    '📷 The photo was saved but text recognition is not set up.\n\nIn the Apps Script editor, add "Drive API" under [Services] → [+] and save.\nFor now, paste the roster as text.',
  ],
  's.bulk.dupFrom': [
    '같은 아이디를 두 번 물려받도록 지정했습니다: {list}',
    '同一个 ID 被指定继承了两次：{list}',
    'The same ID was assigned twice: {list}',
  ],
  's.bulk.noFrom': [
    '명단에 없는 아이디를 지정했습니다: {list}\n새로고침 후 다시 시도해주세요.',
    '指定了名单中不存在的 ID：{list}\n请刷新后重试。',
    'These IDs are not on the roster: {list}\nRefresh and try again.',
  ],
  's.bulk.noText': [
    '📷 사진은 저장했지만 글자를 읽지 못했습니다. 텍스트로 붙여넣어주세요.',
    '📷 照片已保存，但没能识别出文字。请直接粘贴文本。',
    '📷 The photo was saved but no text could be read. Paste the list instead.',
  ],
  's.bulk.noName': [
    '읽어낸 이름이 없습니다. 한 줄에 한 명씩 붙여넣어주세요.',
    '没有识别到名字。请每行填一个人。',
    'No names were found. Put one name per line.',
  ],
  's.bulk.nothing': ['처리할 대상이 없습니다.', '没有需要处理的对象。', 'Nothing selected to apply.'],
  's.bulk.tooMany': [
    '한 번에 {max}명까지만 처리할 수 있습니다.',
    '一次最多处理 {max} 人。',
    'At most {max} people at a time.',
  ],
  's.bulk.overCap': [
    '정원을 넘습니다. 현재 {cur}명 + 추가 {add}명 > 최대 {max}명.',
    '超出上限。现有 {cur} 人 + 新增 {add} 人 > 上限 {max} 人。',
    'Over capacity: {cur} now + {add} new exceeds the {max} limit.',
  ],
  's.bulk.needConfirm': [
    '추가 {add}명 · 개명 {ren}명을 반영합니다.\n\n개명으로 지정한 건은 기존 잔액·참여횟수가 그대로 넘어갑니다.\n진행할까요?',
    '将添加 {add} 人 · 改名 {ren} 人。\n\n改名的成员会保留原有余额与参与次数。\n继续吗？',
    'This adds {add} and renames {ren}.\n\nRenamed members keep their balance and participation count.\nProceed?',
  ],
  's.bulk.ok': [
    '✅ 추가 {add}명 · 개명 {ren}명 완료 (서버 반영 {set}명)',
    '✅ 已添加 {add} 人 · 改名 {ren} 人（服务器已设置 {set} 人）',
    '✅ Added {add}, renamed {ren} ({set} got the server)',
  ],
  's.bulk.partial': [
    '⚠️ 추가 {add}명 · 개명 {ren}명 — 실패 {failN}건: {failList}',
    '⚠️ 添加 {add} 人 · 改名 {ren} 人 — 失败 {failN} 项：{failList}',
    '⚠️ Added {add}, renamed {ren} — {failN} failed: {failList}',
  ],
  's.e.photoFailed': ['사진을 분석하지 못했습니다.', '照片分析失败。', 'Could not analyse the photo.'],
  's.e.payZero': ['"{name}" 분배전 금액이 0입니다.', '「{name}」的待分配金额为 0。', '"{name}" has no unpaid balance.'],

  /* ── 레이드 (v10.8) — {day} 는 시트가 쓰는 '월'·'화' 표기 그대로 온다 ── */
  's.raid.addOk': [
    '✅ {day}요일 {time} "{boss}" 추가했습니다.',
    '✅ 已添加 {day} {time}「{boss}」。',
    '✅ Added "{boss}" at {time} on {day}.',
  ],
  's.raid.editOk': [
    '✅ {day}요일 {time} "{boss}" 으로 수정했습니다.',
    '✅ 已改为 {day} {time}「{boss}」。',
    '✅ Changed to "{boss}" at {time} on {day}.',
  ],
  's.raid.delOk': ['✅ 삭제했습니다.', '✅ 已删除。', '✅ Deleted.'],
  's.raid.seedOk': [
    '✅ 보스 시간표 {n}건을 채웠습니다.',
    '✅ 已填入 {n} 条首领时间表。',
    '✅ Filled the timetable with {n} entries.',
  ],
  's.e.badDay': ['요일을 골라주세요.', '请选择星期。', 'Pick a day of the week.'],
  's.e.badTime': [
    '시간을 24시간 형식(예 20:20)으로 넣어주세요.',
    '请用24小时制填写时间（例 20:20）。',
    'Enter the time in 24-hour form (e.g. 20:20).',
  ],
  's.e.bossEmpty': ['보스 이름을 입력해주세요.', '请输入首领名称。', 'Enter the boss name.'],
  's.e.bossLong': [
    '보스 이름이 너무 깁니다 (40자 이내).',
    '首领名称太长（40 字以内）。',
    'That boss name is too long (40 characters max).',
  ],
};

/* ────────────────────────── 컨텍스트 ────────────────────────── */

export type T = (key: string, vars?: Record<string, string | number>) => string;

/** Apps Script 가 돌려주는 결과의 공통 모양 — code/vars 가 있으면 여기서 문장을 만든다 */
export type ServerResult = {
  ok?: boolean;
  code?: string;
  vars?: Record<string, string | number>;
  msg?: string;
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  /** 재화 단위 — 시트는 '다이아'를 내려주지만 화면 언어에 맞춰 바꾼다 */
  unit: (raw: string) => string;
  /**
   * 서버 결과를 화면 언어 문장으로. code 가 사전에 있으면 그것으로 만들고,
   * 없으면 서버가 함께 보낸 한국어 msg 를, 그것도 없으면 fallbackKey 를 쓴다.
   */
  srv: (res: ServerResult | null | undefined, fallbackKey?: string) => string;
};

const LangContext = createContext<Ctx | null>(null);

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in vars)) return m;
    const v = vars[k];
    // 금액·인원수는 서버가 숫자로 보낸다 — 표시할 때만 천 단위로 끊는다
    return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : String(v);
  });
}

const INDEX: Record<Lang, 0 | 1 | 2> = { ko: 0, zh: 1, en: 2 };

export function LangProvider({ children }: { children: React.ReactNode }) {
  // 서버 렌더링과 첫 페인트를 맞추기 위해 항상 'ko'로 시작하고, 마운트 뒤에 저장값을 반영한다
  const [lang, setLangState] = useState<Lang>('ko');

  useEffect(() => {
    const saved = getLang();
    setLangState(saved);
    storeLang(saved); // 쿠키가 없던 기기에도 한 번 심어준다 (서버 메시지 언어용)
  }, []);

  const setLang = useCallback((l: Lang) => {
    storeLang(l);
    setLangState(l);
  }, []);

  const value = useMemo<Ctx>(() => {
    const i = INDEX[lang];
    const t: T = (key, vars) => {
      const row = DICT[key];
      if (!row) return key; // 사전에 없으면 키를 그대로 — 검사에서 잡힌다
      return interpolate(row[i], vars);
    };
    const srv: Ctx['srv'] = (res, fallbackKey) => {
      const code = res?.code;
      if (code && DICT['s.' + code]) return interpolate(DICT['s.' + code][i], res?.vars);
      // 사전에 없는 code 는 시트가 보낸 한국어 문장으로 — 반쪽만 번역하지 않는다
      if (res?.msg) return res.msg;
      return fallbackKey ? t(fallbackKey) : '';
    };
    return {
      lang,
      setLang,
      t,
      unit: (raw) => (raw === '다이아' ? t('c.unit.diamond') : raw),
      srv,
    };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useT 는 <LangProvider> 안에서만 쓸 수 있습니다.');
  return ctx;
}

/** 검사용 — 사전 전체를 노출한다 (세 언어가 다 채워졌는지 확인) */
export const __DICT = DICT;
