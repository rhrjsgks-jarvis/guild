import type { GlyphName } from '@/components/Glyph';

/**
 * 앱 안에서 보는 설명서 (v11.7) — 한국어 · 繁體中文 · English.
 *
 * ★ **왜 앱 안에 넣었나.** 그림 설명서는 단톡방에 올리기 좋지만, 폰에서 확대해야
 *   읽히고 한국어 한 벌뿐이다. 대만 혈맹원은 그걸 읽을 수가 없었다.
 *   앱 안에 두면 화면 언어를 따라가고, 글자라 확대 없이 읽히며, 검색도 된다.
 * ★ **세 언어를 한 줄에 묶어 둔다.** 언어별 파일로 나누면 한쪽만 고쳐져 어긋나고,
 *   어느 것이 최신인지 아무도 모르게 된다 (사전 `lib/i18n.tsx` 와 같은 방식이다).
 * ★ 여기 적는 것은 **빠른 안내**다. 자세한 것은 그림 설명서에 있고, 마지막 절에서
 *   링크로 잇는다 — 같은 내용을 두 벌로 자세히 적으면 반드시 어긋난다.
 * ★ 버튼 이름을 인용할 때는 **앱이 실제로 보여주는 그 글자**를 쓴다. 다르게 적으면
 *   읽는 사람이 없는 버튼을 찾게 된다.
 */

/** [한국어, 繁體中文, English] */
export type Tri = [string, string, string];

export type ManualSection = {
  icon: GlyphName;
  title: Tri;
  /** 한 줄씩. 앞에 `**` 를 붙이면 굵게 나온다 */
  lines: Tri[];
  /** 관리자 모드에서만 보이는 절 — 혈맹원에게는 아예 그려지지 않는다 */
  admin?: true;
};

