import type { GlyphName } from '@/components/Glyph';

/**
 * 앱 안에서 보는 설명서 (v11.7) — 한국어 · 繁體中文 · English.
 *
 * ★ **왜 앱 안에 넣었나.** 그림 설명서는 단톡방에 올리기 좋지만, 폰에서 확대해야
 *   읽히고 한국어 한 벌뿐이다. 대만 혈맹원은 그걸 읽을 수가 없었다.
 *   앱 안에 두면 화면 언어를 따라가고, 글자라 확대 없이 읽히며, 검색도 된다.
 * ★ **세 언어를 한 줄에 묶어 둔다.** 언어별 파일로 나누면 한쪽만 고쳐져 어긋나고,
 *   어느 것이 최신인지 아무도 모르게 된다 (사전 `lib/i18n.tsx` 와 같은 방식이다).
 * ★ 버튼 이름을 인용할 때는 **앱이 실제로 보여주는 그 글자**를 쓴다. 다르게 적으면
 *   읽는 사람이 없는 버튼을 찾게 된다.
 * ★ 서식은 **네 가지뿐**이다 (문단 · 번호흐름 · 표 · 강조상자). 더 늘리면 세 언어를
 *   맞추기 어려워지고, 결국 한 언어만 예쁜 문서가 된다.
 */

/** [한국어, 繁體中文, English] */
export type Tri = [string, string, string];

/** 글 안에서 `**굵게**` 만 쓴다 */
export type Block =
  | { p: Tri }
  | { steps: { h: Tri; d: Tri }[] }
  | { table: { head: Tri[]; rows: Tri[][] } }
  | { note: Tri; h?: Tri; warn?: true };

export type ManualSection = {
  icon: GlyphName;
  title: Tri;
  /** 제목 아래 한 줄 — 이 절이 무엇에 대한 것인지 */
  sub?: Tri;
  blocks: Block[];
  /** 관리자 모드에서만 보이는 절 — 혈맹원에게는 아예 그려지지 않는다 */
  admin?: true;
};

