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
  'app.title': ['길드정산', '血盟結算', 'Guild Ledger'],
  'tab.balance': ['잔액', '餘額', 'Balance'],
  'tab.items': ['아이템', '物品', 'Items'],
  'tab.board': ['게시판', '公告板', 'Board'],
  'tab.alliance': ['연합', '聯盟', 'Alliance'],
  'tab.me': ['내 정보', '我的', 'Me'],
  'tab.admin': ['관리', '管理', 'Admin'],

  'c.refresh': ['새로고침', '重新整理', 'Refresh'],
  'c.syncing': ['갱신 중', '更新中', 'Syncing'],
  'c.justNow': ['방금', '剛剛', 'just now'],
  'c.agoMin': ['{n}분 전', '{n}分鐘前', '{n} min ago'],
  'c.agoHour': ['{n}시간 전', '{n}小時前', '{n} h ago'],
  'c.retry': ['다시 시도', '重試', 'Try again'],
  'c.close': ['닫기', '關閉', 'Close'],
  'c.cancel': ['취소', '取消', 'Cancel'],
  'c.back': ['뒤로', '返回', 'Back'],
  'c.save': ['저장', '儲存', 'Save'],
  'c.delete': ['삭제', '刪除', 'Delete'],
  'c.view': ['보기', '檢視', 'View'],
  'c.manage': ['관리', '管理', 'Manage'],
  'c.run': ['실행', '執行', 'Run'],
  'c.write': ['글쓰기', '發帖', 'New post'],
  'c.loading': ['불러오는 중…', '載入中…', 'Loading…'],
  'c.processing': ['처리 중…', '處理中…', 'Working…'],
  'c.saving': ['저장 중…', '儲存中…', 'Saving…'],
  'c.deleting': ['삭제 중…', '刪除中…', 'Deleting…'],
  'c.running': ['실행 중…', '執行中…', 'Running…'],
  'c.checking': ['확인 중…', '確認中…', 'Checking…'],
  'c.admin': ['관리자', '管理員', 'Admin'],
  'c.master': ['마스터관리자', '主管理員', 'Master admin'],
  'c.season': ['시즌', '賽季', 'Season'],
  'c.server': ['서버', '伺服器', 'Server'],
  'c.amount': ['금액', '金額', 'Amount'],
  'c.people': ['인원', '人數', 'People'],
  'c.itemName': ['아이템명', '物品名', 'Item name'],
  'c.ratio': ['비중', '比例', 'Share'],
  'c.total': ['합계', '合計', 'Total'],
  'c.persons': ['{n}명', '{n}人', '{n}'],
  'c.times': ['{n}회', '{n}次', '{n}×'],
  'c.cases': ['{n}건', '{n}件', '{n}'],
  'c.loadFailed': ['데이터를 불러오지 못했습니다.', '資料載入失敗。', 'Could not load the data.'],
  'c.checkSetup': ['설정 점검하기', '檢查設定', 'Check setup'],
  'c.unit.diamond': ['다이아', '鑽石', 'dia'],
  'c.pending': ['분배전', '待發放', 'Unpaid'],
  'c.paid': ['분배완료', '已發放', 'Paid'],
  'c.done': ['완료', '完成', 'Paid'],
  'c.joined': ['참여', '參與', 'Joined'],
  'c.fundName': ['혈맹운영비', '血盟運營費', 'Guild fund'],
  'c.edit': ['수정', '修改', 'Edit'],
  'tab.raid': ['레이드', '副本', 'Raids'],

  /* ── 홈 (v11.2.1) ── */
  'home.todo': ['지금 처리할 일', '現在要處理的事', 'Needs attention'],
  'home.now': ['지금 상황', '當前情況', 'Right now'],
  'home.clear': [
    '지금 처리할 일이 없습니다.',
    '目前沒有待處理的事項。',
    'Nothing needs attention right now.',
  ],
  'home.items': ['미분배 아이템', '未分配物品', 'Undistributed items'],
  'home.ally': ['연합 금액 대기', '聯盟待填金額', 'Alliance awaiting amount'],
  'home.owed': ['지급할 사람', '待發放人數', 'Awaiting payout'],
  'home.raidToday': ['오늘 보스', '今日首領', 'Bosses today'],
  'home.all': ['모든 화면', '全部頁面', 'All screens'],
  'home.raidSub': ['보스 시간표', '首領時間表', 'Boss schedule'],
  'home.raidCount': ['오늘 {n}개', '今日{n}個', '{n} today'],
  'home.balanceSub': ['분배전 {v}', '待發放 {v}', 'Unpaid {v}'],
  'home.itemsSub': ['등록·분배', '登記·分配', 'Register & split'],
  'home.allySub': ['서버별 정산', '各伺服器結算', 'By server'],
  'home.meSub': ['내 잔액', '我的餘額', 'My balance'],
  'home.boardSub': ['공지·글', '公告·帖子', 'Notices & posts'],
  'home.adminSub': ['PIN·도구', 'PIN·工具', 'PIN & tools'],
  'home.goHome': ['홈으로', '返回主頁', 'Home'],
  'home.termSub': ['한·中·EN 이름', '韓·中·英 名稱', 'KO·ZH·EN names'],
  'home.lang': ['언어', '語言', 'Language'],
  'home.langSub': ['한·中·EN', '韓·中·英', 'KO·ZH·EN'],

  /* ── 공유 버튼 (v10.8) ── */
  'sh.share': ['공유', '分享', 'Share'],
  'sh.copied': ['📋 복사했습니다. 붙여넣기 하세요.', '📋 已複製，可以貼上了。', '📋 Copied — paste it anywhere.'],
  'sh.failed': [
    '내보내지 못했습니다. 화면을 길게 눌러 직접 복사해주세요.',
    '匯出失敗，請長按螢幕手動複製。',
    'Could not export — long-press the screen and copy manually.',
  ],
  'sh.empty': ['공유할 내용이 없습니다.', '沒有可分享的內容。', 'Nothing to share.'],

  /* ── 잔액 탭 ── */
  'bal.waitingItems': ['⏳ 미분배 아이템', '⏳ 未分配物品', '⏳ Undistributed'],
  'bal.owedPeople': ['💰 잔액 남은 인원', '💰 有餘額人數', '💰 Awaiting payout'],
  'bal.pendingTotal': ['분배전 합계', '待發放合計', 'Unpaid total'],
  'bal.sect': ['💰 멤버별 잔액 · 분배완료 누적 {v}', '💰 成員餘額 · 已發放累計 {v}', '💰 Balances · paid to date {v}'],
  'bal.search': ['이름 검색', '搜尋名稱', 'Search by name'],
  /* ── 📚 용어 사전 (v11.4) ── */
  'adm.termSect': ['📚 용어 사전', '📚 詞彙表', '📚 Glossary'],
  'adm.termDesc': [
    '아이템명·보스명을 칠 때 자동완성에 쓰는 표입니다. 한국어 · 中文 · English 를 모아두면 어느 언어로 쳐도 찾아집니다.',
    '用於物品名·首領名自動完成的詞彙表。填好韓/中/英後，用任意語言都能搜到。',
    'Used for item and boss name autocomplete. Fill KO · ZH · EN and any language finds it.',
  ],
  'adm.termOpen': ['용어 사전 열기', '開啟詞彙表', 'Open glossary'],
  'term.title': ['용어', '詞彙', 'Glossary'],
  'term.sect': ['리니지W 용어 {n}개', '天堂W 詞彙 {n} 條', '{n} Lineage W terms'],
  'term.search': ['한국어 · 中文 · English 로 검색', '用韓/中/英搜尋', 'Search in KO · ZH · EN'],
  'term.searchHint': [
    '어느 언어로 쳐도 찾습니다. 오른쪽 [공유]를 누르면 세 언어가 한 줄로 복사됩니다.',
    '任意語言均可搜尋。點右側[分享]可複製三種語言。',
    'Search in any language. [Share] copies all three.',
  ],
  'term.catAll': ['전체', '全部', 'All'],
  'term.empty': [
    '아직 용어가 없습니다. [관리] → 관리 도구 → [📚 용어 목록 채우기] 를 실행해보세요.',
    '還沒有詞彙。請在[管理]→工具中執行[📚 填充詞彙表]。',
    'No terms yet. Run [📚 Fill glossary] in Admin → Tools.',
  ],
  'term.noMatch': ['찾는 말이 없습니다.', '未找到。', 'No match.'],
  'term.needCheck': ['中文·English 미입력', '中文·English 未填', 'ZH·EN not filled in'],
  'term.add': ['용어 추가', '新增詞彙', 'Add term'],
  'term.cat': ['분류', '分類', 'Category'],
  'term.ko': ['한국어 (앱에 저장되는 이름)', '韓語（儲存到表格的名稱）', 'Korean (the stored name)'],
  'term.editSub': [
    '모르는 표기는 비워두세요 — 지어내지 않습니다.',
    '不確定的請留空 — 系統不會編造。',
    'Leave unknown fields blank — nothing is invented.',
  ],
  'term.blankOk': [
    '中文·English 는 비워도 됩니다. 비어 있으면 앱이 한국어 그대로 보여줍니다.',
    '中文·English 可留空，留空時按韓語原樣顯示。',
    'ZH·EN may stay empty; the Korean name is shown as is.',
  ],
  'term.bulk': ['붙여넣기로 여러 개', '批次貼上', 'Paste many'],
  'term.bulkSub': [
    '홈페이지 표를 복사해 그대로 붙여넣으세요.',
    '把官網表格複製後直接貼上即可。',
    'Copy a table from a site and paste it here.',
  ],
  'term.bulkLabel': ['한 줄에 하나씩', '每行一條', 'One per line'],
  /* 자리표시자 — 순서(국문 → 中文 → English)를 보여주는 예시다.
     영문 화면에는 한글 예시를 두지 않는다 (화면 문구 검사가 이것도 잡는다) */
  'term.bulkPh': [
    '용의 심장\t龙之心\tDragon Heart',
    '용의 심장\t龍之心\tDragon Heart',
    'KO name\tZH name\tEN name',
  ],
  'term.bulkHint': [
    '탭·쉼표·슬래시로 나뉜 줄을 모두 받습니다. 한국어만 있어도 됩니다 — 나머지는 나중에 채우면 됩니다.',
    '支援用製表符·逗號·斜槓分隔。只有韓語也可以，其餘以後再補。',
    'Tabs, commas or slashes all work. Korean alone is fine — fill the rest later.',
  ],
  'term.bulkCount': ['{n}줄을 넣습니다.', '將新增 {n} 行。', 'Will add {n} rows.'],
  'term.bulkDone': [
    '✅ {n}개를 넣었습니다. (이미 있어 건너뜀 {k}개)',
    '✅ 已新增 {n} 條（跳過 {k} 條）。',
    '✅ Added {n} ({k} skipped).',
  ],
  'term.img': ['아이콘 그림 주소 (선택)', '圖示地址（可選）', 'Icon image URL (optional)'],
  'term.imgHint': [
    '구글 드라이브에 올린 그림 주소를 넣으면 목록에 함께 보입니다. 비워도 됩니다.',
    '可填寫上傳到 Google Drive 的圖片地址，留空也可以。',
    'Paste a Google Drive image link, or leave it empty.',
  ],
  'term.delAsk': ['"{item}" 을(를) 용어 목록에서 지울까요?', '要從詞彙表刪除「{item}」嗎？', 'Remove "{item}" from the glossary?'],
  'term.pickHint': [
    '누르면 한국어 이름이 들어갑니다 (기록은 한 가지 이름으로 모읍니다).',
    '點選後填入韓語名稱（記錄統一用一種名稱）。',
    'Tap to insert the Korean name (records keep one name).',
  ],

  'bal.byServer': ['서버로 좁혀 보기', '按伺服器篩選', 'Filter by server'],
  'bal.onlyOwed': ['받을 잔액이 남은 사람만 보기', '僅顯示還有餘額的人', 'Only those still owed'],
  'bal.noMatch': ['조건에 맞는 멤버가 없습니다.', '沒有符合條件的成員。', 'No members match.'],
  'bal.noMember': ['멤버가 없습니다.', '暫無成員。', 'No members yet.'],
  'bal.payout': ['지급', '發放', 'Pay out'],

  /* ── 아이템 탭 ── */
  'items.sect': ['⏳ 미분배 아이템', '⏳ 未分配物品', '⏳ Undistributed items'],
  'items.sectAdmin': [
    '⏳ 미분배 아이템 — [분배]를 눌러 판매금액을 입력하세요',
    '⏳ 未分配物品 — 點選[分配]輸入售出金額',
    '⏳ Undistributed — tap [Distribute] and enter the sale amount',
  ],
  'items.empty': ['미분배 아이템이 없습니다.', '沒有未分配的物品。', 'Nothing waiting to be distributed.'],
  'items.distribute': ['분배', '分配', 'Distribute'],
  'items.waiting': ['대기중', '等待中', 'Waiting'],
  'items.viewerHint': [
    '아이템 등록·분배는 관리자만 할 수 있습니다. 하단 [관리] 탭에서 PIN을 입력하면 여기에 버튼이 나타납니다.',
    '只有管理員才能登記和分配物品。在下方[管理]標籤輸入 PIN 後，按鈕就會出現在這裡。',
    'Only admins can register and distribute items. Enter the PIN in the [Admin] tab and the buttons appear here.',
  ],
  'items.newSect': ['📝 새 아이템 등록 (레이드 직후)', '📝 登記新物品（副本結束後）', '📝 Register an item (right after the raid)'],
  'items.name': ['📦 아이템명', '📦 物品名', '📦 Item name'],
  'items.namePh': ['예: 기란 세금', '例：奇巖稅金', 'e.g. Giran tax'],
  'items.photoLabel': [
    '📷 인증샷 (사진에서 참여자를 자동으로 찾아 체크합니다)',
    '📷 截圖（自動識別並勾選參與者）',
    '📷 Screenshot (participants are detected and ticked for you)',
  ],
  'items.photoMulti': [
    '여러 장을 한꺼번에 고를 수 있습니다. 장마다 찾은 사람이 계속 더해집니다.',
    '可一次選擇多張。每張識別到的人會累加勾選。',
    'You can pick several at once — matches from each add up.',
  ],
  'items.edit': ['수정', '修改', 'Edit'],
  'led.editMembers': ['👥 참여 인원·금액 고치기', '👥 修改參與人員·金額', '👥 Edit people & amount'],
  'led.editNote': [
    '이미 나눠준 다이아를 분배 시점 금액 그대로 회수한 뒤, 새 명단·새 금액으로 다시 나눕니다. {fund}도 함께 맞춰집니다.',
    '按分配時的金額收回已發放的鑽石，再按新名單和新金額重新分配。{fund} 也會同步調整。',
    'The original amounts are reclaimed exactly as distributed, then split again with the new list and amount. {fund} follows.',
  ],
  'items.editSub': [
    '아직 분배하지 않은 아이템만 고칠 수 있습니다. 참여자를 바꾸면 참여횟수도 다시 계산됩니다.',
    '僅可修改尚未分配的物品。改動參與者後參與次數會重新統計。',
    'Only items that have not been distributed yet. Changing participants recounts attendance.',
  ],
  'items.photoPick': ['📎 사진 선택 / 촬영', '📎 選擇照片 / 拍攝', '📎 Choose or take a photo'],
  'items.photoAlt': ['인증샷 미리보기', '截圖預覽', 'Screenshot preview'],
  'items.ocrShow': ['🔍 인식된 텍스트 보기', '🔍 檢視識別文本', '🔍 Show recognised text'],
  'items.ocrHide': ['🔍 인식된 텍스트 숨기기', '🔍 隱藏識別文本', '🔍 Hide recognised text'],
  'items.linkLabel': [
    '🔗 인증샷 링크 (사진을 넣으면 자동으로 채워집니다)',
    '🔗 截圖連結（上傳照片後自動填入）',
    '🔗 Screenshot link (filled in automatically when you attach a photo)',
  ],
  'items.membersLabel': ['👥 참여 멤버 — {n}명 선택됨', '👥 參與成員 — 已選 {n} 人', '👥 Participants — {n} selected'],
  'items.selectAll': ['전체 선택', '全選', 'Select all'],
  'items.clearAll': ['전체 해제', '全部取消', 'Clear all'],
  /* 서버로 좁히기 (v10.8.6) */
  'items.svAsk': [
    '🗂️ 서버를 선택해주세요. 그 서버의 혈맹원만 보여드립니다. (고르지 않으면 전원)',
    '🗂️ 請選擇伺服器，只顯示該伺服器的成員。（不選則顯示全部）',
    '🗂️ Pick a server to show only its members. (None picked = everyone)',
  ],
  'items.svMore': [
    '🗂️ 더 추가하실 서버는 없나요? 여러 개를 함께 고를 수 있습니다.',
    '🗂️ 還要加別的伺服器嗎？可以同時選擇多個。',
    '🗂️ Any more servers? You can pick several at once.',
  ],
  'items.svShowing': [
    '{total}명 중 {n}명을 보고 있습니다. 체크한 사람은 다른 서버여도 계속 보입니다.',
    '正在顯示 {total} 人中的 {n} 人。已勾選的人即使不同伺服器也會一直顯示。',
    'Showing {n} of {total}. Anyone you ticked stays visible even from another server.',
  ],
  'items.svUnfold': ['+ 나머지 {n}명도 보기', '+ 顯示其餘 {n} 人', '+ Show the other {n}'],
  'items.svFold': ['− 나머지 접기', '− 收起其餘', '− Collapse the rest'],
  'items.checkNote': [
    '⚠️ 등록 전에 체크된 참여자가 맞는지 꼭 확인해주세요. 자동 감지는 참고용입니다.',
    '⚠️ 登記前請務必確認勾選的參與者是否正確。自動識別僅供參考。',
    '⚠️ Check the ticked participants before registering. Auto-detection is only a suggestion.',
  ],
  'items.submit': ['📝 아이템 등록', '📝 登記物品', '📝 Register item'],
  'items.analyzing': [
    '분석 중… (드라이브 저장 + 글자 인식)',
    '分析中…（儲存到雲端 + 文字識別）',
    'Analysing… (saving to Drive + reading text)',
  ],
  'items.analyzeFailed': ['분석 실패: {v}', '分析失敗：{v}', 'Analysis failed: {v}'],
  'items.analyzeDone': ['분석 완료', '分析完成', 'Analysis complete'],
  'items.readFailed': ['사진을 읽지 못했습니다.', '無法讀取照片。', 'Could not read the photo.'],
  'items.formatFailed': ['사진 형식을 인식하지 못했습니다.', '無法識別照片格式。', 'Unsupported photo format.'],
  'items.noCanvas': [
    '이 브라우저에서는 사진 분석을 지원하지 않습니다.',
    '此瀏覽器不支援照片分析。',
    'This browser cannot analyse photos.',
  ],
  'items.confirmTitle': ['⚠️ 참여자를 다시 확인해주세요', '⚠️ 請再次確認參與者', '⚠️ Please double-check the participants'],
  'items.confirmSub': [
    '등록하면 {n}명의 참여횟수가 즉시 올라갑니다.',
    '登記後 {n} 人的參與次數會立即增加。',
    'Registering raises the join count for {n} members straight away.',
  ],
  'items.confirmItem': ['📦 아이템', '📦 物品', '📦 Item'],
  'items.confirmJoin': ['👥 참여', '👥 參與', '👥 Participants'],
  'items.andMore': [' 외 {n}명', ' 等 {n} 人', ' and {n} more'],
  'items.confirmDo': ['등록하기', '確認登記', 'Register'],

  /* ── 분배 시트 ── */
  'dist.sub': [
    '참여 {n}명 · {fund} {pct}% 공제 후 1/N 분배',
    '參與 {n} 人 · 扣除 {fund} {pct}% 後平均分配',
    '{n} participants · split evenly after {pct}% {fund}',
  ],
  'dist.amount': ['판매금액 ({unit})', '售出金額（{unit}）', 'Sale amount ({unit})'],
  'dist.amountPh': ['예: 50000', '例：50000', 'e.g. 50000'],
  'dist.sale': ['💎 판매금액', '💎 售出金額', '💎 Sale amount'],
  'dist.fund': ['🏦 {fund} ({pct}%)', '🏦 {fund}（{pct}%）', '🏦 {fund} ({pct}%)'],
  'dist.base': ['👥 기본 1인당 × {n}명', '👥 基礎每人 × {n} 人', '👥 Base per head × {n}'],
  'dist.remainder': ['➕ 잔여분 → {fund}', '➕ 剩餘 → {fund}', '➕ Remainder → {fund}'],
  'dist.fundTotal': ['🏦 {fund} 최종 적립', '🏦 {fund} 最終入賬', '🏦 {fund} total credited'],
  'dist.needInt': ['판매금액은 양의 정수여야 합니다.', '售出金額必須是正整數。', 'The sale amount must be a positive whole number.'],
  'dist.enterAmount': [
    '금액을 입력하면 분배 결과를 미리 보여드립니다.',
    '輸入金額後會顯示分配預覽。',
    'Enter an amount to preview the split.',
  ],
  'dist.do': ['분배하기', '確認分配', 'Distribute'],

  /* ── 지급 시트 ── */
  'pay.title': ['💰 {name} 지급', '💰 發放給 {name}', '💰 Pay {name}'],
  'pay.sub': ['분배전 잔액 {v}', '待發放餘額 {v}', 'Unpaid balance {v}'],
  'pay.label': ['지급할 금액 ({unit})', '發放金額（{unit}）', 'Amount to pay ({unit})'],
  'pay.full': ['전액 {v}', '全額 {v}', 'All {v}'],
  'pay.half': ['절반 {v}', '一半 {v}', 'Half {v}'],
  'pay.give': ['지급', '發放', 'Paying'],
  'pay.left': ['지급 후 남는 분배전', '發放後剩餘待發放', 'Unpaid after this'],
  'pay.partial': ['부분 지급입니다', '這是部分發放', 'This is a partial payout'],
  'pay.whole': ['전액 지급입니다', '這是全額髮放', 'This pays the full balance'],
  'pay.tooMuch': ['분배전 잔액({v})보다 클 수 없습니다.', '不能超過待發放餘額（{v}）。', 'Cannot exceed the unpaid balance ({v}).'],
  'pay.needInt': ['지급액은 양의 정수여야 합니다.', '發放金額必須是正整數。', 'The payout must be a positive whole number.'],
  'pay.do': ['지급 처리', '確認發放', 'Pay out'],

  /* ── 내 정보 ── */
  'me.sect': ['🙋 내 다이아 조회', '🙋 查詢我的鑽石', '🙋 My balance'],
  'me.pick': ['이름 선택 (다음부터는 자동으로 불러옵니다)', '選擇名稱（下次會自動載入）', 'Pick your name (remembered next time)'],
  'me.pickPh': ['이름을 선택하세요', '請選擇名稱', 'Select a name'],
  'me.looking': ['조회 중…', '查詢中…', 'Looking up…'],
  'me.look': ['조회하기', '查詢', 'Look up'],
  'me.needName': ['이름을 선택해주세요.', '請選擇名稱。', 'Please pick a name.'],
  'me.failed': ['조회하지 못했습니다.', '查詢失敗。', 'Lookup failed.'],
  'me.pendingBox': ['분배전 (받을 예정)', '待發放（即將領取）', 'Unpaid (due to you)'],
  'me.paidBox': ['분배완료 (받은 누적)', '已發放（累計領取）', 'Paid (received so far)'],
  'me.meta': ['시즌 {s} · 참여 {n}회 · 단위 {unit}', '賽季 {s} · 參與 {n} 次 · 單位 {unit}', 'Season {s} · joined {n}× · in {unit}'],

  /* ── 게시판 ── */
  'board.title': ['게시판', '公告板', 'Board'],
  'board.notice': ['공지', '公告', 'Notice'],
  'board.newTitle': ['제목', '標題', 'Title'],
  'board.newBody': ['내용', '內容', 'Body'],
  'board.author': ['작성자', '作者', 'Author'],
  'board.asNotice': ['공지로 올리기 (관리자)', '釋出為公告（管理員）', 'Post as a notice (admin)'],
  'board.empty': ['아직 글이 없습니다. 첫 글을 남겨보세요.', '還沒有帖子，來寫第一篇吧。', 'No posts yet — write the first one.'],
  'board.noBody': ['(내용 없음)', '（無內容）', '(no body)'],
  'board.posting': ['등록 중…', '釋出中…', 'Posting…'],
  'board.needSheet': [
    '구글시트 쪽 코드가 아직 v10.0 이 아니면 [게시판] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤 다시 열어주세요.',
    '如果表格端程式碼還不是 v10.0，就沒有[公告板]功能。請把新程式碼貼上到 Apps Script，通過[管理部署]→新版本部署後再開啟。',
    'The Board needs sheet code v10.0. Paste the new code into Apps Script, deploy a new version under [Manage deployments], then reopen.',
  ],

  /* ── 연합 ── */
  'ali.title': ['연합 정산', '聯盟結算', 'Alliance ledger'],
  'ali.byServer': ['서버별 누적', '各伺服器累計', 'Totals by server'],
  'ali.filterServer': ['서버로 좁혀 보기', '按伺服器篩選', 'Filter by server'],
  /* 레이드일·보스·루팅 (v11.6) — 연합·아이템이 같은 문구를 쓴다 */
  'loot.raidDate': ['레이드 날짜', '突襲日期', 'Raid date'],
  /* 아이템을 주는 보스 제안 (v11.6.2) — 보스 이름은 vars 로 그대로 넘긴다 (규칙 6-1) */
  'loot.bossAuto': [
    '✅ 공식 정보에 따르면 이 아이템은 {boss} 만 줍니다 — 자동으로 넣었습니다. 아니면 고치세요.',
    '✅ 根據官方資料，此道具僅由 {boss} 掉落 — 已自動填入。不對請修改。',
    '✅ Officially this item drops only from {boss} — filled in for you. Change it if wrong.',
  ],
  'loot.bossFrom': [
    '이 아이템을 주는 보스 {n}종 — 눌러서 넣으세요 (여기 없는 보스도 직접 칠 수 있습니다)',
    '掉落此道具的首領共 {n} 種 — 點選填入（也可自行輸入其他首領）',
    '{n} bosses drop this item — tap to fill (you can also type another)',
  ],

  'loot.raidHint': [
    '비워두면 등록한 날로만 남습니다. 잡은 날과 등록한 날이 다르면 채워주세요.',
    '留空則只記錄登入日期。若打倒日與登入日不同請填寫。',
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
  'ali.records': ['🧾 정산 완료', '🧾 已結算', '🧾 Settled'],
  'ali.register': ['연합 등록', '登記聯盟', 'Register'],
  'ali.registerSub': [
    '아이템명과 참여 서버별 인원만 먼저 넣습니다. 금액은 팔린 뒤에 넣습니다.',
    '先填物品名和各伺服器參與人數。金額等賣出後再填。',
    'Item name and the head count per server first. The amount comes after it sells.',
  ],
  'ali.registerHint': [
    '혈맹 아이템과 같은 순서입니다 — 먼저 등록해두고, 팔린 뒤에 [금액 넣기]로 나누세요.',
    '與血盟物品流程相同 — 先登記，賣出後用[填入金額]分配。',
    'Same flow as guild items — register now, then use [Enter amount] once it sells.',
  ],
  'ali.waitingSect': ['금액 대기 중', '待填金額', 'Awaiting amount'],
  'ali.waitingEmpty': [
    '금액을 기다리는 연합 건이 없습니다.',
    '沒有待填金額的聯盟記錄。',
    'Nothing is waiting for an amount.',
  ],
  'ali.credit': ['금액 넣기', '填入金額', 'Enter amount'],
  'ali.creditSub': [
    '서버 {sv}곳 · 모두 {n}명 — 혈비를 뗀 나머지를 인원수에 맞춰 나눕니다.',
    '{sv} 個伺服器 · 共 {n} 人 — 扣除運營費後按人數分配。',
    '{sv} servers · {n} people — the pool is split by head count after the guild fee.',
  ],
  /* v11.0 — 아이템 하나에 여러 서버 · 사진 여러 장 */
  'ali.serversLabel': ['참여 서버 · 인원', '參與伺服器 · 人數', 'Servers & head count'],
  'ali.addServer': ['＋ 서버 추가', '＋ 新增伺服器', '+ Add server'],
  'ali.dupServer': [
    '같은 서버를 두 번 넣을 수 없습니다.',
    '同一伺服器不能填兩次。',
    'The same server cannot be added twice.',
  ],
  /* v11.3 — 인증샷은 서버 줄마다 따로 붙는다 */
  'ali.photoAddServer': ['📷 {s}서버 사진 추가', '📷 新增{s}服照片', '📷 Add photo for server {s}'],
  'ali.photoSaved': ['이미 붙어 있는 사진 {n}장', '已附加照片 {n} 張', '{n} already attached'],
  'ali.photoOptional': [
    '인증샷은 없어도 등록됩니다. 사진을 넣으면 인원수를 대신 세어줍니다.',
    '沒有截圖也能登記。上傳照片可自動統計人數。',
    'Screenshots are optional. If you add one, it counts heads for you.',
  ],
  'ali.photoN': ['📷 {n}장', '📷 {n} 張', '📷 {n}'],
  'ali.photoRead': ['📷{i} {n}명', '📷{i} {n}人', '📷{i} {n}'],
  'ali.remove': ['빼기', '移除', 'Remove'],
  'ali.fundShare': ['🏦 {fund} (혈비 + 잔여)', '🏦 {fund}（運營費 + 餘數）', '🏦 {fund} (fee + remainder)'],
  'ali.detail': ['참여 서버 보기', '檢視參與伺服器', 'View servers'],
  'ali.serverLine': ['{s} 서버 · {n}명', '{s} 服 · {n}人', 'Server {s} · {n}'],
  /* 정정 (v11.1 · 마스터관리자) */
  'ali.pendingN': ['⏳ 대기 {n}명 ({k}건)', '⏳ 待結算 {n}人（{k}件）', '⏳ {n} pending ({k})'],
  'ali.addSv': ['참여 서버 추가', '新增參與伺服器', 'Add servers'],
  'ali.addSvSub': [
    '이미 들어 있는 서버는 그대로 두고, 빠진 서버만 더합니다.',
    '保留已有的伺服器，只新增遺漏的。',
    'Existing servers stay as they are — this only adds missing ones.',
  ],
  'ali.have': ['이미 들어 있는 서버', '已有的伺服器', 'Already included'],
  'ali.allServers': [
    '모든 서버가 이미 들어 있습니다. 인원을 고치려면 정정을 쓰세요.',
    '所有伺服器都已包含。要修改人數請使用修正。',
    'Every server is already included — use correction to change head counts.',
  ],
  'ali.editWaitSub': [
    '아직 금액이 안 들어간 건입니다. 아이템명과 서버별 인원을 고칩니다.',
    '尚未填入金額。可修改物品名和各伺服器人數。',
    'No amount yet — edit the item name and head counts.',
  ],
  'ali.editDoneSub': [
    '이미 정산된 건입니다. 고치면 서버별 몫과 {fund} 가 다시 계산됩니다.',
    '已結算。修改後各伺服器份額和 {fund} 會重新計算。',
    'Already settled — the shares and {fund} are recalculated.',
  ],
  'ali.editDoneHint': [
    '{fund}는 바뀐 만큼만 더하거나 뺍니다. 아래 숫자를 확인하고 저장하세요.',
    '{fund} 只按差額增減。請核對下面的數字後儲存。',
    'Only the difference is applied to {fund}. Check the numbers below before saving.',
  ],
  /* 인증샷 보기 (v11.1) */
  'shot.sect': ['📷 인증샷', '📷 截圖', '📷 Screenshots'],
  'shot.alt': ['인증샷 {n}번', '截圖 {n}', 'Screenshot {n}'],
  'shot.failed': [
    '사진을 못 불러왔습니다 (눌러서 원본 열기)',
    '無法載入圖片（點選開啟原圖）',
    'Could not load it (tap for the original)',
  ],
  'shot.origin': ['원본 열기', '開啟原圖', 'Open original'],
  'shot.none': ['등록된 인증샷이 없습니다.', '沒有截圖。', 'No screenshots.'],
  'items.detailSub': [
    '등록할 때 체크한 참여자와 붙인 인증샷입니다.',
    '登記時勾選的參與者和附上的截圖。',
    'The participants ticked and the screenshots attached at registration.',
  ],
  'ali.add': ['연합 정산 등록', '登記聯盟結算', 'Add alliance entry'],
  'ali.photoCount': ['인증샷으로 인원 세기', '用截圖統計人數', 'Count people from a screenshot'],
  'ali.empty': ['등록된 연합 정산이 없습니다.', '暫無聯盟結算記錄。', 'No alliance entries yet.'],
  'ali.serverN': ['{s} 서버', '{s} 服', 'Server {s}'],
  'ali.addSub': [
    '인증샷은 인원수만 셉니다 (아이디 판별 없음)',
    '截圖只統計人數（不識別 ID）',
    'Screenshots only count heads — no ID matching',
  ],
  'ali.none': ['(지정 안 함)', '（不指定）', '(none)'],
  'ali.credited': ['🎯 {s} 서버 × {pct}%', '🎯 {s} 服 × {pct}%', '🎯 Server {s} × {pct}%'],
  'ali.photoFailed': ['사진을 분석하지 못했습니다.', '照片分析失敗。', 'Could not analyse the photo.'],
  'ali.needSheet': [
    '구글시트 쪽 코드가 아직 v10.0 이 아니면 [연합] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤 다시 열어주세요.',
    '如果表格端程式碼還不是 v10.0，就沒有[聯盟]功能。請把新程式碼貼上到 Apps Script，通過[管理部署]→新版本部署後再開啟。',
    'Alliance needs sheet code v10.0. Paste the new code into Apps Script, deploy a new version under [Manage deployments], then reopen.',
  ],

  /* ── 레이드 (보스 시간표, v10.8) ── */
  'raid.title': ['보스 시간표', '首領時間表', 'Boss timetable'],
  'raid.d1': ['월', '週一', 'Mon'],
  'raid.d2': ['화', '週二', 'Tue'],
  'raid.d3': ['수', '週三', 'Wed'],
  'raid.d4': ['목', '週四', 'Thu'],
  'raid.d5': ['금', '週五', 'Fri'],
  'raid.d6': ['토', '週六', 'Sat'],
  'raid.d7': ['일', '週日', 'Sun'],
  'raid.am': ['오전', '上午', 'AM'],
  'raid.pm': ['오후', '下午', 'PM'],
  'raid.pickDay': ['요일 고르기', '選擇星期', 'Pick a day'],
  'raid.todaySect': ['📅 오늘 ({d}) 등장 보스', '📅 今天（{d}）出現的首領', '📅 Today ({d})'],
  'raid.daySect': ['📅 {d} 등장 보스', '📅 {d} 出現的首領', '📅 {d}'],
  'raid.empty': ['이 요일에 등록된 보스가 없습니다.', '這一天沒有登記的首領。', 'No bosses listed for this day.'],
  'raid.add': ['보스 추가', '新增首領', 'Add a boss'],
  'raid.addTitle': ['🗡️ 보스 추가', '🗡️ 新增首領', '🗡️ Add a boss'],
  'raid.editTitle': ['🗡️ 보스 수정', '🗡️ 修改首領', '🗡️ Edit boss'],
  'raid.sheetSub': [
    '여러 요일에 나오는 보스는 요일마다 한 번씩 넣어주세요.',
    '在多個星期出現的首領，請按星期分別新增。',
    'A boss that appears on several days needs one entry per day.',
  ],
  'raid.day': ['요일', '星期', 'Day'],
  'raid.time': ['시간', '時間', 'Time'],
  'raid.timeHint': [
    '게임 안 시계 기준으로 넣으세요. 화면에는 오전/오후로 보여줍니다.',
    '請按遊戲內時間填寫，介面上會顯示為上午/下午。',
    'Use the in-game clock. The list shows it as AM/PM.',
  ],
  'raid.boss': ['보스 이름', '首領名稱', 'Boss name'],
  'raid.bossPh': ['예: 오만10층', '例：傲慢10層', 'e.g. Tower floor 10'],
  'raid.note': ['비고 (선택)', '備註（可選）', 'Note (optional)'],
  'raid.notePh': ['예: 젠 간격 3시간', '例：重新整理間隔3小時', 'e.g. respawns every 3 h'],
  'raid.needBoss': ['보스 이름을 입력해주세요.', '請輸入首領名稱。', 'Enter the boss name.'],
  'raid.needTime': [
    '시간을 24시간 형식(예 20:20)으로 넣어주세요.',
    '請用24小時制填寫時間（例 20:20）。',
    'Enter the time in 24-hour form (e.g. 20:20).',
  ],
  'raid.viewerHint': [
    '시간표는 관리자가 관리합니다. 틀린 부분이 있으면 게시판에 남겨주세요.',
    '時間表由管理員維護。發現有誤請在公告板留言。',
    'Admins maintain this timetable. Post on the board if something is wrong.',
  ],
  'raid.needSheet': [
    '구글시트 쪽 코드가 아직 v10.8 이 아니면 [레이드] 기능이 없습니다. Apps Script 에 새 코드를 붙여넣고 [배포 관리] → 새 버전으로 배포한 뒤, [⚙️ 관리] → 관리 도구 → [🗡️ 보스 시간표 기본값 채우기] 를 한 번 실행해주세요.',
    '如果表格端程式碼還不是 v10.8，就沒有[副本]功能。請把新程式碼貼上到 Apps Script，通過[管理部署]→新版本部署，然後執行一次[⚙️ 管理]→管理工具→[🗡️ 填入首領時間表預設值]。',
    'Raids need sheet code v10.8. Paste the new code into Apps Script, deploy a new version under [Manage deployments], then run [⚙️ Admin] → Tools → [🗡️ Fill the default boss timetable] once.',
  ],

  /* ── 지난 시즌 ── */
  'season.title': ['🗓️ 지난 시즌', '🗓️ 往期賽季', '🗓️ Past seasons'],
  'season.sub': ['지금은 시즌 {n} 진행 중입니다', '當前是第 {n} 賽季', 'Season {n} is running now'],
  'season.detailSub': ['{n}명 · 총 {v}', '{n} 人 · 共 {v}', '{n} members · {v} total'],
  'season.noRecord': ['이 시즌에는 정산 기록이 없습니다.', '本賽季沒有結算記錄。', 'No settlements in this season.'],
  'season.more': ['자세히 보기 (아이템·지급 이력)', '檢視詳情（物品·發放記錄）', 'Show details (items & payouts)'],
  'season.less': ['간단히 보기', '簡要顯示', 'Show less'],
  'season.backToList': ['시즌 목록으로', '返回賽季列表', 'Back to seasons'],
  'season.noRows': ['기록 없음', '無記錄', 'No rows'],
  'season.emptyGuide': [
    '보관된 시즌 기록이 없습니다.\n\n예전 파일에서 쓰던 시즌 기록이 있다면 [⚙️ 관리] → 관리 도구 → [📚 지난 시즌 기록만 가져오기] 로 옮겨오세요. 멤버·잔액은 건드리지 않습니다.',
    '沒有已儲存的賽季記錄。\n\n如果舊檔案裡有賽季記錄，請到[⚙️ 管理]→管理工具→[📚 僅匯入往期賽季記錄]搬過來。不會改動成員和餘額。',
    'No archived seasons.\n\nIf an older file has season sheets, bring them over with [⚙️ Admin] → Tools → [📚 Import past seasons only]. Members and balances are untouched.',
  ],
  'season.loadFailed': ['시즌 기록을 불러오지 못했습니다.', '賽季記錄載入失敗。', 'Could not load season records.'],

  /* ── 관리 탭 ── */
  'adm.langSect': ['🌏 언어 / Language', '🌏 語言 / Language', '🌏 Language'],
  'adm.langNote': [
    '화면에 고정된 문구만 바뀝니다. 사람 이름·아이템명은 번역하지 않습니다 — 기계가 이름을 바꾸면 다른 사람으로 읽힐 수 있기 때문입니다. 혈맹원 한자 표기는 [혈맹원 관리]에서 직접 넣어주세요.',
    '只切換介面上的固定文字。人名和物品名不翻譯 — 機器改動名稱可能被認成別人。血盟成員的漢字標註請在[成員管理]中手動填寫。',
    'Only fixed interface text changes. Player and item names are never translated — a machine-altered name could be read as someone else. Add hanja for members under [Members].',
  ],
  'adm.masterMode': ['👑 마스터관리자 모드', '👑 主管理員模式', '👑 Master admin mode'],
  'adm.adminMode': ['🔓 관리자 모드', '🔓 管理員模式', '🔓 Admin mode'],
  'adm.needAuth': ['🔒 관리자 인증', '🔒 管理員認證', '🔒 Admin sign-in'],
  'adm.onDesc': [
    '{role} 모드가 켜져 있습니다. [잔액] 탭에서 지급, [아이템] 탭에서 등록·분배를 할 수 있습니다.',
    '{role}模式已開啟。可在[餘額]標籤發放，在[物品]標籤登記和分配。',
    '{role} mode is on. Pay out from [Balance], register and distribute from [Items].',
  ],
  'adm.masterExtra': [
    ' 여기에 더해 앱 이름과 관리자 PIN을 바꿀 수 있습니다.',
    ' 此外還可以修改應用名稱和管理員 PIN。',
    ' You can also change the app name and the admin PIN.',
  ],
  'adm.keepHint': [
    '이 기기에서 30일간 유지됩니다. 공용 기기라면 쓰고 나서 꼭 잠가주세요.',
    '在此裝置上保持 30 天。如果是公用裝置，用完請務必鎖定。',
    'Stays unlocked on this device for 30 days. On a shared device, lock it when you are done.',
  ],
  'adm.lock': ['🔒 관리자 모드 잠그기', '🔒 鎖定管理員模式', '🔒 Lock admin mode'],
  'adm.pin': ['관리자 PIN', '管理員 PIN', 'Admin PIN'],
  'adm.pinPh': ['PIN 입력', '輸入 PIN', 'Enter PIN'],
  'adm.unlock': ['🔓 잠금 해제', '🔓 解鎖', '🔓 Unlock'],
  'adm.pinShow': ['PIN 보기', '顯示 PIN', 'Show PIN'],
  'adm.pinHide': ['PIN 숨기기', '隱藏 PIN', 'Hide PIN'],
  'adm.pinHint': [
    'PIN 없이도 잔액·아이템 현황은 자유롭게 볼 수 있습니다. 등록·분배·지급만 관리자 전용입니다.',
    '沒有 PIN 也可以自由檢視餘額和物品。只有登記·分配·發放才需要管理員。',
    'Anyone can view balances and items without a PIN. Only registering, distributing and paying out need admin.',
  ],
  'adm.emailSect': ['📧 기록용 이메일', '📧 記錄用郵箱', '📧 Email for the audit log'],
  'adm.emailHint': [
    '누가 등록·분배·지급했는지 시트 [작업기록]에 남기기 위한 값입니다. 이 기기에만 저장되고 다른 사람에게 보이지 않습니다.',
    '用於在表格[操作記錄]中留下誰做了登記·分配·發放。只儲存在本裝置，其他人看不到。',
    'Recorded in the sheet’s audit log so you can see who did what. Stored only on this device.',
  ],
  'adm.emailSaved': ['저장했습니다: {v}', '已儲存：{v}', 'Saved: {v}'],
  'adm.emailCleared': ['이메일을 지웠습니다.', '已清除郵箱。', 'Email cleared.'],
  'adm.installSect': ['📲 앱처럼 쓰기', '📲 像應用一樣使用', '📲 Use it like an app'],
  'adm.installed': ['✅ 홈 화면 앱으로 실행 중입니다.', '✅ 正在以主螢幕應用方式執行。', '✅ Running as a home-screen app.'],
  'adm.installIos': [
    'iPhone — 사파리 하단 공유(⬆️) → "홈 화면에 추가"',
    'iPhone — Safari 底部分享(⬆️) →「新增到主螢幕」',
    'iPhone — Safari share (⬆️) → “Add to Home Screen”',
  ],
  'adm.installAos': [
    'Android — 크롬 우측 상단 ⋮ → "앱 설치"',
    'Android — Chrome 右上角 ⋮ →「安裝應用」',
    'Android — Chrome ⋮ menu → “Install app”',
  ],
  'adm.installHint': [
    '홈 화면에서 열면 주소창 없이 전체화면으로 뜹니다.',
    '從主螢幕開啟時會全屏顯示，沒有位址列。',
    'Opening from the home screen gives you full screen with no address bar.',
  ],
  'adm.healthSect': ['🩺 설정 점검', '🩺 設定檢查', '🩺 Setup check'],
  'adm.healthBtn': ['연결 상태 확인하기', '檢查連線狀態', 'Check the connection'],
  'adm.healthHint': [
    '화면이 계속 안 뜬다면 여기서 어떤 환경변수가 비었는지, 구글시트 연결이 되는지 바로 볼 수 있습니다.',
    '如果畫面一直打不開，可以在這裡看到哪個環境變數是空的、表格是否連上。',
    'If the app will not load, this shows which env vars are missing and whether the sheet is reachable.',
  ],

  /* ── 공유 카드 ── */
  'share.sect': ['📤 길드원에게 공유하기', '📤 分享給血盟成員', '📤 Share with the guild'],
  'share.qrAlt': ['앱 주소 QR 코드', '應用地址二維碼', 'QR code for the app link'],
  'share.caption': ['길드 전용 정산 앱', '血盟專用結算應用', 'Guild settlement app'],
  'share.share': ['공유', '分享', 'Share'],
  'share.copy': ['링크 복사', '複製連結', 'Copy link'],
  'share.copied': ['🔗 링크를 복사했습니다.', '🔗 已複製連結。', '🔗 Link copied.'],
  'share.copyFailed': [
    '복사에 실패했습니다. 주소창의 주소를 직접 복사해주세요.',
    '複製失敗，請手動複製位址列中的地址。',
    'Copy failed — please copy the address from the address bar.',
  ],
  'share.shareText': ['길드 다이아 정산 현황 보기', '檢視血盟鑽石結算情況', 'See the guild settlement status'],
  'share.hint': [
    '이 링크를 받은 사람은 조회만 할 수 있습니다. 등록·분배·지급은 PIN을 아는 관리자만 가능하니 그대로 공유하셔도 됩니다.',
    '收到此連結的人只能檢視。登記·分配·發放只有知道 PIN 的管理員才能做，可以放心分享。',
    'Anyone with this link can only view. Registering, distributing and paying out need the admin PIN, so it is safe to share.',
  ],

  /* ── 서버 고르기 · 일괄 지정 (v10.8.5) ── */
  'sv.more': ['다른 서버 {n}개', '其他 {n} 個伺服器', '{n} more servers'],
  'sv.title': ['서버 일괄 지정', '批次設定伺服器', 'Assign servers in bulk'],
  'sv.sub': [
    '서버를 고르고 사람을 체크하면 한 번에 지정됩니다.',
    '先選伺服器，再勾選成員，一次性設定。',
    'Pick a server, tick the members, apply once.',
  ],
  'sv.pickServer': ['① 어느 서버로 지정할까요?', '① 設定到哪個伺服器？', '① Which server?'],
  'sv.pickPeople': ['② 지정할 사람 — {n}명 선택됨', '② 選擇成員 — 已選 {n} 人', '② Pick members — {n} selected'],
  'sv.onlyEmpty': [
    '서버가 비어 있는 사람만 보기 ({n}명)',
    '只顯示未設定伺服器的人（{n} 人）',
    'Only those without a server ({n})',
  ],
  /* 클래스로 좁혀 보기 (v11.6.1) — 클래스 이름 13종은 CLASS_I18N 에 있다 */
  /* 앱 안 설명서 (v11.7) */
  'tab.manual': ['설명서', '使用說明', 'Guide'],
  'home.manualSub': ['한 · 中 · EN', '韓 · 中 · EN', 'KR · TW · EN'],
  'man.intro': [
    '화면 언어를 바꾸면 이 설명서도 같이 바뀝니다. 관리자용 내용은 관리자 모드일 때만 나옵니다.',
    '切換畫面語言時，本說明也會跟著改變。管理員專用內容只在管理員模式下顯示。',
    'This guide follows your language. Admin sections appear only in admin mode.',
  ],
  'man.more': [
    '더 자세한 그림 설명서는 혈맹 채팅방에 올려둔 링크에서 볼 수 있습니다.',
    '更詳細的圖解說明，請見血盟聊天室分享的連結。',
    'A fuller illustrated guide is linked in the guild chat.',
  ],
  'cls.filter': ['클래스로 좁혀 보기', '按職業篩選', 'Filter by class'],
  /* 고르지 않은 상태의 문구다 — 인원수는 넣지 않는다. 각 클래스 줄에 이미 붙어 있고,
     닫힌 드롭다운에 숫자가 보이면 "지금 그만큼 걸러져 있다"로 잘못 읽힌다 */
  'cls.all': ['클래스 선택', '選擇職業', 'Select class'],
  'cls.none': ['클래스 미지정 ({n})', '未設職業（{n}）', 'No class ({n})'],

  'sv.none': ['미지정', '未設定', 'none'],
  'sv.noneChip': ['서버 미지정', '未設伺服器', 'No server'],

  'sv.allDone': [
    '서버가 비어 있는 사람이 없습니다.',
    '沒有未設定伺服器的成員。',
    'Everyone already has a server.',
  ],
  'sv.apply': ['{n}명을 {s} 서버로 지정', '將 {n} 人設為 {s} 服', 'Assign {n} to server {s}'],
  'sv.applying': ['지정 중… ({done}/{total})', '設定中…（{done}/{total}）', 'Applying… ({done}/{total})'],
  'sv.applied': ['✅ {n}명을 {s} 서버로 지정했습니다.', '✅ 已將 {n} 人設為 {s} 服。', '✅ Assigned {n} to server {s}.'],
  'sv.partial': [
    '⚠️ {n}명은 {s} 서버로 지정했지만 {failN}명은 실패했습니다: {failList}',
    '⚠️ 已將 {n} 人設為 {s} 服，但 {failN} 人失敗：{failList}',
    '⚠️ Assigned {n} to server {s}, but {failN} failed: {failList}',
  ],
  'sv.hint': [
    '한 명씩 차례로 저장하므로 인원이 많으면 조금 걸립니다. 중간에 실패한 사람이 있으면 이름을 알려드립니다.',
    '會逐個儲存，人多時需要一點時間。若中途有失敗，會列出姓名。',
    'Saved one by one, so a large batch takes a moment. Any failures are listed by name.',
  ],
  'sv.needAssign': [
    '⚠️ 서버가 비어 있는 혈맹원이 {n}명입니다. [🗂️ 서버 일괄 지정]으로 채워두면 아이템 등록에서 서버로 걸러낼 수 있습니다.',
    '⚠️ 有 {n} 名成員未設定伺服器。用[🗂️ 批次設定伺服器]填好後，登記物品時就能按伺服器篩選。',
    '⚠️ {n} members have no server yet. Fill them in with [🗂️ Assign servers in bulk] so item registration can filter by server.',
  ],

  /* ── 혈맹원 관리 ── */
  'ros.sect': ['👥 혈맹원 관리', '👥 血盟成員管理', '👥 Members'],
  'ros.add': ['➕ 혈맹원 추가', '➕ 新增成員', '➕ Add member'],
  'ros.addHint': [
    '한 명이든 여럿이든 [혈맹원 추가]에서 넣습니다 (직접 입력·사진 모두). 게임에서 아이디를 바꾼 사람은 아래에서 눌러 수정하세요 — 잔액과 참여횟수는 새 이름으로 그대로 따라갑니다.',
    '一個人或多個人都用[新增成員]（可手輸，也可拍照）。遊戲裡改過 ID 的人，點下方修改即可 — 餘額和參與次數會跟著新名稱轉移。',
    'Add one member or many from [Add member] (type or photo). To rename someone after an in-game change, tap them below — balance and join count follow.',
  ],
  'ros.loadFailed': ['명단을 불러오지 못했습니다.', '名單載入失敗。', 'Could not load the roster.'],
  'ros.fundBadge': ['운영비', '運營費', 'Fund'],

  /* ── 이전 아이디에서 기록 가져오기 (v10.9.1) ── */
  'ros.idTaken': [
    '⚠️ "{name}" 은(는) 이미 명단에 있는 아이디입니다. 그 사람의 기록을 이 아이디로 가져오시려면 아래 [⏪ 이전 아이디에서 불러오기]를 쓰세요.',
    '⚠️ "{name}" 已在名單中。若要把該成員的記錄轉到這個 ID，請使用下方的[⏪ 從舊 ID 轉入]。',
    '⚠️ "{name}" is already on the roster. To bring their records into this ID, use [⏪ Pull from an old ID] below.',
  ],
  'ros.pullOpen': ['이전 아이디에서 불러오기', '從舊 ID 轉入', 'Pull from an old ID'],
  'ros.pullOpenHint': [
    '게임에서 아이디를 바꾼 사람을 먼저 새 아이디로 넣어두셨다면, 여기서 옛 아이디를 골라 분배전·분배완료·참여횟수를 가져올 수 있습니다.',
    '如果該成員改名後先以新 ID 新增，可在此選擇舊 ID，把待分配·已發放·參與次數一併轉入。',
    'If you added the new ID first, pick the old one here to bring over the balance, payout total and participation count.',
  ],
  'ros.pullTitle': ['⏪ 이전 아이디에서 불러오기', '⏪ 從舊 ID 轉入', '⏪ Pull from an old ID'],
  'ros.pullSub': ['기록을 "{v}" 로 가져옵니다.', '把記錄轉入 "{v}"。', 'Records will move into "{v}".'],
  'ros.pullNote': [
    '누구의 기록을 가져올지 고르세요. 옆의 금액이 이 아이디로 따라옵니다.',
    '請選擇要轉入誰的記錄。右側金額會一併轉過來。',
    'Pick whose records to bring over. The amount shown will follow.',
  ],
  'ros.pullNone': ['가져올 수 있는 다른 아이디가 없습니다.', '沒有可轉入的其他 ID。', 'No other ID to pull from.'],
  'ros.pullHint': [
    '고른 아이디는 사라지고 기록만 이 아이디로 넘어옵니다. 실행 전에 금액을 한 번 더 보여드립니다. (지난 시즌 기록은 그때의 이름 그대로 남습니다)',
    '所選 ID 會消失，記錄轉入本 ID。執行前會再確認一次金額。（歷史賽季記錄仍保留當時的名字）',
    'The picked ID disappears and its records move here. The amounts are shown once more before applying. (Past-season records keep the old name.)',
  ],
  'ros.id': ['아이디', 'ID', 'ID'],
  'ros.idHint': [
    '게임에서 보이는 이름과 정확히 같게 입력하세요. 띄어쓰기·괄호·한자까지 그대로여야 인증샷에서 자동으로 찾아냅니다.',
    '請輸入與遊戲中顯示完全一致的名稱。空格、括號、漢字都要一樣，截圖才能自動識別。',
    'Type it exactly as the game shows it — spaces, brackets and hanja included — so screenshots match.',
  ],
  'ros.memberTitle': ['👤 혈맹원 관리', '👤 成員管理', '👤 Member'],
  'ros.current': ['현재: {v}', '當前：{v}', 'Currently: {v}'],
  'ros.carried': ['따라오는 분배전', '跟隨轉移的待發放', 'Unpaid carried over'],
  'ros.oldDisplay': ['기존 게임표시명', '原遊戲顯示名', 'Previous in-game name'],
  'ros.rename': ['변경하기', '確認修改', 'Rename'],
  'ros.weight': ['분배비중 (%)', '分配比例（%）', 'Share of the split (%)'],
  'ros.weightHint': [
    '기본 1인당 금액의 이 비율만 받습니다. 남는 금액은 전액 혈맹운영비로 귀속됩니다. 이미 분배된 아이템에는 영향이 없습니다 (그때 금액이 그대로 기록돼 있습니다).',
    '只領取基礎每人金額的這個比例。剩餘金額全部歸入血盟運營費。對已分配的物品沒有影響（當時的金額已原樣記錄）。',
    'They receive this share of the base per-head amount; the rest goes entirely to the guild fund. Already-distributed items are unaffected — those amounts are recorded as paid.',
  ],
  'ros.byServer': ['서버로 좁혀 보기', '按伺服器篩選', 'Filter by server'],
  /* 티어는 시트에 '3티어' 로 저장되지만 화면에는 언어별로 그린다 —
     아이템 이름과 달리 '티어'는 고유명사가 아니라 일반 명사다 */
  'item.tierN': ['{n}티어', '{n}階', 'Tier {n}'],
  'ros.cls': ['클래스', '職業', 'Class'],
  'ros.clsNone': ['고르지 않음', '未選擇', 'Not set'],
  'ros.hanja': ['한자표기 (중문)', '漢字標註（中文）', 'Hanja spelling (Chinese)'],
  'ros.hanjaPh': ['예: 车武植', '例：車武植', 'e.g. 车武植'],
  'ros.hanjaHint': [
    '[잔액]·[아이템]·[내 정보]에 "{v}" 로 함께 나옵니다. 이름은 시스템이 추측하지 않습니다 — 게임에서 쓰는 표기를 직접 확인해 넣어주세요. 아이디에 이미 괄호로 한자가 붙어 있으면 비워두셔도 됩니다.',
    '會在[餘額]·[物品]·[我的]中以「{v}」顯示。系統不會猜測名稱 — 請自行確認遊戲中使用的寫法後填入。如果 ID 裡已用括號寫了漢字，這裡可以留空。',
    'Appears as “{v}” under [Balance], [Items] and [Me]. The system never guesses a name — check the in-game spelling yourself. Leave it blank if the ID already carries the hanja in brackets.',
  ],
  'ros.nameOkRestFailed': [
    '아이디는 바뀌었지만 나머지 설정은 저장되지 않았습니다. 다시 열어 저장해주세요.',
    'ID 已修改，但其餘設定未儲存。請重新開啟後再儲存一次。',
    'The ID was changed but the other settings were not saved. Reopen and save again.',
  ],
  'ros.remove': ['➖ 탈퇴 처리', '➖ 退盟處理', '➖ Remove from roster'],
  'ros.removeHint': [
    '명단에서만 빼고 기록은 남깁니다. 잔액이나 참여 이력이 있으면 잔액현황에 "(미등록)"으로 보존되고, 이력이 전혀 없을 때만 목록에서 사라집니다.',
    '只從名單移除，記錄會保留。如果還有餘額或參與記錄，會以「(未登記)」儲存在餘額表中；完全沒有記錄時才會從列表消失。',
    'Removes them from the roster but keeps the records. With any balance or history they stay as “(unlisted)”; only a completely empty record disappears.',
  ],
  'ros.mergeTitle': ['⚠️ 계정을 합칩니다', '⚠️ 將合併賬號', '⚠️ These accounts will be merged'],
  'ros.confirmTitle': ['⚠️ 확인이 필요합니다', '⚠️ 需要確認', '⚠️ Please confirm'],
  'ros.merge': ['합치기', '確認合併', 'Merge'],
  'ros.removeDo': ['탈퇴 처리', '確認退盟', 'Remove'],
  'ros.histSect': ['🕘 아이디 변경 이력', '🕘 ID 變更記錄', '🕘 Rename history'],
  'ros.histOpen': ['이력 보기', '檢視記錄', 'Show history'],
  'ros.histHint': [
    '누가 언제 어떤 이름에서 어떤 이름으로 바뀌었는지 [작업기록]에서 가져옵니다.',
    '從[操作記錄]中讀取誰在何時把名稱從什麼改成了什麼。',
    'Read from the sheet’s audit log: who changed which name, when.',
  ],
  'ros.histEmpty': ['아직 아이디를 바꾼 기록이 없습니다.', '還沒有修改 ID 的記錄。', 'No renames recorded yet.'],
  'ros.merged': ['병합', '已合併', 'merged'],

  /* ── 아이템 정정·삭제 ── */
  'led.sect': ['🗂️ 등록된 모든 아이템 — 정정 · 삭제', '🗂️ 所有已登記物品 — 更正 · 刪除', '🗂️ All items — correct or delete'],
  'led.empty': ['등록된 아이템이 없습니다.', '沒有已登記的物品。', 'No items registered.'],
  'led.currentAmount': ['지금 분배된 금액', '當前已分配金額', 'Currently distributed'],
  'led.notDistributed': [
    '아직 분배되지 않은 아이템입니다. 되돌릴 금액이 없습니다.',
    '這是尚未分配的物品，沒有可撤回的金額。',
    'This item has not been distributed, so there is nothing to reverse.',
  ],
  'led.blocked': [
    '⚠️ 되돌릴 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다.\n\n{v}\n\n먼저 [최근 지급 취소]로 지급을 되돌린 뒤 다시 시도하세요.',
    '⚠️ 無法撤回。以下物件已完成發放✓，待發放餘額不足。\n\n{v}\n\n請先用[撤銷最近發放]撤回發放後再試。',
    '⚠️ Cannot reverse. These members were already paid, so their unpaid balance is too low.\n\n{v}\n\nUndo the payout first with [Undo last payout], then try again.',
  ],
  'led.correct': ['🔄 판매금액 정정', '🔄 更正售出金額', '🔄 Correct the sale amount'],
  'led.delete': ['🗑️ 아이템 완전 삭제', '🗑️ 徹底刪除物品', '🗑️ Delete the item'],
  'led.newAmount': [
    '새 판매금액 ({unit}) — 비우면 되돌리기만 합니다',
    '新的售出金額（{unit}）— 留空則僅撤回',
    'New sale amount ({unit}) — leave blank to only reverse',
  ],
  'led.currentPh': ['현재 {v}', '當前 {v}', 'now {v}'],
  'led.newFund': ['새 {fund}', '新的 {fund}', 'New {fund}'],
  'led.newBase': ['새 기본 1인당 × {n}명', '新的基礎每人 × {n} 人', 'New base per head × {n}'],
  'led.newRemainder': ['잔여분 → {fund}', '剩餘 → {fund}', 'Remainder → {fund}'],
  'led.weightNote': [
    '비중이 100% 미만인 참여자가 있으면 그만큼 덜 받고, 남는 금액은 {fund}로 갑니다. 정확한 금액은 재분배 직후 결과 메시지에 나옵니다.',
    '如果有比例低於 100% 的參與者，會相應少領，剩餘部分歸入{fund}。準確金額會在重新分配後的結果訊息中顯示。',
    'Members set below 100% receive proportionally less, and the difference goes to {fund}. Exact figures appear in the result message.',
  ],
  'led.revertOnly': [
    '되돌리기만 하고 ⏳미분배 상태로 돌아갑니다.',
    '僅撤回並回到⏳未分配狀態。',
    'Reverses only and returns the item to ⏳ undistributed.',
  ],
  'led.revert': ['되돌리기', '撤回', 'Reverse'],
  'led.correctDo': ['정정하기', '確認更正', 'Correct'],
  'led.deleteNote': [
    '"{item}" 기록을 완전히 삭제합니다.\n되돌릴 수 없고, 참여자의 참여횟수도 이 항목만큼 줄어듭니다.\n삭제 이력 자체는 [작업기록]에 영구히 남습니다.',
    '將徹底刪除「{item}」的記錄。\n無法撤銷，參與者的參與次數也會相應減少。\n刪除這件事本身會永久記錄在[操作記錄]中。',
    'Deletes the record for “{item}” for good.\nThis cannot be undone, and participants lose a join count.\nThe deletion itself stays in the audit log.',
  ],
  'led.deleteAlsoRevert': [
    '분배된 금액은 먼저 자동으로 되돌립니다.',
    '已分配的金額會先自動撤回。',
    'Distributed amounts are reversed automatically first.',
  ],
  'led.deleteDo': ['삭제합니다', '確認刪除', 'Delete'],

  /* ── 관리 도구 ── */
  'tool.undoSect': ['↩️ 최근 지급 취소', '↩️ 撤銷最近發放', '↩️ Undo last payout'],
  'tool.payAmount': ['지급액', '發放金額', 'Amount paid'],
  'tool.undoBtn': ['이 지급 되돌리기', '撤回這筆發放', 'Undo this payout'],
  'tool.undoHint': [
    '분배완료 → 분배전으로 되돌립니다. 취소 이력은 [작업기록]에 남습니다.',
    '從已發放退回待發放。撤銷記錄會留在[操作記錄]中。',
    'Moves it back from paid to unpaid. The undo is recorded in the audit log.',
  ],
  'tool.undoNone': ['되돌릴 지급 기록이 없습니다.', '沒有可撤回的發放記錄。', 'No payout to undo.'],
  'tool.undoTitle': ['↩️ 지급 취소', '↩️ 撤銷發放', '↩️ Undo payout'],
  'tool.undoNote': [
    '{v} 를 분배완료에서 분배전으로 되돌립니다.\n실제로 다이아를 이미 건네주셨다면 되돌리지 마세요.',
    '把 {v} 從已發放退回待發放。\n如果實際上已經把鑽石給出去了，請不要撤回。',
    'Moves {v} back from paid to unpaid.\nDo not undo it if you have already handed the diamonds over.',
  ],
  'tool.sect': ['🧰 관리 도구', '🧰 管理工具', '🧰 Admin tools'],
  'tool.irreversible': ['되돌릴 수 없음', '不可撤銷', 'irreversible'],
  'tool.phraseNote': [
    '이 작업은 되돌릴 수 없습니다.\n정말 실행하려면 아래에 "{v}" 을(를) 정확히 입력하세요.',
    '此操作無法撤銷。\n確定要執行請在下面準確輸入「{v}」。',
    'This cannot be undone.\nTo go ahead, type “{v}” below exactly.',
  ],
  'tool.phraseAria': ['확인 문구', '確認文字', 'Confirmation phrase'],

  /* ── 마스터 ── */
  'mst.sect': ['👑 마스터관리자 전용', '👑 主管理員專用', '👑 Master admin only'],
  'mst.appName': ['앱 이름', '應用名稱', 'App name'],
  'mst.appNameBtn': ['앱 이름 바꾸기', '修改應用名稱', 'Change app name'],
  'mst.appNameHint': [
    '앱 상단에 표시되는 이름입니다. 모든 사람에게 바로 반영됩니다. 이름이 길면 엔터로 줄을 바꿔 두 줄로 만들 수 있습니다 (24자, 2줄까지).',
    '顯示在應用頂部的名稱，會立即對所有人生效。名稱較長時可以按回車換行，最多兩行（24 字以內）。',
    'The name shown at the top of the app. Everyone sees it immediately. For long names press Enter to split it into two lines (24 chars, 2 lines max).',
  ],
  'mst.newPin': ['새 관리자 PIN', '新的管理員 PIN', 'New admin PIN'],
  'mst.newPinPh': [
    '6~32자 (비우면 환경변수 PIN으로 복귀)',
    '6~32 位（留空則恢復為環境變數 PIN）',
    '6–32 chars (blank restores the env-var PIN)',
  ],
  'mst.newPinAgain': ['한 번 더 입력', '再輸入一次', 'Type it again'],
  'mst.pinBtn': ['관리자 PIN 바꾸기', '修改管理員 PIN', 'Change admin PIN'],
  'mst.pinMismatch': ['두 번 입력한 PIN이 서로 다릅니다.', '兩次輸入的 PIN 不一致。', 'The two PINs do not match.'],
  'mst.pinHint': [
    '관리자가 바뀔 때 쓰세요. 바꾸는 즉시 기존 관리자는 다음 로그인부터 새 PIN이 필요합니다 (이미 잠금 해제된 기기는 30일 세션이 끝날 때까지 유지되므로, 급하면 그 사람에게 [관리] 탭에서 잠그도록 알려주세요). 마스터 PIN 자체는 Vercel 환경변수 MASTER_PIN 에서만 바꿉니다.',
    '換管理員時使用。修改後原管理員下次登入起需要新 PIN（已解鎖的裝置會保持到 30 天會話結束，著急的話請讓對方在[管理]標籤鎖定）。主管理員 PIN 本身只能在 Vercel 環境變數 MASTER_PIN 中修改。',
    'Use this when the admin changes. From then on the old admin needs the new PIN at next sign-in (already-unlocked devices keep their 30-day session — ask them to lock it from [Admin] if it is urgent). The master PIN itself changes only via the Vercel env var MASTER_PIN.',
  ],

  /* ── 혈맹원 일괄 추가 (v10.4) ── */
  'bulk.title': ['혈맹원 추가', '新增成員', 'Add members'],
  'bulk.sub': [
    '한 명이든 여럿이든 여기서 넣습니다. 넣기 전에 한 줄씩 확인합니다.',
    '一個人或多個人都在這裡新增。寫入前會逐行確認。',
    'One member or many — all added here, and every line is checked first.',
  ],
  'bulk.pasteLabel': ['이름 입력 · 명단 붙여넣기', '輸入姓名 · 貼上名單', 'Type a name or paste a roster'],
  'bulk.pastePh': ['한 줄에 한 명씩 (한 명만 넣어도 됩니다)', '每行一個人（也可以只加一個）', 'One name per line (a single name is fine)'],
  'bulk.pasteHint': [
    '한 명만 넣으실 때도 여기에 이름 하나만 적으시면 됩니다. 쉼표·줄바꿈 어느 쪽으로 구분해도 되고, 앞의 번호(1. 2.)와 [혈맹·서버] 표시는 알아서 떼어냅니다.',
    '只加一個人時，寫一個名字即可。用逗號或換行分隔都可以；前面的編號（1. 2.）和[血盟·伺服器]標記會自動去掉。',
    'For a single member just type one name. Commas or line breaks both work; leading numbers (1. 2.) and [clan/server] tags are stripped.',
  ],
  'bulk.fromPhoto': ['사진에서 읽기', '從照片識別', 'Read from a photo'],
  'bulk.photoHint': [
    '게임 명단 스크린샷을 넣으면 글자를 읽어옵니다.\n· 한자 이름은 글자가 작으면 잘 안 읽힙니다 — 명단 부분만 크게 잘라서 넣어주세요\n· 화면을 확대한 뒤 찍거나, 한 번에 다 넣지 말고 나눠서 두세 번 읽는 편이 정확합니다\n· 그래도 빠지면 [인식된 텍스트 보기]로 확인하고 손으로 고쳐주세요',
    '可以識別遊戲名單截圖。\n· 漢字名稱在字太小時不易識別 — 請把名單部分放大裁切後再上傳\n· 先放大螢幕再截圖，或分兩三次讀取會更準確\n· 若仍有遺漏，請用[檢視識別文字]確認並手動修正',
    'Reads a roster screenshot.\n· Hanja names need large glyphs — crop to just the name list\n· Zoom in before capturing, or read the list in two or three batches\n· If names are still missing, open [Show recognised text] and fix them by hand',
  ],
  'bulk.analyze': ['확인하기', '開始檢查', 'Check'],
  'bulk.serverLabel': ['서버 지정', '指定伺服器', 'Assign a server'],
  'bulk.serverHint': [
    '이번에 추가·개명한 사람에게만 반영됩니다. 기존 멤버의 서버는 건드리지 않습니다.',
    '只對本次新增·改名的人生效，不會改動已有成員的伺服器。',
    'Applies only to the people added or renamed here — existing members are untouched.',
  ],
  'bulk.stNew': ['신규', '新增', 'New'],
  'bulk.stRename': ['개명 후보', '疑似改名', 'Possible rename'],
  'bulk.stExists': ['이미 있음', '已存在', 'Already listed'],
  'bulk.stDup': ['입력 중복', '重複輸入', 'Duplicate'],
  'bulk.stInvalid': ['확인 필요', '需要確認', 'Needs a look'],
  'bulk.opAdd': ['신규', '新增', 'New'],
  'bulk.opRename': ['개명', '改名', 'Rename'],
  'bulk.opSkip': ['건너뜀', '跳過', 'Skip'],
  'bulk.fromLabel': ['바뀌기 전 이름', '原名', 'Previous name'],
  'bulk.fromPick': ['— 누구였는지 고르세요 —', '— 請選擇原來是誰 —', '— pick who this was —'],
  'bulk.suggestMark': ['(비슷함)', '（相似）', '(similar)'],
  'bulk.takenMark': ['— {by} 가 선택함', '— 已被 {by} 選擇', '— taken by {by}'],
  'bulk.pickRequired': [
    '누구였는지 골라야 반영됩니다.',
    '需要選擇原來是誰才能生效。',
    'Pick who this was before it can be applied.',
  ],
  'bulk.useOcr': ['읽은 글자를 입력칸에 넣기', '把識別的文字填入輸入框', 'Put the read text in the box'],
  /* ★ "지난 시즌 기록도 넘어간다"고 적어두었었지만 사실이 아니다 (v10.9).
     시즌1·시즌2 시트는 그 시점에 얼어붙은 기록이고 개명은 건드리지 않는다 —
     지난 기록을 나중에 고쳐 쓰면 "기록은 지워지지 않는다"는 약속이 깨진다. */
  'bulk.renameNote': [
    '개명으로 지정하면 그 사람의 분배전·분배완료·참여횟수가 새 이름으로 그대로 넘어갑니다. 새로 추가하면 0부터 시작합니다. (지난 시즌 기록은 그때의 이름 그대로 남습니다)',
    '選擇"改名"會把該成員的待分配·已發放·參與次數轉到新名字；選擇"新增"則從 0 開始。（歷史賽季記錄仍保留當時的名字）',
    'Renaming carries the balance, payout total and participation count over. Adding starts from zero. (Past-season records keep the name used back then.)',
  ],
  'bulk.cleaned': [
    '읽은 줄: {raw} — [혈맹·서버] 표시를 떼어냈습니다',
    '識別原文：{raw} — 已去掉[血盟·伺服器]標記',
    'Read as: {raw} — the [clan/server] tag was removed',
  ],
  'bulk.apply': ['추가 {add} · 개명 {ren} 반영', '新增 {add} · 改名 {ren}', 'Apply {add} add · {ren} rename'],
  'bulk.overCap': [
    '정원을 넘습니다 — 추가 {n}명, 남은 자리 {room}명.',
    '超出上限 — 要新增 {n} 人，僅剩 {room} 個位置。',
    'Over capacity — {n} to add but only {room} slots left.',
  ],

  /* ── 결과 메시지 (앱이 직접 만드는 것) ── */
  'r.saved': ['저장했습니다.', '已儲存。', 'Saved.'],
  'r.deleted': ['삭제했습니다.', '已刪除。', 'Deleted.'],
  'r.deleteFailed': ['삭제하지 못했습니다.', '刪除失敗。', 'Could not delete.'],
  'r.registered': ['등록되었습니다.', '已登記。', 'Registered.'],
  'r.registerFailed': ['등록에 실패했습니다.', '登記失敗。', 'Could not register.'],
  'r.distributed': ['분배했습니다.', '已分配。', 'Distributed.'],
  'r.distributeFailed': ['분배에 실패했습니다.', '分配失敗。', 'Could not distribute.'],
  'r.paid': ['지급했습니다.', '已發放。', 'Paid out.'],
  'r.payFailed': ['지급에 실패했습니다.', '發放失敗。', 'Could not pay out.'],
  'r.changed': ['변경했습니다.', '已修改。', 'Changed.'],
  'r.changeFailed': ['변경하지 못했습니다.', '修改失敗。', 'Could not change.'],
  'r.removed': ['탈퇴 처리했습니다.', '已做退盟處理。', 'Removed from the roster.'],
  'r.removeFailed': ['처리하지 못했습니다.', '處理失敗。', 'Could not complete.'],
  'r.added': ['추가했습니다.', '已新增。', 'Added.'],
  'r.addFailed': ['추가하지 못했습니다.', '新增失敗。', 'Could not add.'],
  'r.done': ['처리했습니다.', '已處理。', 'Done.'],
  'r.failed': ['처리하지 못했습니다.', '處理失敗。', 'Could not complete.'],
  'r.undone': ['취소했습니다.', '已撤銷。', 'Undone.'],
  'r.undoFailed': ['취소하지 못했습니다.', '撤銷失敗。', 'Could not undo.'],
  'r.completed': ['완료했습니다.', '已完成。', 'Completed.'],
  'r.runFailed': ['실행하지 못했습니다.', '執行失敗。', 'Could not run.'],
  'r.posted': ['등록했습니다.', '已釋出。', 'Posted.'],
  'r.postFailed': ['등록하지 못했습니다.', '釋出失敗。', 'Could not post.'],
  'r.loginFailed': ['로그인에 실패했습니다.', '登入失敗。', 'Sign-in failed.'],
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
    '✅ 已登記「{item}」（{n}人）',
    '✅ Registered "{item}" ({n} members)',
  ],
  's.dist.ok': [
    '✅ "{item}" {amount}다이아 분배 완료 — {fund} {fundTotal} / {n}명 기본 {per}',
    '✅ 已分配「{item}」{amount}鑽石 — {fund} {fundTotal} / {n}人 每人 {per}',
    '✅ Distributed "{item}" {amount} dia — {fund} {fundTotal} / {n} members, base {per} each',
  ],
  's.pay.ok': [
    '✅ "{name}" {amount}다이아 지급 완료',
    '✅ 已向「{name}」發放 {amount}鑽石',
    '✅ Paid "{name}" {amount} dia',
  ],
  's.ren.ok': [
    '✅ "{from}" → "{to}" 변경 완료',
    '✅ 已將「{from}」改為「{to}」',
    '✅ Renamed "{from}" → "{to}"',
  ],
  's.ren.needMerge': [
    '"{to}" 은(는) 이미 명단에 있는 이름입니다.\n\n그대로 진행하면 두 계정이 하나로 합쳐집니다.\n· {from} 분배전 {fromPending}다이아\n· {to} 분배전 {toPending}다이아\n\n동일 인물이 맞을 때만 진행하세요.',
    '「{to}」已存在於名單中。\n\n繼續操作會把兩個賬號合併為一個。\n· {from} 待分配 {fromPending}鑽石\n· {to} 待分配 {toPending}鑽石\n\n確認是同一個人時再繼續。',
    '"{to}" is already on the roster.\n\nProceeding merges the two accounts into one.\n· {from} unpaid {fromPending} dia\n· {to} unpaid {toPending} dia\n\nContinue only if they are the same person.',
  ],
  's.add.ok': [
    '✅ "{name}" 을(를) 명단에 추가했습니다.',
    '✅ 已將「{name}」加入名單。',
    '✅ Added "{name}" to the roster.',
  ],
  's.rm.ok': [
    '✅ "{name}" 탈퇴 처리 완료',
    '✅ 已完成「{name}」的退盟處理。',
    '✅ Removed "{name}" from the roster.',
  ],
  's.rm.needConfirm': [
    '"{name}" 을(를) 명단에서 뺍니다.\n\n⚠️ 아직 받지 않은 분배전 잔액이 {pending}다이아 남아 있습니다.\n지급하지 않고 빼면 이 금액은 "(미등록)" 상태로 남습니다.\n\n그래도 진행할까요?',
    '將把「{name}」從名單中移除。\n\n⚠️ 仍有尚未領取的待分配餘額 {pending}鑽石。\n未發放就移除的話，這筆金額會以"(未登記)"狀態保留。\n\n仍要繼續嗎？',
    'This removes "{name}" from the roster.\n\n⚠️ {pending} dia is still unpaid.\nIf you remove them without paying out, that amount stays as "(unregistered)".\n\nProceed anyway?',
  ],
  's.cor.ok': [
    '✅ "{item}" 정정 완료 — {from} → {to}다이아\n{n}명 기본 {per} · 운영비 {fundTotal}',
    '✅ 已更正「{item}」— {from} → {to}鑽石\n{n}人 每人 {per} · 運營金 {fundTotal}',
    '✅ Corrected "{item}" — {from} → {to} dia\n{n} members, base {per} each · fund {fundTotal}',
  ],
  's.cor.revert': [
    '✅ "{item}" 되돌리기 완료 — 분배대기중 상태로 돌아갔습니다.',
    '✅ 已撤銷「{item}」的分配 — 回到待分配狀態。',
    '✅ Reverted "{item}" — back to the pending state.',
  ],
  's.cor.revertBadAmount': [
    '✅ 되돌리기는 완료했지만 새 금액이 올바르지 않아 재분배는 하지 않았습니다.',
    '✅ 已撤銷分配，但新金額不正確，因此沒有重新分配。',
    '✅ Reverted, but the new amount was invalid so nothing was redistributed.',
  ],
  's.cor.revertNoRedist': [
    '✅ 되돌리기는 완료했으나 재분배에 실패했습니다 ({reason}). [아이템] 탭에서 다시 분배해주세요.',
    '✅ 已撤銷分配，但重新分配失敗（{reason}）。請在[物品]標籤重新分配。',
    '✅ Reverted, but redistribution failed ({reason}). Distribute again from the [Items] tab.',
  ],
  's.cor.insufficient': [
    '정정할 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다:\n\n{list}',
    '無法更正。以下成員已發放✓，待分配餘額不足：\n\n{list}',
    'Cannot correct — these members were already paid out and lack the unpaid balance:\n\n{list}',
  ],
  's.cor.partial': [
    '되돌리기가 일부만 반영되어 중단했습니다.\n\n반영됨({okN}): {okList}\n실패({failN}): {failList}\n\n상태는 그대로 두었습니다.',
    '撤銷只完成了一部分，已中止。\n\n已完成（{okN}）：{okList}\n失敗（{failN}）：{failList}\n\n狀態保持不變。',
    'The reversal only partly applied, so it was stopped.\n\nApplied ({okN}): {okList}\nFailed ({failN}): {failList}\n\nThe status was left unchanged.',
  ],
  's.del.ok': [
    '✅ "{item}" 삭제 완료 — 참여횟수가 자동으로 재계산되었습니다.',
    '✅ 已刪除「{item}」— 參與次數已自動重新計算。',
    '✅ Deleted "{item}" — participation counts were recalculated.',
  ],
  's.del.insufficient': [
    '삭제할 수 없습니다. 아래 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다:\n\n{list}',
    '無法刪除。以下成員已發放✓，待分配餘額不足：\n\n{list}',
    'Cannot delete — these members were already paid out and lack the unpaid balance:\n\n{list}',
  ],
  's.del.partial': [
    '금액 되돌리기가 일부만 반영되어 삭제를 중단했습니다.\n\n반영됨({okN}): {okList}\n실패({failN}): {failList}\n\n행은 삭제하지 않았습니다.',
    '金額撤銷只完成了一部分，已中止刪除。\n\n已完成（{okN}）：{okList}\n失敗（{failN}）：{failList}\n\n該行未被刪除。',
    'The amount reversal only partly applied, so the delete was stopped.\n\nApplied ({okN}): {okList}\nFailed ({failN}): {failList}\n\nThe row was not deleted.',
  ],
  's.undo.ok': [
    '✅ "{name}" {amount}다이아가 분배전으로 복구되었습니다.',
    '✅ 「{name}」的 {amount}鑽石已恢復為待分配。',
    '✅ Restored {amount} dia to "{name}" as unpaid.',
  ],
  's.post.ok': ['✅ 글을 등록했습니다.', '✅ 已釋出。', '✅ Posted.'],
  's.post.noticeOk': ['✅ 공지를 등록했습니다.', '✅ 已釋出公告。', '✅ Notice posted.'],
  's.post.delOk': ['✅ 삭제했습니다.', '✅ 已刪除。', '✅ Deleted.'],
  /* v11.4 — 용어 사전 (국문 · 中文 · English) */
  's.e.termKo': [
    '한국어 표기를 넣어주세요.',
    '請填寫韓語名稱。',
    'Enter the Korean name.',
  ],
  's.e.termDup': [
    '"{item}" 은(는) 이미 용어 목록에 있습니다.',
    '「{item}」已在詞彙表中。',
    '"{item}" is already in the glossary.',
  ],
  's.e.termEmpty': ['넣을 용어가 없습니다.', '沒有可新增的詞彙。', 'Nothing to add.'],
  's.term.bulkOk': [
    '✅ 용어 {n}개를 넣었습니다. (이미 있어 건너뜀 {k}개)',
    '✅ 已新增 {n} 條詞彙（跳過已存在 {k} 條）。',
    '✅ Added {n} terms ({k} already existed).',
  ],
  's.term.saveOk': ['✅ "{item}" 을(를) 저장했습니다.', '✅ 已儲存「{item}」。', '✅ Saved "{item}".'],
  's.term.delOk': ['✅ "{item}" 을(를) 지웠습니다.', '✅ 已刪除「{item}」。', '✅ Deleted "{item}".'],

  /* v11.3 — 정산된 연합 건은 마스터만 고친다 (관리자는 미정산 건까지) */
  's.e.allyMasterOnly': [
    '"{item}" 은(는) 이미 정산된 건이라 마스터관리자만 고칠 수 있습니다.',
    '「{item}」已結算，只有主管理員可以修改。',
    '"{item}" is already settled — only the master admin can edit it.',
  ],
  's.e.allyDone': [
    '"{item}" 은(는) 이미 정산된 건입니다. 새로고침해주세요.',
    '「{item}」已結算，請重新整理。',
    '"{item}" is already settled. Refresh.',
  ],
  /* ── 연합 v11.0 — 여러 서버 · 서버별 인원 · 사진 여러 장 ── */
  's.ally.regMulti': [
    '✅ "{item}" 등록 완료 — 서버 {sv}곳 · {n}명 (금액은 팔린 뒤에)',
    '✅ 已登記 "{item}" — {sv} 個伺服器 · {n} 人（金額待售出後填）',
    '✅ Registered "{item}" — {sv} servers · {n} people (amount comes later)',
  ],
  's.ally.creditMulti': [
    '✅ "{item}" {amount} 정산 완료 — {fund} {fundTotal} · {where}',
    '✅ "{item}" {amount} 結算完成 — {fund} {fundTotal} · {where}',
    '✅ Settled "{item}" {amount} — {fund} {fundTotal} · {where}',
  ],
  's.ally.editOk': [
    '✅ "{item}" 정정 완료 — 서버 {sv}곳 · {n}명',
    '✅ 已修正 "{item}" — {sv} 個伺服器 · {n} 人',
    '✅ Corrected "{item}" — {sv} servers · {n} people',
  ],
  's.ally.editAsk': [
    '"{item}" 을(를) 정정하면 {fund} 가 {from} → {to} 로 바뀝니다. 확인 후 다시 실행해주세요.',
    '修正「{item}」後，{fund} 將從 {from} 變為 {to}。確認後請再次執行。',
    'Correcting "{item}" changes {fund} from {from} to {to}. Confirm and run it again.',
  ],
  's.ally.addSv': [
    '✅ "{item}" 에 서버 {sv}곳 · {n}명을 추가했습니다.',
    '✅ 已為「{item}」新增 {sv} 個伺服器 · {n} 人。',
    '✅ Added {sv} servers · {n} people to "{item}".',
  ],
  's.ally.delMulti': [
    '✅ 삭제했습니다 — {item} (적립 {credited} 회수 · {fund} 회수)',
    '✅ 已刪除 — {item}（收回累計 {credited} · 運營費 {fund}）',
    '✅ Deleted — {item} (reclaimed {credited} · fund {fund})',
  ],
  's.photo.count': [
    '📷 사진에서 {n}명으로 읽었습니다. 실제 인원과 다르면 숫자를 직접 고쳐주세요.',
    '📷 從照片中識別到 {n} 人。與實際人數不同請手動修改。',
    '📷 Read {n} people from the photo. Fix the number by hand if it is wrong.',
  ],
  's.photo.noCount': [
    '📷 사진은 저장했지만 인원수를 읽지 못했습니다. 직접 입력해주세요.',
    '📷 照片已儲存，但未能識別人數。請手動輸入。',
    '📷 The photo was saved but the head count could not be read. Enter it manually.',
  ],
  's.mem.ok': ['✅ {name} 정보를 저장했습니다.', '✅ 已儲存 {name} 的設定。', '✅ Saved settings for {name}.'],
  's.mem.noChange': ['바뀐 내용이 없습니다.', '沒有需要修改的內容。', 'Nothing changed.'],
  's.app.nameOk': [
    '✅ 앱 이름을 "{name}" 으로 바꿨습니다.',
    '✅ 已將應用名稱改為「{name}」。',
    '✅ App name changed to "{name}".',
  ],
  's.app.pinOk': [
    '✅ 관리자 PIN 을 바꿨습니다. 기존 관리자 기기는 다음 로그인부터 새 PIN 이 필요합니다.',
    '✅ 已修改管理員 PIN。原管理員的裝置從下次登入起需要新 PIN。',
    '✅ Admin PIN changed. Existing admin devices need the new PIN at next sign-in.',
  ],
  's.app.pinCleared': [
    '✅ 시트에 저장된 PIN 을 지웠습니다 — 환경변수 PIN 으로 돌아갑니다.',
    '✅ 已清除表格中儲存的 PIN — 恢復為環境變數 PIN。',
    '✅ Cleared the PIN stored in the sheet — back to the env-var PIN.',
  ],
  's.app.seasonServerOk': [
    '✅ 이번 시즌 서버를 "{server}" 로 설정했습니다.',
    '✅ 已將本賽季伺服器設為「{server}」。',
    '✅ This season’s server is now "{server}".',
  ],
  's.app.seasonServerCleared': [
    '✅ 시즌 서버명을 비웠습니다.',
    '✅ 已清空賽季伺服器名。',
    '✅ Cleared the season server name.',
  ],

  /* 서버가 돌려주는 오류 */
  's.e.badRequest': ['요청 형식이 올바르지 않습니다.', '請求格式不正確。', 'The request format is invalid.'],
  's.e.noToken': [
    'API 토큰이 아직 발급되지 않았습니다. 스프레드시트 메뉴에서 [🔑 웹 API 토큰]을 한 번 실행해주세요.',
    'API 令牌尚未發放。請在表格選單中執行一次[🔑 網頁 API 令牌]。',
    'The API token has not been issued yet. Run [🔑 Web API token] once from the spreadsheet menu.',
  ],
  's.e.auth': ['인증에 실패했습니다.', '認證失敗。', 'Authentication failed.'],
  's.e.busy': [
    '다른 작업이 처리 중입니다. 잠시 후 다시 시도해주세요.',
    '有其他操作正在處理中，請稍後再試。',
    'Another operation is in progress. Try again shortly.',
  ],
  's.e.server': ['서버 오류가 발생했습니다.', '發生伺服器錯誤。', 'A server error occurred.'],
  's.e.needConfirm': ['확인이 필요합니다.', '需要確認。', 'Confirmation is required.'],
  's.e.nameEmpty': ['아이디를 입력해주세요.', '請輸入 ID。', 'Enter an ID.'],
  's.e.nameLong': ['아이디가 너무 깁니다 (30자 이내).', 'ID 太長（30 字以內）。', 'That ID is too long (30 characters max).'],
  's.e.nameSame': ['기존 이름과 같습니다.', '與原來的名稱相同。', 'That is the same as the current name.'],
  's.e.fundLocked': [
    '혈비 계정({fund})은 앱에서 바꿀 수 없습니다. PC 시트에서 처리해주세요.',
    '血盟資金賬戶（{fund}）無法在應用中修改，請在電腦表格中處理。',
    'The guild fund account ({fund}) cannot be changed from the app. Use the spreadsheet.',
  ],
  's.e.noMember': [
    '"{name}" 을(를) 찾지 못했습니다. 새로고침 후 다시 시도해주세요.',
    '未找到「{name}」。請重新整理後重試。',
    'Could not find "{name}". Refresh and try again.',
  ],
  's.e.dupMember': ['"{name}" 은(는) 이미 명단에 있습니다.', '「{name}」已在名單中。', '"{name}" is already on the roster.'],
  's.e.maxMembers': [
    '멤버가 최대 인원({max}명)에 도달했습니다.',
    '成員已達上限（{max}人）。',
    'The roster is full ({max} members).',
  ],
  's.e.noSheet': ['{sheet} 시트를 찾을 수 없습니다.', '找不到「{sheet}」工作表。', 'Could not find the "{sheet}" sheet.'],
  's.e.noItem': [
    '아이템을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.',
    '找不到該物品。請重新整理後重試。',
    'Item not found. Refresh and try again.',
  ],
  's.e.notDone': [
    '분배완료 상태인 아이템만 정정할 수 있습니다.',
    '只有已分配的物品才能更正。',
    'Only distributed items can be corrected.',
  ],
  's.e.noNames': ['참여자 명단을 읽을 수 없습니다.', '無法讀取參與者名單。', 'The participant list could not be read.'],
  's.e.noParticipants': ['참여 멤버를 선택해주세요.', '請選擇參與成員。', 'Select the participating members.'],
  's.e.noPayout': ['취소할 지급 기록이 없습니다.', '沒有可撤銷的發放記錄。', 'There is no payout to undo.'],
  's.e.noPost': ['삭제할 글을 찾을 수 없습니다.', '找不到要刪除的帖子。', 'Could not find that post.'],
  's.e.postGone': ['이미 삭제된 글입니다.', '該帖子已被刪除。', 'That post was already deleted.'],
  's.e.boardEmpty': ['게시판이 비어 있습니다.', '公告板是空的。', 'The board is empty.'],
  's.e.noRecord': ['기록을 찾을 수 없습니다.', '找不到該記錄。', 'Could not find that record.'],
  's.e.titleEmpty': ['제목을 입력해주세요.', '請輸入標題。', 'Enter a title.'],
  's.e.titleLong': ['제목이 너무 깁니다 ({max}자 이내).', '標題太長（{max} 字以內）。', 'The title is too long ({max} characters max).'],
  's.e.bodyLong': ['내용이 너무 깁니다 ({max}자 이내).', '內容太長（{max} 字以內）。', 'The body is too long ({max} characters max).'],
  's.e.badServer': ['서버를 01~12 중에서 선택해주세요.', '請從 01~12 中選擇伺服器。', 'Pick a server from 01–12.'],
  's.e.badClass': ['클래스는 목록에서 선택해주세요.', '請從列表中選擇職業。', 'Pick a class from the list.'],
  's.meta.saveOk': ['✅ 저장했습니다.', '✅ 已儲存。', '✅ Saved.'],
  's.e.dupServer': [
    '{s}서버가 두 번 들어갔습니다. 한 줄로 합쳐주세요.',
    '{s} 服重複了，請合併成一行。',
    'Server {s} appears twice — merge it into one line.',
  ],
  's.e.noParts': [
    '참여자를 한 명 이상 골라주세요.',
    '請至少選擇一名參與者。',
    'Pick at least one participant.',
  ],
  's.item.editAsk': [
    '"{item}" 정정 — {from} → {to} · 참여 {fromN}명 → {toN}명. 확인 후 다시 실행해주세요.',
    '修正「{item}」— {from} → {to} · 參與 {fromN}人 → {toN}人。確認後請再次執行。',
    'Correcting "{item}" — {from} → {to} · {fromN} → {toN} people. Confirm and run it again.',
  ],
  's.item.editOk': [
    '✅ "{item}" 수정 완료 — 참여 {n}명',
    '✅ 已修改 "{item}" — 參與 {n} 人',
    '✅ Updated "{item}" — {n} participants',
  ],
  's.e.itemEmpty': ['아이템명을 입력해주세요.', '請輸入物品名稱。', 'Enter the item name.'],
  's.e.badAmount': ['금액은 양의 정수여야 합니다.', '金額必須是正整數。', 'The amount must be a positive whole number.'],
  's.e.badWeight': [
    '분배비중은 1~100 사이의 정수여야 합니다.',
    '分配比例必須是 1~100 之間的整數。',
    'The share must be a whole number from 1 to 100.',
  ],
  's.e.hanjaLong': ['한자표기가 너무 깁니다 (30자 이내).', '漢字標記太長（30 字以內）。', 'The Hanja name is too long (30 characters max).'],
  's.e.badPin': [
    'PIN 은 6~32자여야 하며 공백은 쓸 수 없습니다.',
    'PIN 必須為 6~32 位，且不能包含空格。',
    'The PIN must be 6–32 characters with no spaces.',
  ],
  's.e.appNameEmpty': ['앱 이름을 입력해주세요.', '請輸入應用名稱。', 'Enter the app name.'],
  's.e.appNameLong': ['앱 이름이 너무 깁니다 (20자 이내).', '應用名稱太長（20 字以內）。', 'The app name is too long (20 characters max).'],
  's.e.serverNameLong': ['서버 이름이 너무 깁니다 (20자 이내).', '伺服器名稱太長（20 字以內）。', 'The server name is too long (20 characters max).'],
  's.e.alreadyDone': ['이미 분배된 아이템입니다. 새로고침해주세요.', '該物品已分配，請重新整理。', 'That item is already distributed. Refresh.'],
  's.e.badRow': ['처리할 수 없는 행입니다.', '該行無法處理。', 'That row cannot be processed.'],
  's.e.payOver': [
    '⚠️ 지급액이 분배전({pending}다이아)보다 큽니다.',
    '⚠️ 發放金額超過待分配（{pending}鑽石）。',
    '⚠️ The payout is larger than the unpaid balance ({pending} dia).',
  ],
  's.bulk.analyzed': [
    '읽은 줄 {total} · 신규 {add} · 개명후보 {rename} · 이미있음 {exists} · 중복 {dup} · 확인필요 {invalid}',
    '共 {total} 行 · 新增 {add} · 疑似改名 {rename} · 已存在 {exists} · 重複 {dup} · 需確認 {invalid}',
    '{total} lines · {add} new · {rename} possible renames · {exists} already listed · {dup} duplicates · {invalid} need a look',
  ],
  's.auth.master': [
    '👑 마스터관리자 모드가 켜졌습니다.',
    '👑 已進入主管理員模式。',
    '👑 Master admin mode is on.',
  ],
  's.auth.admin': ['🔓 관리자 모드가 켜졌습니다.', '🔓 已進入管理員模式。', '🔓 Admin mode is on.'],
  's.auth.badPin': ['PIN이 올바르지 않습니다.', 'PIN 不正確。', 'That PIN is not correct.'],
  's.bulk.ocrSetup': [
    '📷 사진은 저장했지만 글자 인식 기능이 준비되지 않았습니다.\n\nApps Script 편집기 왼쪽 [서비스] → [+] → "Drive API" 를 추가한 뒤 저장하면 됩니다.\n지금 당장은 명단을 텍스트로 붙여넣어 주세요.',
    '📷 照片已儲存，但文字識別功能尚未啟用。\n\n請在 Apps Script 編輯器左側[服務] → [+] 新增 "Drive API" 並儲存。\n目前請先把名單貼上為文本。',
    '📷 The photo was saved but text recognition is not set up.\n\nIn the Apps Script editor, add "Drive API" under [Services] → [+] and save.\nFor now, paste the roster as text.',
  ],
  's.bulk.dupFrom': [
    '같은 아이디를 두 번 물려받도록 지정했습니다: {list}',
    '同一個 ID 被指定繼承了兩次：{list}',
    'The same ID was assigned twice: {list}',
  ],
  's.bulk.noFrom': [
    '명단에 없는 아이디를 지정했습니다: {list}\n새로고침 후 다시 시도해주세요.',
    '指定了名單中不存在的 ID：{list}\n請重新整理後重試。',
    'These IDs are not on the roster: {list}\nRefresh and try again.',
  ],
  's.bulk.noText': [
    '📷 사진은 저장했지만 글자를 읽지 못했습니다. 텍스트로 붙여넣어주세요.',
    '📷 照片已儲存，但沒能識別出文字。請直接貼上文本。',
    '📷 The photo was saved but no text could be read. Paste the list instead.',
  ],
  's.bulk.noName': [
    '읽어낸 이름이 없습니다. 한 줄에 한 명씩 붙여넣어주세요.',
    '沒有識別到名字。請每行填一個人。',
    'No names were found. Put one name per line.',
  ],
  's.bulk.nothing': ['처리할 대상이 없습니다.', '沒有需要處理的物件。', 'Nothing selected to apply.'],
  's.bulk.tooMany': [
    '한 번에 {max}명까지만 처리할 수 있습니다.',
    '一次最多處理 {max} 人。',
    'At most {max} people at a time.',
  ],
  's.bulk.overCap': [
    '정원을 넘습니다. 현재 {cur}명 + 추가 {add}명 > 최대 {max}명.',
    '超出上限。現有 {cur} 人 + 新增 {add} 人 > 上限 {max} 人。',
    'Over capacity: {cur} now + {add} new exceeds the {max} limit.',
  ],
  's.bulk.needConfirm': [
    '추가 {add}명 · 개명 {ren}명을 반영합니다.\n\n개명으로 지정한 건은 기존 잔액·참여횟수가 그대로 넘어갑니다.\n진행할까요?',
    '將新增 {add} 人 · 改名 {ren} 人。\n\n改名的成員會保留原有餘額與參與次數。\n繼續嗎？',
    'This adds {add} and renames {ren}.\n\nRenamed members keep their balance and participation count.\nProceed?',
  ],
  's.bulk.ok': [
    '✅ 추가 {add}명 · 개명 {ren}명 완료 (서버 반영 {set}명)',
    '✅ 已新增 {add} 人 · 改名 {ren} 人（伺服器已設定 {set} 人）',
    '✅ Added {add}, renamed {ren} ({set} got the server)',
  ],
  's.bulk.partial': [
    '⚠️ 추가 {add}명 · 개명 {ren}명 — 실패 {failN}건: {failList}',
    '⚠️ 新增 {add} 人 · 改名 {ren} 人 — 失敗 {failN} 項：{failList}',
    '⚠️ Added {add}, renamed {ren} — {failN} failed: {failList}',
  ],
  's.e.photoFailed': ['사진을 분석하지 못했습니다.', '照片分析失敗。', 'Could not analyse the photo.'],
  's.e.payZero': ['"{name}" 분배전 금액이 0입니다.', '「{name}」的待分配金額為 0。', '"{name}" has no unpaid balance.'],

  /* ── 레이드 (v10.8) — {day} 는 시트가 쓰는 '월'·'화' 표기 그대로 온다 ── */
  's.raid.addOk': [
    '✅ {day}요일 {time} "{boss}" 추가했습니다.',
    '✅ 已新增 {day} {time}「{boss}」。',
    '✅ Added "{boss}" at {time} on {day}.',
  ],
  's.raid.editOk': [
    '✅ {day}요일 {time} "{boss}" 으로 수정했습니다.',
    '✅ 已改為 {day} {time}「{boss}」。',
    '✅ Changed to "{boss}" at {time} on {day}.',
  ],
  's.raid.delOk': ['✅ 삭제했습니다.', '✅ 已刪除。', '✅ Deleted.'],
  's.raid.seedOk': [
    '✅ 보스 시간표 {n}건을 채웠습니다.',
    '✅ 已填入 {n} 條首領時間表。',
    '✅ Filled the timetable with {n} entries.',
  ],
  's.e.badDay': ['요일을 골라주세요.', '請選擇星期。', 'Pick a day of the week.'],
  's.e.badTime': [
    '시간을 24시간 형식(예 20:20)으로 넣어주세요.',
    '請用24小時制填寫時間（例 20:20）。',
    'Enter the time in 24-hour form (e.g. 20:20).',
  ],
  's.e.bossEmpty': ['보스 이름을 입력해주세요.', '請輸入首領名稱。', 'Enter the boss name.'],
  's.e.bossLong': [
    '보스 이름이 너무 깁니다 (40자 이내).',
    '首領名稱太長（40 字以內）。',
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