export const MANUAL: ManualSection[] = [
  /* ─────────── 누구나 ─────────── */
  {
    icon: 'home',
    title: ['시작하기', '開始使用', 'Getting started'],
    lines: [
      [
        '**로그인도 앱 설치도 없습니다.** 링크를 누르면 그냥 열립니다.',
        '**不需要登入，也不用安裝。** 點開連結就能直接使用。',
        '**No login, no install.** Just open the link.',
      ],
      [
        '브라우저 메뉴에서 [홈 화면에 추가]를 누르면 앱처럼 아이콘이 생깁니다.',
        '在瀏覽器選單中選「加入主畫面」，就會像 App 一樣出現圖示。',
        'Use your browser menu → "Add to Home Screen" to get an app icon.',
      ],
      [
        '혈맹원은 무엇을 눌러도 정산 자료를 망가뜨릴 수 없습니다 — 보기 전용입니다.',
        '一般成員無論點什麼都不會動到結算資料 — 只能檢視。',
        'Members can only view — nothing you tap can change the ledger.',
      ],
    ],
  },
  {
    icon: 'balance',
    title: ['내 다이아 보기', '查看我的鑽石', 'Your diamonds'],
    lines: [
      [
        '**주황색 숫자 = 아직 못 받은 것.** 관리자가 지급하면 0이 됩니다.',
        '**橘色數字 = 尚未領取的。** 管理員發放後就會歸零。',
        '**Orange = not yet received.** It becomes 0 once an admin pays out.',
      ],
      [
        '초록색 `완료`는 지금까지 실제로 받은 누적입니다.',
        '綠色的「已發放」是到目前為止實際領到的累計。',
        'Green "paid" is the running total you have actually received.',
      ],
      [
        '맨 위 혈맹운영비는 사람이 아니라 **길드 금고**입니다. 아무도 가져가지 않습니다.',
        '最上面的血盟營運費不是人，是**公會金庫**。沒有人會拿走。',
        'The top row is the guild treasury, not a person. Nobody takes it.',
      ],
      [
        '내 것만 크게 보려면 홈에서 [내 정보]를 여세요.',
        '只想看自己的話，請從主畫面開啟「我的資訊」。',
        'Open "Me" from home to see just your own numbers.',
      ],
    ],
  },
  {
    icon: 'search',
    title: ['좁혀 보기', '篩選檢視', 'Narrowing the list'],
    lines: [
      [
        '**서버는 여러 개**를 같이 고를 수 있고, **클래스는 한 번에 하나**입니다.',
        '**伺服器可以複選**，**職業一次只能選一個**。',
        '**Servers are multi-select; class is one at a time.**',
      ],
      [
        '둘을 같이 쓰면 겹칩니다 — 「01서버의 기사」처럼요.',
        '兩者可以疊加 — 例如「01 伺服器的騎士」。',
        'They combine — e.g. "Knights on server 01".',
      ],
      [
        '아무것도 안 고르면 전원이 나옵니다. **사람이 안 보이면 필터가 켜져 있는지** 보세요.',
        '什麼都不選就會顯示全部。**看不到某個人時，先確認篩選是否還開著。**',
        'Nothing selected shows everyone. If someone is missing, check the filters.',
      ],
    ],
  },
  {
    icon: 'items',
    title: ['아이템 이름 읽는 법', '如何看道具名稱', 'Reading item names'],
    lines: [
      [
        '테두리 색이 등급입니다 — **보라 = 전설, 황금 = 신화**.',
        '外框顏色代表等級 — **紫色＝傳說，金色＝神話**。',
        'The border is the grade — **purple = Legendary, gold = Mythic**.',
      ],
      [
        '**검정 테두리는 「모른다」**는 뜻입니다. 틀린 게 아니라 아직 사전에 없는 이름입니다.',
        '**黑色外框代表「不確定」** — 不是錯誤，只是還沒收錄進詞彙表。',
        '**Black means "unknown"** — not wrong, just not in the glossary yet.',
      ],
      [
        '이름 뒤 `3티어` 배지는 사전에 값이 있을 때만 붙습니다. 마법서·정수는 티어가 없는 것이 정상입니다.',
        '名稱後的「3階」標記只有詞彙表裡有值時才會出現。魔法書、精髓本來就沒有階級。',
        'The tier badge appears only when the glossary has one. Spellbooks have no tier.',
      ],
      [
        '사진이 붙은 것은 눌러서 **앱 안에서 바로** 봅니다.',
        '有照片的項目點一下就能**直接在 App 內**檢視。',
        'Tap a photo count to view the shots inside the app.',
      ],
    ],
  },
  {
    icon: 'board',
    title: ['게시판', '留言板', 'Board'],
    lines: [
      [
        '**앱에서 유일하게 혈맹원이 직접 쓸 수 있는 곳**입니다. PIN 이 필요 없습니다.',
        '**這是 App 中唯一開放成員直接發文的地方**，不需要 PIN。',
        'The only place members can post. No PIN needed.',
      ],
      [
        '잔액이 이상하거나 아이템 이름이 검정 테두리로 보이면 여기에 남겨주세요.',
        '如果餘額有問題，或道具名稱顯示黑框，請在這裡留言。',
        'Report odd balances or black-bordered item names here.',
      ],
      [
        '📌 공지는 관리자만 올릴 수 있고, 목록 맨 위에 고정됩니다.',
        '公告只有管理員能發布，並會固定在列表最上方。',
        'Notices are admin-only and pinned to the top.',
      ],
    ],
  },
  {
    icon: 'lang',
    title: ['언어 · 공유', '語言與分享', 'Language & sharing'],
    lines: [
      [
        '한국어 / 繁體中文 / English 세 가지입니다.',
        '共有韓文 / 繁體中文 / English 三種。',
        'Korean, Traditional Chinese, and English.',
      ],
      [
        '언어를 바꾸면 **아이템·보스 이름까지** 같이 바뀝니다. 사전에 채워진 것만 바뀌고, 없으면 한국어 그대로입니다 — 지어내서 번역하지 않습니다.',
        '切換語言時**連道具與首領名稱**也會跟著變。只有詞彙表已填寫的才會翻譯，沒有的就維持韓文 — 我們不會自行編造。',
        'Item and boss names follow the language too — but only if the glossary has them. We never invent a translation.',
      ],
      [
        '[공유]를 누르면 지금 보고 있는 내용이 **글자로** 나갑니다. 화면 사진이 아니라 글자라 확대 없이 읽히고 나중에 검색도 됩니다.',
        '按「分享」會把目前畫面內容以**文字**送出。不是截圖，所以不用放大就能讀，之後也搜尋得到。',
        'Share exports the current view as text — readable without zooming and searchable later.',
      ],
    ],
  },

  /* ─────────── 관리자 전용 ─────────── */
  {
    admin: true,
    icon: 'crown',
    title: ['권한은 세 단계', '權限分三級', 'Three permission levels'],
    lines: [
      [
        '**혈맹원** — 보기 + 게시판 글쓰기.',
        '**成員** — 檢視＋留言板發文。',
        '**Member** — view, plus posting on the board.',
      ],
      [
        '**관리자** — 등록 · 분배 · 지급 · 연합 · 명단 · 용어 · 레이드/루팅 정보.',
        '**管理員** — 登錄、分配、發放、聯盟、名單、詞彙、團隊/拾取資訊。',
        '**Admin** — register, distribute, pay out, alliance, roster, glossary, loot info.',
      ],
      [
        '**마스터관리자** — 위 전부 + 분배완료 건 수정 + 앱 이름 · PIN 변경.',
        '**最高管理員** — 以上全部＋修改已分配項目＋變更 App 名稱與 PIN。',
        '**Master** — all of the above, plus editing settled items and changing the name/PIN.',
      ],
      [
        '나누는 기준은 하나입니다 — **되돌릴 수 있는가.**',
        '劃分的標準只有一個 — **能不能復原。**',
        'The dividing line is simple: **can it be undone?**',
      ],
    ],
  },
  {
    admin: true,
    icon: 'items',
    title: ['아이템 — 등록 → 분배 → 지급', '道具 — 登錄 → 分配 → 發放', 'Items: register → distribute → pay'],
    lines: [
      [
        '**급하면 아이템명과 참여자만** 넣고 등록하세요. 나머지는 나중에 🏷️ 로 채웁니다. 미루다 인증샷을 잃는 게 더 큰 손해입니다.',
        '**趕時間就只填道具名稱和參與者**先登錄，其餘之後用標籤鍵補。拖到最後弄丟證明照才是更大的損失。',
        'In a hurry? Register with just the item name and participants; fill the rest in later.',
      ],
      [
        '아이템을 고르면 **그 아이템을 주는 보스가 따라옵니다.** 보스가 하나뿐이면 자동으로 넣고, 여럿이면 칩으로 늘어놓아 고르게 합니다.',
        '選好道具後，**會自動帶出掉落該道具的首領**。只有一個時直接填入，有多個時列出讓您挑選。',
        'Pick an item and its boss follows — auto-filled when there is exactly one, offered as chips when there are several.',
      ],
      [
        '**이미 적어둔 보스는 덮어쓰지 않습니다.** 표에 없는 보스도 그냥 치면 들어갑니다.',
        '**已經填好的首領不會被覆蓋。** 表中沒有的首領也可以直接輸入。',
        'Anything you typed is never overwritten, and you can type a boss that is not in the table.',
      ],
      [
        '판매금액을 넣으면 **누가 얼마 받는지 그 자리에서** 보여줍니다. 그 숫자가 실제 결과와 같습니다.',
        '輸入售出金額後，**當場就會顯示每個人分到多少**。那個數字就是實際結果。',
        'Enter the sale amount and the split is previewed — that preview is the actual result.',
      ],
    ],
  },
  {
    admin: true,
    icon: 'fund',
    title: ['분배 산식', '分配公式', 'How the split works'],
    lines: [
      [
        '혈맹운영비 **10%** 를 뗀 뒤, 남은 금액을 참여자에게 인원수 비례로 나눕니다.',
        '先扣除血盟營運費 **10%**，其餘依人數比例分給參與者。',
        'Take 10% for the treasury, then split the rest evenly among participants.',
      ],
      [
        '분배비중이 100%가 아닌 사람은 그만큼만 받고, **남는 몫은 운영비**로 갑니다.',
        '分配比重不是 100% 的人只拿該比例，**剩下的歸營運費**。',
        'Anyone below 100% weight gets only their share; the remainder goes to the treasury.',
      ],
      [
        '원 단위 잔여도 전액 운영비입니다 — **다이아는 사라지지도 생겨나지도 않습니다.**',
        '零頭同樣全部歸營運費 — **鑽石不會憑空消失或增加。**',
        'Rounding leftovers also go to the treasury — diamonds are never lost or created.',
      ],
    ],
  },
  {
    admin: true,
    icon: 'alliance',
    title: ['연합', '聯盟', 'Alliance'],
    lines: [
      [
        '혈맹 내부 분배와 **완전히 분리된 장부**입니다. 개인 잔액은 어느 단계에서도 건드리지 않습니다.',
        '這是與血盟內部分配**完全分開的帳本**。任何階段都不會動到個人餘額。',
        'A completely separate ledger — personal balances are never touched.',
      ],
      [
        '**금액 없이 먼저 등록하세요.** 레이드 직후엔 아직 안 팔려 금액을 모르는 것이 정상입니다.',
        '**請先不填金額登錄。** 剛打完團還沒賣出、不知道金額才是正常的。',
        'Register without an amount first — right after a raid you usually do not know it yet.',
      ],
      [
        '한 아이템에 여러 서버가 들어갑니다. 화면은 언제나 **묶음(=아이템) 단위**입니다.',
        '一個道具可以包含多個伺服器。畫面一律以**群組（＝道具）為單位**顯示。',
        'One item can span several servers; the screen always works per item group.',
      ],
    ],
  },
  {
    admin: true,
    icon: 'glossary',
    title: ['용어 사전', '詞彙表', 'Glossary'],
    lines: [
      [
        '아이템·보스 이름을 한국어 / 繁體中文 / English 로 모아두는 표입니다. **이게 채워질수록 앱이 똑똑해집니다.**',
        '這是把道具與首領名稱整理成韓文 / 繁體中文 / English 的表。**填得越完整，App 就越好用。**',
        'The three-language name table. The more it is filled, the more the app can do.',
      ],
      [
        '채워지면 **어느 언어로 쳐도 자동완성**되고, 등급 테두리 · 티어 · 공식 아이콘이 붙습니다.',
        '填好之後**用任何語言輸入都能自動完成**，並會顯示等級外框、階級與官方圖示。',
        'It powers autocomplete in any language, grade borders, tiers, and official icons.',
      ],
      [
        '저장되는 이름은 **언제나 한국어**입니다. 「不變項鍊」을 골라도 기록에는 「불변의 목걸이」로 남습니다.',
        '儲存的名稱**一律是韓文**。即使選了「不變項鍊」，紀錄中仍會是韓文名稱。',
        'The stored name is always Korean, whichever language you picked.',
      ],
      [
        '中文·English 칸이 비어 있는 것은 **「아직 확인 못 했다」**는 뜻입니다 — 지어내지 않습니다.',
        '中文與 English 欄位空白代表**「尚未確認」** — 我們不會自行編造。',
        'A blank translation means "not confirmed yet" — never a guess.',
      ],
    ],
  },
  {
    admin: true,
    icon: 'tools',
    title: ['관리 도구 · 되돌리기', '管理工具與復原', 'Tools & undo'],
    lines: [
      [
        '도구는 **위험도**로 나뉩니다. 위험도 3(시즌 종료 · 이관 · 초기화)은 **정해진 문구를 정확히 입력**해야 실행되고, 마스터 전용입니다.',
        '工具依**風險等級**區分。等級 3（賽季結束、轉移、初始化）必須**正確輸入指定文字**才會執行，且僅限最高管理員。',
        'Tools are graded by risk. Level 3 requires typing an exact confirmation phrase and is master-only.',
      ],
      [
        '지급을 잘못했으면 **[최근 지급 취소]** 로 되돌립니다.',
        '發放錯誤時，可用**「取消最近發放」**復原。',
        'Mis-paid? Use "Undo last payout".',
      ],
      [
        '되돌릴 때는 **그때 준 금액**을 그대로 회수합니다 — 지금 비중으로 다시 계산하지 않습니다.',
        '復原時是**依當初發放的金額**回收 — 不會用現在的比重重新計算。',
        'Reversals use the amounts recorded at the time, not a recalculation.',
      ],
      [
        '**시트를 손대기 전에 사본을 떠두세요.**',
        '**動試算表之前，請先備份一份。**',
        '**Make a copy of the sheet before touching it.**',
      ],
    ],
  },
];