export const MANUAL: ManualSection[] = [
  /* ─────────── 누구나 ─────────── */
  {
    icon: 'home',
    title: ['시작하기', '開始使用', 'Getting started'],
    sub: ['로그인도 앱 설치도 없습니다', '不需要登入，也不用安裝', 'No login, no install'],
    blocks: [
      {
        steps: [
          {
            h: ['링크를 누르면 바로 열립니다', '點開連結就能直接使用', 'Open the link — that is it'],
            d: [
              '혈맹 채팅방에 올라온 주소를 그냥 누르세요.',
              '直接點開血盟聊天室分享的網址即可。',
              'Just tap the address shared in the guild chat.',
            ],
          },
          {
            h: ['홈 화면에 추가', '加入主畫面', 'Add to Home Screen'],
            d: [
              '브라우저 메뉴에서 [홈 화면에 추가] — 앱처럼 아이콘이 생깁니다.',
              '在瀏覽器選單中選「加入主畫面」，就會像 App 一樣出現圖示。',
              'Use the browser menu → "Add to Home Screen" for an app icon.',
            ],
          },
          {
            h: ['끝입니다', '完成', 'Done'],
            d: [
              '비밀번호도, 계정 만들기도 없습니다.',
              '不需要密碼，也不用註冊帳號。',
              'No password, no account to create.',
            ],
          },
        ],
      },
      {
        note: [
          '혈맹원은 **무엇을 눌러도 정산 자료를 망가뜨릴 수 없습니다.** 보기 전용이고, 딱 하나 게시판에만 글을 쓸 수 있습니다.',
          '一般成員**無論點什麼都不會動到結算資料**。只能檢視，唯一能發文的地方是留言板。',
          'Members **cannot break anything** — view only, except for posting on the board.',
        ],
      },
    ],
  },
  {
    icon: 'balance',
    title: ['내 다이아 보기', '查看我的鑽石', 'Your diamonds'],
    sub: ['숫자가 두 개입니다 — 뜻이 다릅니다', '有兩個數字，意思不同', 'Two numbers, two meanings'],
    blocks: [
      {
        table: {
          head: [
            ['보이는 것', '顯示', 'What you see'],
            ['뜻', '意思', 'Meaning'],
          ],
          rows: [
            [
              ['주황색 큰 숫자', '橘色大字', 'Big orange number'],
              ['**아직 못 받은 것.** 관리자가 지급하면 0이 됩니다', '**尚未領取的。** 管理員發放後歸零', '**Not yet received** — becomes 0 after payout'],
            ],
            [
              ['초록색 완료', '綠色「已發放」', 'Green "paid"'],
              ['지금까지 실제로 받은 누적', '到目前為止實際領到的累計', 'Running total actually received'],
            ],
            [
              ['이름 앞 01', '名稱前的 01', '01 before the name'],
              ['서버 번호', '伺服器編號', 'Server number'],
            ],
            [
              ['이름 아래 줄', '名稱下方那行', 'The line below'],
              ['클래스 · 레이드 참여 횟수', '職業與團隊參與次數', 'Class and raid count'],
            ],
          ],
        },
      },
      {
        note: [
          '맨 위 **혈맹운영비는 사람이 아니라 길드 금고**입니다. 아무도 가져가지 않습니다.',
          '最上面的**血盟營運費不是人，是公會金庫**。沒有人會拿走。',
          'The top row is the **guild treasury, not a person.** Nobody takes it.',
        ],
      },
      {
        p: [
          '내 것만 크게 보려면 홈에서 [내 정보]를 여세요. 이름을 한 번 고르면 다음부터 자동으로 불러옵니다.',
          '只想看自己的話，請從主畫面開啟「我的資訊」。選過一次名字後，之後會自動載入。',
          'Open "Me" from home for just your own numbers — it remembers your name.',
        ],
      },
    ],
  },
  {
    icon: 'search',
    title: ['좁혀 보기', '篩選檢視', 'Narrowing the list'],
    sub: ['서버는 여러 개, 클래스는 하나', '伺服器可複選，職業一次一個', 'Servers multi, class single'],
    blocks: [
      {
        p: [
          '**서버 칩**은 여러 개를 같이 누를 수 있고, **클래스 드롭다운**은 한 번에 하나입니다. 둘을 같이 쓰면 겹칩니다 — 「01서버의 기사」처럼요.',
          '**伺服器標籤**可以複選，**職業下拉選單**一次只能選一個。兩者可以疊加 — 例如「01 伺服器的騎士」。',
          '**Server chips** are multi-select; the **class dropdown** is one at a time. They combine — "Knights on server 01".',
        ],
      },
      {
        note: [
          '아무것도 안 고르면 전원이 나옵니다. **사람이 안 보이면 필터가 켜져 있는지 먼저 보세요.**',
          '什麼都不選就會顯示全部。**看不到某個人時，先確認篩選是否還開著。**',
          'Nothing selected shows everyone. **If someone is missing, check the filters first.**',
        ],
        warn: true,
      },
    ],
  },
  {
    icon: 'items',
    title: ['아이템 이름 읽는 법', '如何看道具名稱', 'Reading item names'],
    sub: ['테두리 색이 등급입니다', '外框顏色代表等級', 'The border is the grade'],
    blocks: [
      {
        table: {
          head: [
            ['테두리', '外框', 'Border'],
            ['뜻', '意思', 'Meaning'],
          ],
          rows: [
            [
              ['보라색', '紫色', 'Purple'],
              ['전설', '傳說', 'Legendary'],
            ],
            [
              ['황금색', '金色', 'Gold'],
              ['신화', '神話', 'Mythic'],
            ],
            [
              ['검정색', '黑色', 'Black'],
              ['**「모른다」** — 틀린 게 아니라 아직 사전에 없는 이름', '**「不確定」** — 不是錯誤，只是還沒收錄', '**"Unknown"** — not wrong, just not in the glossary'],
            ],
          ],
        },
      },
      {
        p: [
          '이름 뒤 **티어 배지**는 사전에 값이 있을 때만 붙습니다. 마법서·정수는 티어가 없는 것이 정상입니다.',
          '名稱後的**階級標記**只有詞彙表裡有值時才會出現。魔法書、精髓本來就沒有階級。',
          'The **tier badge** appears only when the glossary has one. Spellbooks and essences have no tier.',
        ],
      },
      {
        p: [
          '사진이 붙은 것은 눌러서 **앱 안에서 바로** 봅니다. 다른 앱으로 튕겨 나가지 않습니다.',
          '有照片的項目點一下就能**直接在 App 內**檢視，不會跳到其他 App。',
          'Tap a photo count to view shots **inside the app** — no jumping out.',
        ],
      },
    ],
  },
  {
    icon: 'board',
    title: ['게시판', '留言板', 'Board'],
    sub: ['혈맹원이 직접 쓸 수 있는 유일한 곳', '成員唯一能發文的地方', 'The only place members can post'],
    blocks: [
      {
        p: [
          'PIN 도 로그인도 필요 없습니다. **📌 공지는 관리자만** 올릴 수 있고 목록 맨 위에 고정됩니다.',
          '不需要 PIN 也不用登入。**公告只有管理員**能發布，並固定在列表最上方。',
          'No PIN or login. **Notices are admin-only** and pinned to the top.',
        ],
      },
      {
        note: [
          '잔액이 이상하거나 아이템 이름이 **검정 테두리**로 보이면 여기에 남겨주세요. 관리자가 보고 고칩니다.',
          '如果餘額有問題，或道具名稱顯示**黑色外框**，請在這裡留言，管理員會處理。',
          'Report odd balances or **black-bordered** item names here.',
        ],
      },
    ],
  },
  {
    icon: 'lang',
    title: ['언어 · 공유', '語言與分享', 'Language & sharing'],
    sub: ['화면 위 언어 버튼에서 바꿉니다', '從畫面上方的語言鍵切換', 'Switch from the header'],
    blocks: [
      {
        p: [
          '언어 버튼은 **화면 오른쪽 위, 새로고침 왼쪽**에 늘 있습니다. 한국어 / 繁體中文 / English.',
          '語言鍵一直在**畫面右上、重新整理左邊**。韓文 / 繁體中文 / English。',
          'The language button sits in the header, left of refresh. Korean / Traditional Chinese / English.',
        ],
      },
      {
        note: [
          '언어를 바꾸면 **아이템·보스 이름까지** 같이 바뀝니다. 단, **사전에 채워진 것만** 바뀌고 없으면 한국어 그대로입니다 — 지어내서 번역하지 않습니다.',
          '切換語言時**連道具與首領名稱**也會變。但**只有詞彙表已填寫的**才會翻譯，沒有的就維持韓文 — 我們不會自行編造。',
          'Item and boss names follow too — but **only if the glossary has them.** We never invent a translation.',
        ],
      },
      {
        p: [
          '**[공유]** 를 누르면 지금 보고 있는 내용이 **글자로** 나갑니다. 화면 사진이 아니라 글자라 확대 없이 읽히고 나중에 검색도 됩니다.',
          '按**「分享」**會把目前畫面內容以**文字**送出。不是截圖，所以不用放大就能讀，之後也搜尋得到。',
          '**Share** exports the current view as **text** — readable without zooming, and searchable later.',
        ],
      },
    ],
  },

  /* ─────────── 관리자 전용 ─────────── */
  {
    admin: true,
    icon: 'crown',
    title: ['권한은 세 단계', '權限分三級', 'Three permission levels'],
    sub: ['나누는 기준은 하나 — 되돌릴 수 있는가', '劃分標準只有一個：能不能復原', 'One rule: can it be undone?'],
    blocks: [
      {
        table: {
          head: [
            ['등급', '等級', 'Level'],
            ['할 수 있는 것', '可以做的事', 'Can do'],
          ],
          rows: [
            [
              ['혈맹원', '成員', 'Member'],
              ['보기 + 게시판 글쓰기', '檢視＋留言板發文', 'View, plus board posts'],
            ],
            [
              ['**관리자**', '**管理員**', '**Admin**'],
              ['등록 · 분배 · 지급 · 연합 · 명단 · 용어 · 레이드/루팅', '登錄、分配、發放、聯盟、名單、詞彙、團隊/拾取', 'Register, distribute, pay, alliance, roster, glossary, loot'],
            ],
            [
              ['**마스터관리자**', '**最高管理員**', '**Master**'],
              ['위 전부 + 분배완료 건 수정 + 앱 이름 · PIN 변경', '以上全部＋修改已分配項目＋變更名稱與 PIN', 'All the above, plus editing settled items and the name/PIN'],
            ],
          ],
        },
      },
      {
        note: [
          '되돌리기 어려운 것일수록 위 등급으로 올라갑니다. 관리자가 실수로 눌러도 **복구할 방법이 있는 것**만 관리자에게 열려 있습니다.',
          '越難復原的功能，權限等級越高。開放給管理員的，都是**萬一按錯還救得回來**的操作。',
          'The harder to undo, the higher the level. Admins only get what can be recovered.',
        ],
      },
    ],
  },
  {
    admin: true,
    icon: 'items',
    title: ['아이템 — 등록부터 지급까지', '道具 — 從登錄到發放', 'Items: register to payout'],
    sub: ['레이드 직후엔 금액을 몰라도 됩니다', '剛打完團不知道金額也沒關係', 'You do not need the amount yet'],
    blocks: [
      {
        steps: [
          {
            h: ['등록', '登錄', 'Register'],
            d: [
              '아이템명 + 참여자를 체크합니다. **급하면 이 둘만** 넣고 등록하세요 — 나머지는 나중에 🏷️ 로 채웁니다.',
              '填入道具名稱並勾選參與者。**趕時間就只填這兩項**先登錄，其餘之後補。',
              'Item name + participants. **In a hurry, just those two** — fill the rest in later.',
            ],
          },
          {
            h: ['분배', '分配', 'Distribute'],
            d: [
              '팔린 뒤 판매금액을 넣으면 **누가 얼마 받는지 그 자리에서** 보여줍니다. 그 숫자가 실제 결과와 같습니다.',
              '賣出後輸入金額，**當場就會顯示每個人分到多少**。那個數字就是實際結果。',
              'Enter the sale amount and the split previews — that preview is the real result.',
            ],
          },
          {
            h: ['지급', '發放', 'Pay out'],
            d: [
              '실제로 다이아를 보낸 뒤 [잔액] 화면에서 지급 처리합니다. 잘못했으면 [최근 지급 취소].',
              '實際轉出鑽石後，在「餘額」畫面標記發放。按錯可用「取消最近發放」。',
              'After actually sending, mark it paid on the Balance screen. Mis-clicked? Undo last payout.',
            ],
          },
        ],
      },
      {
        note: [
          '아이템을 고르면 **그 아이템을 주는 보스가 따라옵니다.** 보스가 하나뿐이면 자동으로 넣고, 여럿이면 칩으로 늘어놓아 고르게 합니다. **이미 적어둔 보스는 덮어쓰지 않습니다.**',
          '選好道具後，**會自動帶出掉落該道具的首領**。只有一個時直接填入，多個時列出讓您挑選。**已經填好的不會被覆蓋。**',
          'Pick an item and **its boss follows** — auto-filled when there is exactly one, offered as chips otherwise. **Never overwrites what you typed.**',
        ],
      },
      {
        note: [
          '미루다 **인증샷을 잃는 것**이 칸을 덜 채우는 것보다 훨씬 큰 손해입니다.',
          '拖到最後**弄丟證明照**，比少填幾個欄位損失大得多。',
          'Losing the screenshots by waiting costs far more than a few empty fields.',
        ],
        warn: true,
      },
    ],
  },
  {
    admin: true,
    icon: 'fund',
    title: ['분배 산식', '分配公式', 'How the split works'],
    sub: ['다이아는 사라지지도 생겨나지도 않습니다', '鑽石不會憑空消失或增加', 'Diamonds are never lost or created'],
    blocks: [
      {
        table: {
          head: [
            ['순서', '順序', 'Step'],
            ['계산', '計算', 'Calculation'],
          ],
          rows: [
            [
              ['① 운영비', '① 營運費', '① Treasury'],
              ['총액의 **10%**', '總額的 **10%**', '**10%** of the total'],
            ],
            [
              ['② 분배', '② 分配', '② Split'],
              ['남은 금액을 참여자에게 **인원수 비례**', '其餘依**人數比例**分給參與者', 'The rest, **evenly per participant**'],
            ],
            [
              ['③ 잔여', '③ 零頭', '③ Leftover'],
              ['원 단위로 남은 것은 **전액 운영비**', '零頭**全部歸營運費**', 'Rounding remainder **all to the treasury**'],
            ],
          ],
        },
      },
      {
        p: [
          '분배비중이 100%가 아닌 사람은 그만큼만 받고, **남는 몫도 운영비**로 갑니다. 비중은 [관리] → 혈맹원에서 정합니다.',
          '分配比重不是 100% 的人只拿該比例，**剩下的也歸營運費**。比重在「管理→血盟成員」設定。',
          'Anyone below 100% weight gets only their share; **the rest goes to the treasury.**',
        ],
      },
      {
        note: [
          '남는 몫을 **특정 사람에게 얹지 않습니다.** 그러면 그 사람만 금액이 달라져 버그로 오인됩니다 — 실제로 있었던 일입니다.',
          '**不會把剩餘加到某個人身上。** 那樣只有那個人金額不同，會被誤認為程式錯誤 — 這是真實發生過的事。',
          'The remainder is **never given to one person** — that once looked like a bug to everyone.',
        ],
        warn: true,
      },
    ],
  },
  {
    admin: true,
    icon: 'alliance',
    title: ['연합', '聯盟', 'Alliance'],
    sub: ['혈맹 분배와 완전히 분리된 장부', '與血盟分配完全分開的帳本', 'A completely separate ledger'],
    blocks: [
      {
        p: [
          '**개인 잔액은 어느 단계에서도 건드리지 않습니다.** 연합 인원은 우리 멤버DB에 없기 때문입니다.',
          '**任何階段都不會動到個人餘額** — 聯盟人員本來就不在我們的成員名單裡。',
          '**Personal balances are never touched** — alliance members are not in our roster.',
        ],
      },
      {
        p: [
          '**금액 없이 먼저 등록하세요.** 레이드 직후엔 아직 안 팔려 금액을 모르는 것이 정상입니다. 한 아이템에 여러 서버가 들어가고, 화면은 언제나 **묶음(=아이템) 단위**입니다.',
          '**請先不填金額登錄。** 剛打完團還沒賣出是正常的。一個道具可包含多個伺服器，畫面一律以**群組（＝道具）為單位**。',
          '**Register without an amount first.** One item can span several servers; the screen always works per item group.',
        ],
      },
      {
        note: [
          '혈비 10% 는 **혈맹운영비 잔액에 실제로 적립**됩니다. 정산 건을 지우면 그만큼 회수합니다.',
          '10% 的血盟費會**實際累計進血盟營運費餘額**。刪除已結算的項目時會一併回收。',
          'The 10% is **actually credited to the treasury**, and reclaimed if the record is deleted.',
        ],
      },
    ],
  },
  {
    admin: true,
    icon: 'glossary',
    title: ['용어 사전', '詞彙表', 'Glossary'],
    sub: ['채워질수록 앱이 똑똑해집니다', '填得越完整，App 越好用', 'The more it holds, the more the app can do'],
    blocks: [
      {
        p: [
          '아이템·보스 이름을 **한국어 / 繁體中文 / English** 로 모아두는 표입니다. 채워지면 **어느 언어로 쳐도 자동완성**되고, 등급 테두리 · 티어 · 공식 아이콘이 붙습니다.',
          '這是把道具與首領名稱整理成**韓文 / 繁體中文 / English** 的表。填好後**用任何語言輸入都能自動完成**，並顯示等級外框、階級與官方圖示。',
          'The three-language name table. It powers autocomplete in **any language**, grade borders, tiers, and official icons.',
        ],
      },
      {
        table: {
          head: [
            ['', '', ''],
            ['규칙', '規則', 'Rule'],
          ],
          rows: [
            [
              ['저장되는 이름', '儲存的名稱', 'Stored name'],
              ['**언제나 한국어.** 「不變項鍊」을 골라도 기록에는 국문', '**一律韓文。** 即使選了「不變項鍊」，紀錄仍是韓文', '**Always Korean**, whichever language you picked'],
            ],
            [
              ['번역 빈칸', '翻譯空白', 'Blank translation'],
              ['**「아직 확인 못 했다」** — 지어내지 않습니다', '**「尚未確認」** — 不會自行編造', '**"Not confirmed yet"** — never a guess'],
            ],
            [
              ['사전에 없는 이름', '表中沒有的名稱', 'Unlisted name'],
              ['그대로 입력됩니다 (막으면 새 아이템 등록이 멈춥니다)', '可以直接輸入（否則新道具就無法登錄）', 'Accepted as typed — otherwise new items could not be registered'],
            ],
          ],
        },
      },
    ],
  },
  {
    admin: true,
    icon: 'tools',
    title: ['관리 도구 · 되돌리기', '管理工具與復原', 'Tools & undo'],
    sub: ['위험한 것일수록 확인이 깐깐합니다', '越危險的操作，確認越嚴格', 'The riskier it is, the more it asks'],
    blocks: [
      {
        table: {
          head: [
            ['위험도', '風險', 'Risk'],
            ['서버가 요구하는 것', '系統要求', 'What the server requires'],
          ],
          rows: [
            [
              ['1', '1', '1'],
              ['없음 — 참여횟수 재계산, 시트 정돈 등', '無 — 重算參與次數、整理表格等', 'Nothing — recount, tidy sheet, etc.'],
            ],
            [
              ['2', '2', '2'],
              ['구체적인 숫자를 보여준 뒤 **다시 확인**', '顯示具體數字後**再次確認**', 'Shows the numbers, then **asks again**'],
            ],
            [
              ['**3**', '**3**', '**3**'],
              ['**정해진 문구를 정확히 입력** — 마스터 전용', '**必須正確輸入指定文字** — 僅限最高管理員', '**Type an exact phrase** — master only'],
            ],
          ],
        },
      },
      {
        p: [
          '지급을 잘못했으면 **[최근 지급 취소]** 로 되돌립니다. 되돌릴 때는 **그때 준 금액**을 그대로 회수합니다 — 지금 비중으로 다시 계산하지 않습니다.',
          '發放錯誤時用**「取消最近發放」**復原。復原時是**依當初發放的金額**回收，不會用現在的比重重算。',
          'Undo a payout with **"Undo last payout"**. Reversals use the **amounts recorded at the time**, not a recalculation.',
        ],
      },
      {
        note: [
          '**시트를 손대기 전에 사본을 떠두세요.** 되돌리기 어려운 작업이 있습니다.',
          '**動試算表之前，請先備份一份。** 有些操作很難復原。',
          '**Copy the sheet before touching it.** Some operations are hard to undo.',
        ],
        warn: true,
      },
    ],
  },
];
