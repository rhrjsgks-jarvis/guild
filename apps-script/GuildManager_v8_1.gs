// ═══════════════════════════════════════════════════════════════
//  길드 정산 시스템 v8.1  (새 파일 이전 · 데이터 이관 · 앱에서 아이디 변경)
//  시트 구성: [사용안내] [멤버DB] [참여자현황] [분배대기중] [잔액현황]
//            [지급기록] + [시즌1] [시즌2] ...  ← 이 순서로 항상 정렬됨
// ═══════════════════════════════════════════════════════════════
//  변경점 v8.0 → v8.1 (소수점 업 — 이전 경로 + 멤버 관리)
//   - ★ [📥 기존 길드정산 파일에서 가져오기] 신설: 운영 중인 파일을
//     건드리지 않고 새 파일에 v8.1을 설치해 두었다가, 준비가 끝나면
//     이 메뉴 한 번으로 멤버DB·잔액·아이템·지급기록·작업기록을 통째로
//     옮겨온다. "덮어쓰기" 방식이라 여러 번 실행해도 결과가 같다
//     (합산 방식이면 두 번 실행할 때 잔액이 불어난다)
//   - ★ 앱에서 혈맹원 아이디 변경: api_renameMember / 'rename' 액션.
//     바꿀 이름이 이미 있으면 두 사람의 잔액·참여횟수가 합쳐지므로,
//     confirmMerge 플래그 없이는 거부하고 앱이 한 번 더 확인받게 한다
//   - ★ api_getRoster: 멤버 이름 + 게임표시명을 앱에 내려준다
//   - _renameCore 로 멤버DB 갱신과 잔액 승계를 한 곳에 묶음
//     (PC 메뉴와 앱이 같은 코어를 쓰도록 — 기존 코어/UI 분리 원칙)
// ═══════════════════════════════════════════════════════════════
//  변경점 v7.4 → v8.0 (정수 업 — 구조 변경: 외부 프론트엔드 분리)
//   - ★ doPost JSON API 신설: 이 스크립트가 "데이터 API"가 되고,
//     화면(UI)은 Vercel에 배포되는 별도 PWA가 담당하도록 분리.
//     .gs 안에 HTML 문자열을 넣고 고치던 방식에서 벗어나, 화면
//     수정은 git 저장소에서 하고 push하면 자동 배포됨
//   - ★ 액션 라우터: state / members / lookup / register /
//     distribute / photo / payout — 전부 기존 api_* 코어를
//     그대로 재사용 (분배·지급 산식은 단 한 줄도 바뀌지 않음)
//   - ★ 토큰 인증: 스크립트 속성 API_TOKEN 과 일치하는 요청만 처리.
//     토큰은 Vercel 서버 환경변수에만 저장되고 브라우저로는 절대
//     내려가지 않음 ([🔑 웹 API 토큰] 메뉴에서 발급·확인·재발급)
//   - ★ 쓰기 작업(register/distribute/payout)은 LockService로
//     직렬화 — 여러 명이 동시에 눌러도 잔액이 꼬이지 않음
//   - ★ correctDistribution / deleteLedgerItem 은 API에 의도적으로
//     미노출 (기존 원칙 유지: 제작자 전용 PC 메뉴)
//   - 기존 doGet 웹앱(_mobileHtml / _lookupHtml)은 그대로 유지 —
//     새 PWA에 문제가 생겨도 언제든 돌아갈 수 있는 백업 경로
// ═══════════════════════════════════════════════════════════════
//  변경점 v7.3 → v7.4 (소수점 업 — 모바일 간소화 4종)
//   - ★ 웹앱 상단 대시보드 배너: 미분배 아이템 수 / 잔액 남은 인원
//     수를 탭 이동 없이 항상 확인 가능
//   - ★ 등록·분배 시 디스코드 자동 알림 (기존 수동 "전송" 메뉴는
//     재전송용으로 유지). 웹훅 미설정 시 조용히 건너뜀, 전송
//     실패가 본 기능을 막지 않음(_notifyDiscord 안전 래퍼)
//   - ★ 개인 잔액 조회 전용 링크 신설: 웹앱 URL 뒤에 "?view=lookup"
//     을 붙이면 등록·분배 등 관리 기능이 전혀 없는 초경량 페이지로
//     연결됨. 이름 선택 → 본인 분배전/분배완료/참여횟수만 조회.
//     길드원에게는 이 조회 전용 링크를, 매니저는 기존 링크를 사용
//   - ★ 시즌 종료 아카이브에 "시즌 요약 통계" 섹션 추가: 총 분배
//     아이템 수·총 분배액·총 혈비 적립액·고유 참여 인원·최다
//     참여자를 아이템 이력에서 자동 집계
// ═══════════════════════════════════════════════════════════════
//  변경점 v7.2 → v7.3 (소수점 업 — 로그 무결성 강화)
//   - ★ [작업기록]을 공장 초기화 삭제 목록에서 명시적으로 배제
//     (상수 DELETABLE_ON_RESET에 절대 포함하지 말 것 — 주석 경고)
//     + 확인 팝업에 "작업기록은 삭제되지 않습니다" 명시
//   - ★ onOpen마다 [작업기록] 시트 존재를 자동 점검(_ensureAuditLogExists).
//     누군가 수동으로 시트를 지웠어도 즉시 재생성 + 그 사실 자체를
//     새 로그에 기록 (완전한 프로그램적 삭제 방지는 불가능하지만,
//     탐지·복구·기록은 자동화)
//   - ★ 로깅 범위 확대: 지급 처리(누가 지급했는지 지급기록에 처리자
//     열 추가) + 지급 취소(삭제 직전 반드시 감사로그 선기록) +
//     멤버 개명. 이제 등록/분배/정정/삭제/지급/지급취소/개명/
//     공장초기화/시트복구까지 전부 영구 기록됨
// ═══════════════════════════════════════════════════════════════
//  변경점 v7.1 → v7.2 (대규모 — 정수 버전 업)
//   - ★ 누적기록(분배대기중) 11열→14열 확장: 입력자·분배자·수정자
//     (이메일) 자동 기록. PC는 Session.getActiveUser()로 자동 확인,
//     모바일 웹앱은 최초 1회만 이메일을 물어보고 localStorage에
//     저장해 이후 자동 재사용 (이름 입력 없이 이메일만)
//   - ★ [작업기록] 시트 신설: 등록·분배·정정·삭제 전체를 영구
//     기록하는 감사 로그. 분배대기중 행이 삭제되어도(예: 아이템
//     완전 삭제) 이력은 여기 남아 절대 사라지지 않음
//   - registerItem/api_register(입력자), _distributeCore/
//     api_distribute(분배자), correctDistribution(수정자),
//     deleteLedgerItem(삭제자) 전체에 로깅 연결
//   - 구버전(11열 이하) 파일은 업그레이드/가져오기 시 자동으로
//     14열로 패딩 이관 (기존 입력자/분배자/수정자는 공란으로 시작)
//   - 웹앱 헤더에 📧 아이콘으로 이메일 변경 가능
// ═══════════════════════════════════════════════════════════════
//  변경점 v7.0 → v7.1 (소수점 업 — 아이템 완전 삭제)
//   - ★ [🗑️ 아이템 완전 삭제] 메뉴 추가: 연습용으로 등록한 항목이나
//     잘못 등록한 항목을 이름으로 찾아 완전히 삭제
//   - 미분배(⏳) 항목은 바로 삭제. 분배완료(✅) 항목은
//     correctDistribution과 동일한 안전장치로 먼저 금액을
//     되돌린 뒤(개별 추적, 부분실패 시 삭제 중단) 행을 삭제
//   - 삭제 후 참여횟수 자동 재계산 (해당 항목의 등록 이력이
//     사라지므로 참여자의 참여횟수도 자동으로 정확히 줄어듦)
//   - 제작자 전용: PC 메뉴에서만 제공, 모바일 웹앱 미노출
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.9 → v7.0 (대규모 — 정수 버전 업)
//   - 실사용 중 발견된 심각한 버그: [🔄 분배 정정] 되돌리기가
//     19명 중 16명에서 실행이 중단되어(원인 미상 — 모바일 네트워크
//     단절 등으로 추정) 아이템은 미분배로 바뀌었는데 잔액만 남는
//     데이터 불일치 발생. 해당 사고 건은 수동으로 정정 완료
//   - ★ 되돌리기 로직 전면 견고화: 대상별 개별 try/catch로 정확히
//     추적. 하나라도 실패하면 누적기록 상태를 "분배완료"로 그대로
//     유지(섣불리 미분배로 바꾸지 않음)하고, 반영/실패 내역을
//     정확히 나열해 수동 복구를 안내. 부분 반영이 조용히 넘어가는
//     일을 원천 차단
//   - ★ 참여횟수(CNT)를 다이아 분배와 완전히 분리:
//     이제 "레이드 출석" 전용 지표로, 아이템 등록(_registerCore)
//     시점에 즉시 확정되고 이후 분배·정정·금액 변경과 무관하게
//     유지됨. _recalcAllParticipationCounts가 분배대기중 전체
//     등록 이력을 스캔해 잔액현황 CNT를 산출(다이아와 별개 관리)
//   - _distributeCore/correctDistribution에서 참여자 CNT 증감
//     로직 전부 제거 (혈비 FUND_NAME의 CNT는 "분배 이벤트 횟수"라는
//     별개 의미로 계속 유지)
//   - [🔁 참여횟수 재계산] 메뉴 추가 (드리프트 발생 시 수동 보정)
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.8 → v6.9 (소수점 업 — 분배 정정 기능)
//   - ★ [🔄 분배 정정] 메뉴 추가: 판매금액을 잘못 입력해 이미
//     분배완료된 아이템을 되돌리거나(⏳미분배 복귀), 되돌린 뒤
//     새 금액으로 즉시 재분배 가능 (예: 5000→7000 정정)
//   - 제작자 전용: PC 메뉴에서만 제공, 모바일 웹앱에는 미노출
//     (구글시트 편집 권한이 있는 사람만 실행 가능)
//   - ★ 안전장치: 되돌릴 금액만큼 분배전 잔액이 남아있지 않은
//     대상(이미 지급✓ 처리됨)이 있으면 자동으로 중단하고 안내
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.7 → v6.8 (소수점 업 — 분배 규칙 확정)
//   - ★ 규칙 변경: 참여자는 예외 없이 전원 동일한 1/N(버림) 금액만
//     받는다. 기존에는 나머지가 "멤버DB 첫 번째 멤버"(우연히 가이)
//     에게 자기 몫에 합산되어 그 사람만 금액이 달라 보이는 문제가
//     있었음 — 이제 나머지는 참여자 몫과 완전히 분리
//   - ★ REMAINDER_NAME 상수(현재 'TC무식') 도입: 분배 나머지는
//     참여 여부와 무관하게 항상 이 멤버에게 별도 적립. 참여자로도
//     포함되어 있으면 자기 몫(perPerson)은 동일하게 받고, 나머지는
//     추가로 얹어짐. 참여횟수는 나머지 적립만으로는 증가하지 않음
//     (실제 참여 이력과 분리)
//   - 대상 미발견 시 멤버DB 첫 번째 멤버로 안전 폴백
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.6 → v6.7 (소수점 업 — 1글자 오독 허용 매칭)
//   - v6.6 대비 보정 후 재검증: 이전엔 "줄 자체가 안 보임"이던
//     항목들이 이제 "거의 맞고 1글자만 오독"으로 개선됨 확인
//     (詹阿呆→倍阿呆, 향로셔틀→향로셔를 등)
//   - ★ 완전일치 실패 시에만 보조로 편집거리(치환) 1까지 허용하는
//     퍼지 매칭 추가. 3글자 미만 키는 절대 대상에서 제외(오귀속
//     위험 — 2글자 키끼리는 서로 1글자 차이인 경우가 실제로 있음:
//     斬殺↔斬斷, 斬落↔斬斷 등. 3글자 이상만 사용)
//   - 안전성 검증: 현재 34명 로스터의 3글자+ 키 46개 전수 비교 결과
//     서로 편집거리 1 이내로 충돌하는 쌍 0건 확인 후 적용
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.5 → v6.6 (소수점 업 — 사진 명암비 보정)
//   - 실제 OCR 원문 대조 결과, 매칭 실패 원인 재진단: 일부 이름은
//     "다르게 읽힌" 게 아니라 OCR이 해당 줄을 아예 추출하지 못함
//     (짙은 빨강 배경 + 어두운 텍스트의 낮은 명암비가 원인으로 추정 —
//     로컬 테서랙트 테스트에서도 명암 보정 후 인식률이 크게 개선됨)
//   - ★ 사진 업로드 전 클라이언트에서 canvas filter로 대비/밝기
//     보정(contrast 160%, brightness 112%, saturate 105%) 후 전송
//   - 참고: 매칭 로직(코어/괄호/게임표시명, 대소문자·번간체 무관)은
//     이미 충분히 관대함 — 남은 병목은 OCR 추출 자체였음
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.4 → v6.5 (소수점 업 — 번체/간체 한자 정규화)
//   - 배경: 길드가 한국인+대만인 혼성 구성. 대만은 번체자(繁體字)를
//     쓰는데 멤버DB 괄호 표기는 다수가 간체자(简体字)로 저장되어
//     있어, 같은 글자의 다른 서체로 인한 매칭 누락 발생
//   - ★ T2S_MAP(번체→간체 상용한자 345자) 도입, OCR 텍스트와
//     매칭 후보(코어·괄호·게임표시명) 양쪽 모두 간체로 정규화 후
//     비교 → 서체만 다른 경우 자동으로 같은 사람으로 인식
//   - 한계(정직한 고지): 이는 "같은 글자의 다른 서체"만 연결함.
//     斬(베다)과 惨(비참하다)처럼 애초에 다른 뜻의 글자는 절대
//     연결하지 않음 — 오귀속 위험을 피하기 위해 의도적으로 순수
//     서체 변환표만 사용, 유사도 기반 추측은 여전히 배제
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.3 → v6.4 (소수점 업 — 매칭 정확도·진단성 개선)
//   - 실사용 확인: OCR 자체는 정상 작동(8명 감지)하나, 영문 대문자로
//     끝나는 이름(PlusS, 대서과Z)이 누락됨 — OCR이 대소문자를 다르게
//     인식했을 가능성이 높은데 매칭이 대소문자를 구분해서 비교 중이었음
//   - ★ 매칭을 대소문자 무관(toLowerCase 비교)으로 변경
//   - ★ 사진 분석 후 "🔍 인식된 텍스트 보기" 토글 추가: OCR이 실제로
//     읽은 원문을 직접 확인 가능 → 이후 매칭 누락 시 원인 진단이 쉬워짐
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.2 → v6.3 (소수점 업 — Drive API 버전 호환성 버그 수정)
//   - 실사용 중 "Drive.Files.insert is not a function" 오류 확인:
//     최근 신규 설치되는 Drive 고급 서비스는 기본적으로 v3이며,
//     v3에는 insert가 없고 create로 이름이 바뀜(title→name도 변경)
//   - ★ _ocrImage가 v3(create)/v2(insert) 중 실제 설치된 버전을
//     자동 감지해 맞는 방식으로 호출 (양쪽 다 호환)
//   - 참고: 매칭 로직은 색상과 무관 — OCR은 화면 속 텍스트를
//     하이라이트 여부 관계없이 전부 읽어서 대조함 (원래 설계대로)
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.1 → v6.2 (소수점 업 — 등록 전 재확인 강화)
//   - ★ 모바일 웹앱 [아이템 등록] 확인 팝업에 참여자 명단 전체
//     표시 (기존: 인원수만 표시) — OCR 자동감지든 수동 체크든
//     최종 제출 전 눈으로 명단을 다시 확인하도록 강화
//   - 등록 버튼 위에 상시 경고 문구 추가:
//     "등록 전 체크된 참여자가 맞는지 꼭 확인해주세요"
// ═══════════════════════════════════════════════════════════════
//  변경점 v6.0 → v6.1 (소수점 업 — OCR 매칭 정확도 개선)
//   - 실제 게임 스크린샷으로 검증한 결과, 게임 내 표시 이름이
//     멤버DB의 한글 이름과도, 괄호 안 중국어 표기와도 다른 경우가
//     많아 매칭 누락이 확인됨 (실사례: 19명 중 11명만 매칭)
//   - ★ 매칭 대상에 괄호 안 중국어 표기도 추가 (기존: 한글 코어만)
//   - ★ 멤버DB에 D열 "게임표시명(선택)" 추가: 자동 매칭이 안 되는
//     멤버는 실제 게임 표시 이름을 한 번 입력해두면 이후 정확히
//     매칭됨 (추측 대신 확정 정보 사용 — 오매칭으로 인한 잔액 오귀속
//     방지가 최우선이므로 알고리즘 추측은 하지 않음)
// ═══════════════════════════════════════════════════════════════
//  변경점 v5.4 → v6.0 (대규모 — 정수 버전 업)
//   - ★ 모바일 웹앱 아이템 등록: 사진 첨부 시 자동으로
//     ① 구글 드라이브에 업로드 → 인증샷 링크 자동 생성
//     ② OCR(문자 인식)로 사진 속 텍스트 추출 → 멤버 이름과 대조
//     ③ 일치하는 참여자 자동 체크 (등록 전 확인·수정 가능, 강제 아님)
//   - api_analyzePhoto: Advanced Drive Service의 OCR 변환 기능 사용
//     ※ 최초 1회 설정 필요: Apps Script 좌측 [서비스] → [+] →
//       "Drive API" 추가 (일반 DriveApp과 별개, 수동 활성화 필수)
//   - 정확도 한계 안내: 게임 스크린샷 폰트 특성상 인식률이 완벽하지
//     않을 수 있어 항상 "제안"으로만 동작 — 자동 체크 후에도 등록
//     전 멤버 목록을 눈으로 확인하는 것을 사용안내에 강조
//   - 사진은 실행 계정(콘슈님) 구글 드라이브의 "길드정산_인증샷"
//     폴더에 저장되며, 링크가 있는 사람 누구나 볼 수 있게 자동 공유됨
//     (기존에 수동으로 업로드·공유하던 방식과 동일한 공개 범위)
// ═══════════════════════════════════════════════════════════════
//  변경점 v5.3 → v5.4 (소수점 업 — 일괄 개명 후보 탐지)
//   - 배경: 멤버DB를 셀 단위로 직접 고치면 onEdit이 즉시 개명으로
//     인식해 잔액을 승계하지만(기존 기능), 여러 명을 한 번에
//     붙여넣거나 통째로 교체하면 구글시트가 '이전 값'을 주지 않아
//     새 이름 추가로만 처리되고 옛 이름 잔액이 고아로 남았음
//   - ★ [🔀 개명 후보 확인] 메뉴: 잔액현황의 미매칭 이름 중
//     "코어이름"(괄호 앞부분)이 멤버DB의 정확히 1명과만 일치하면
//     개명 후보로 제안 → 한 번의 확인으로 일괄 승계·병합
//     · 코어이름이 여러 명과 동시에 매칭되는 애매한 경우는
//       잘못된 병합을 막기 위해 자동 제외 (수동 확인 필요 목록으로 안내)
//     · '유일배분(혈비)' 계정은 항상 후보에서 제외
//   - 멤버DB 다건 편집(붙여넣기) 시 onEdit이 후보 존재를 자동 감지해
//     토스트로 안내 (동기화는 여전히 확인 후 실행 — 잔액 보호)
// ═══════════════════════════════════════════════════════════════
//  변경점 v5.2 → v5.3 (소수점 업 — 멤버 이름 서식 통일)
//   - ★ 멤버DB·참여자현황·잔액현황의 멤버 이름 칸: 폰트 13 /
//     왼쪽 정렬 / 세로 가운데 정렬로 항상 통일 (_applyMemberNameFormatting)
//     재생성 5지점에서 자동 재적용 — 서식만 바꾸는 안전한 작업이라
//     순서 정렬·행높이 통일과 같은 방식으로 훅에 포함
//   - 잔액현황의 "합계" 행은 기존 가운데 정렬을 그대로 유지 (제외)
// ═══════════════════════════════════════════════════════════════
//  변경점 v5.1 → v5.2 (소수점 업 — 혈비 계정명 동기화)
//   - ★ FUND_NAME 상수 '유일배분' → '유일배분(혈비)'로 변경
//     (실제 멤버DB에 등록된 표기와 정확히 일치시켜 혈비 중복 계정
//     생성을 방지. 혈비 비율/로직은 변경 없음)
// ═══════════════════════════════════════════════════════════════
//  변경점 v5.0 → v5.1 (소수점 업 — 정돈)
//   - ★ '누적기록' → '분배대기중'으로 이름 변경 (LEDGER_SHEET 상수화)
//     ※ 이 시트는 미분배(⏳)뿐 아니라 분배완료(✅) 이력도 함께 보관됨
//   - ★ 시트 표준 순서 확정 + 자동 재정렬:
//     사용안내→멤버DB→참여자현황→분배대기중→잔액현황→지급기록→시즌N
//     (재생성 5지점에서 보호 재적용과 함께 순서·행높이도 자동 복구)
//   - ★ 모든 시트 행 높이 35로 통일 (재생성 시 자동 유지)
//   - ★ [📐 시트 정돈] 메뉴: 순서·행높이 즉시 재정렬 + 표준 목록에
//     없는 시트(구버전 '입금입력' 잔재 등)를 확인 후 삭제
//     (삭제는 항상 확인 팝업 필수 — 자동 훅에서는 실행되지 않음)
//   - v2 파일 가져오기(importFromV2)는 옛 파일의 원래 이름
//     '누적기록'을 그대로 찾음 (하위 호환, 리네이밍과 무관)
// ═══════════════════════════════════════════════════════════════

const VERSION = '8.1';
const T2S_MAP = {'國':'国','學':'学','這':'这','個':'个','們':'们','說':'说','話':'话','對':'对','時':'时','間':'间','現':'现','場':'场','開':'开','關':'关','內':'内','東':'东','車':'车','馬':'马','龍':'龙','風':'风','陽':'阳','陰':'阴','電':'电','語':'语','讀':'读','寫':'写','書':'书','紙':'纸','筆':'笔','長':'长','門':'门','問':'问','聽':'听','見':'见','覺':'觉','讓':'让','誰':'谁','還':'还','進':'进','運':'运','動':'动','靜':'静','樂':'乐','藥':'药','華':'华','蘭':'兰','葉':'叶','黃':'黄','麗':'丽','寶':'宝','貴':'贵','財':'财','買':'买','賣':'卖','錢':'钱','銀':'银','鐵':'铁','鋼':'钢','陳':'陈','劉':'刘','張':'张','楊':'杨','蔣':'蒋','鄭':'郑','謝':'谢','呂':'吕','蘇':'苏','韓':'韩','馮':'冯','於':'于','鳳':'凤','雲':'云','劍':'剑','斷':'断','亂':'乱','愛':'爱','聲':'声','醫':'医','藝':'艺','頭':'头','臉':'脸','腳':'脚','氣':'气','樓':'楼','橋':'桥','飛':'飞','機':'机','網':'网','線':'线','條':'条','裡':'里','邊':'边','錯':'错','壞':'坏','舊':'旧','寬':'宽','淺':'浅','週':'周','節':'节','業':'业','後':'后','來':'来','終':'终','結':'结','敗':'败','勝':'胜','負':'负','輸':'输','贏':'赢','強':'强','難':'难','簡':'简','單':'单','複':'复','雜':'杂','純':'纯','淨':'净','髒':'脏','齊':'齐','穩':'稳','變':'变','轉':'转','換':'换','顯':'显','樣':'样','種':'种','類':'类','團':'团','體':'体','統':'统','織':'织','組':'组','構':'构','設':'设','計':'计','劃':'划','數':'数','課':'课','題':'题','試':'试','練':'练','習':'习','師':'师','員':'员','職':'职','務':'务','責':'责','權':'权','應':'应','該':'该','須':'须','願':'愿','夢':'梦','憶':'忆','識':'识','認':'认','歡':'欢','醜':'丑','帥':'帅','靈':'灵','獸':'兽','鷹':'鹰','鶴':'鹤','鴻':'鸿','鱷':'鳄','鯨':'鲸','鯊':'鲨','蝦':'虾','殼':'壳','冑':'胄','戰':'战','爭':'争','鬥':'斗','擊':'击','禦':'御','護':'护','衛':'卫','謀':'谋','陣':'阵','營':'营','軍':'军','隊':'队','將':'将','嬪':'嫔','宮':'宫','廟':'庙','觀':'观','閣':'阁','蓮':'莲','楓':'枫','樺':'桦','檜':'桧','樹':'树','實':'实','幹':'干','莖':'茎','穫':'获','採':'采','鮮':'鲜','籠':'笼','傷':'伤','殺':'杀','斬':'斩','豬':'猪','雞':'鸡','鴨':'鸭','鵝':'鹅','龜':'龟','蟬':'蝉','蟻':'蚁','螞':'蚂','鴉':'鸦','鵰':'雕','鴛':'鸳','鴦':'鸯','賽':'赛','廠':'厂','廣':'广','麼':'么','誒':'诶','歲':'岁','歷':'历','歸':'归','殘':'残','蟲':'虫','貓':'猫','氈':'毡','貫':'贯','質':'质','貨':'货','貼':'贴','費':'费','資':'资','賬':'账','賺':'赚','贈':'赠','賀':'贺','賢':'贤','賦':'赋','賤':'贱','賓':'宾','賴':'赖','齲':'龋','齒':'齿','龄':'齡','齡':'龄','齣':'出','岡':'冈','剛':'刚','剮':'剐','創':'创','劇':'剧','勵':'励','勸':'劝','勻':'匀','匯':'汇','醬':'酱','醞':'酝','釀':'酿','釋':'释','釘':'钉','針':'针','釣':'钓','鈍':'钝','鈴':'铃','鈔':'钞','鉛':'铅','鋸':'锯','鋒':'锋','鍵':'键','鎖':'锁','鑄':'铸','鑼':'锣','錶':'表','鐘':'钟','鏡':'镜','鑽':'钻','鑑':'鉴','閉':'闭','閃':'闪','閏':'闰','閱':'阅','闆':'板','闖':'闯','陸':'陆','隱':'隐','雖':'虽','雙':'双','雛':'雏','靂':'雳','韋':'韦','韌':'韧','頁':'页','頂':'顶','項':'项','順':'顺','頌':'颂','預':'预','頑':'顽','頒':'颁','頗':'颇','領':'领','頡':'颉','頜':'颌','頸':'颈','頻':'频','頹':'颓','顆':'颗','額':'额','顏':'颜','顛':'颠','顧':'顾','飄':'飘','饑':'饥','餃':'饺','餅':'饼','館':'馆','饒':'饶','饞':'馋','馳':'驰','駕':'驾','駛':'驶','駐':'驻','駱':'骆','駭':'骇','騎':'骑','騰':'腾','驅':'驱','驚':'惊','驕':'骄','驗':'验','骯':'肮','髮':'发','鬍':'胡','鬧':'闹','鮑':'鲍','鯉':'鲤','鰲':'鳌','鱉':'鳖','鳥':'鸟','鳴':'鸣','鹹':'咸','麥':'麦','麵':'面','黨':'党'};  // 번체→간체 상용한자 (서체 변환 전용, 다른 뜻 글자는 포함하지 않음)
const UNIT = '다이아';                 // 재화 단위 표기
const MAX_MEMBERS = 50;               // 최대 멤버 수
const INPUT_SHEET = '참여자현황';       // 아이템 등록 시트 (구 입금입력)
const LEDGER_SHEET = '분배대기중';      // 아이템 파이프라인 시트 (구 누적기록)
const MEMBER_START_ROW = 5;           // 참여자현황: 멤버 목록 시작 행
const FUND_NAME = '유일배분(혈비)';     // 혈비 적립 계정명 (멤버DB 표기와 정확히 일치해야 함)
const REMAINDER_NAME = 'TC무식';       // 분배 나머지(1/N 버림 후 잔여분) 귀속 대상 — 군주 캐릭터
const FUND_RATE = 0.1;                // 혈비 비율 (0.1 = 10%)
const FUND_RATE_STR = String(FUND_RATE);
const LEDGER_HEADERS = ['등록일','아이템명','상태','참여인원','참여자명단','인증샷','분배✓','판매금액','혈비','1인당','분배일','입력자','분배자','수정자'];
const LG = { DATE:1, ITEM:2, STATUS:3, CNT:4, NAMES:5, PHOTO:6, CHECK:7, AMOUNT:8, FUND:9, PER:10, DIST:11, INPUTBY:12, DISTBY:13, EDITBY:14 };
const AUDIT_SHEET = '작업기록';         // 등록·분배·정정·삭제 영구 감사 로그 (행 삭제되어도 이력 보존)
const ST_WAIT = '⏳미분배';
const ST_DONE = '✅분배완료';
const PAYOUT_SHEET = '지급기록';
const BAL_COL = { NAME: 1, PENDING: 2, PAID: 3, CNT: 4, CHECK: 5, AMT: 6 };
const PROTECT_MODE = 'warn';           // 'warn'=경고 모드 | 'block'=공유자 차단

// 표준 시트 순서 (시즌N 제외 — 시즌은 번호순 정렬 후 맨 뒤 추가)
const BASE_SHEET_ORDER = ['사용안내', '멤버DB', INPUT_SHEET, LEDGER_SHEET, '잔액현황', PAYOUT_SHEET, AUDIT_SHEET];

// ─────────────────────────────────────────
// 📐 시트 정돈: 표준 순서 정렬 + 행높이 통일 + (확인 후) 불필요 시트 삭제
// ─────────────────────────────────────────
function _canonicalSheetOrder(ss) {
  const seasons = ss.getSheets()
    .map(s => s.getName())
    .filter(n => /^시즌\d+$/.test(n))
    .sort((a, b) => Number(a.replace('시즌', '')) - Number(b.replace('시즌', '')));
  return BASE_SHEET_ORDER.concat(seasons);
}

// 순서 정렬 (안전: 시트 삭제 없음) — 존재하는 표준 시트만 순서대로 이동
function _reorderSheets(ss) {
  const order = _canonicalSheetOrder(ss);
  order.forEach((name, i) => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      sheet.activate();
      ss.moveActiveSheet(i + 1);
    }
  });
}

// 행 높이 35 통일 (안전: 내용 변경 없음, 서식만)
function _normalizeRowHeights(ss) {
  ss.getSheets().forEach(sheet => {
    try {
      const maxRows = Math.max(sheet.getMaxRows(), 1);
      sheet.setRowHeights(1, maxRows, 35);
    } catch (e) { /* 개별 시트 실패는 건너뜀 */ }
  });
}

// ─────────────────────────────────────────
// 🔤 멤버 이름 서식 통일: 폰트 13 / 왼쪽 정렬 / 세로 가운데 정렬
//   대상: 멤버DB(B열), 참여자현황(A열), 잔액현황(A열, "합계" 행 제외)
//   안전: 텍스트·색상·굵기 등은 건드리지 않고 크기·정렬만 설정
// ─────────────────────────────────────────
function _applyMemberNameFormatting(ss) {
  const NAME_STYLE = (range) => {
    try {
      range.setFontSize(13).setHorizontalAlignment('left').setVerticalAlignment('middle');
    } catch (e) { /* 무시 */ }
  };

  const db = ss.getSheetByName('멤버DB');
  if (db) NAME_STYLE(db.getRange(2, 2, MAX_MEMBERS, 1));

  const inp = ss.getSheetByName(INPUT_SHEET);
  if (inp) NAME_STYLE(inp.getRange(MEMBER_START_ROW, 1, MAX_MEMBERS, 1));

  const bal = ss.getSheetByName('잔액현황');
  if (bal && bal.getLastRow() > 1) {
    // "합계" 행은 제외하고 그 위 이름 행들만 대상으로 함
    const colA = bal.getRange(2, 1, bal.getLastRow() - 1, 1).getValues();
    let totalRow = -1;
    colA.forEach((r, i) => { if (String(r[0]).trim() === '합계') totalRow = i + 2; });
    const lastNameRow = totalRow > 0 ? totalRow - 1 : bal.getLastRow();
    if (lastNameRow >= 2) NAME_STYLE(bal.getRange(2, 1, lastNameRow - 1, 1));
  }
}

// 메뉴: 시트 정돈 (순서·행높이 즉시 적용 + 표준 목록 외 시트는 확인 후 삭제)
function tidySheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const known = new Set(BASE_SHEET_ORDER);
  const unknown = ss.getSheets().map(s => s.getName())
    .filter(n => !known.has(n) && !/^시즌\d+$/.test(n));

  let msg = '📐 다음 순서로 시트를 정렬하고 모든 행 높이를 35로 통일합니다:\n\n' +
    _canonicalSheetOrder(ss).join(' → ');
  if (unknown.length > 0) {
    msg += '\n\n⚠️ 표준 목록에 없는 다음 시트는 함께 삭제됩니다:\n' + unknown.join(', ') +
      '\n(직접 만든 메모 시트 등이라면 [취소] 후 이름을 확인해주세요)';
  }
  msg += '\n\n계속할까요?';
  if (ui.alert('📐 시트 정돈', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  try {
    unknown.forEach(name => {
      const s = ss.getSheetByName(name);
      if (s) ss.deleteSheet(s);
    });
    _reorderSheets(ss);
    _normalizeRowHeights(ss);
    _applyMemberNameFormatting(ss);
    let done = '✅ 정돈 완료!\n\n순서: ' + _canonicalSheetOrder(ss).join(' → ') + '\n행 높이 35로 통일됨';
    if (unknown.length > 0) done += '\n\n삭제된 시트: ' + unknown.join(', ');
    ui.alert(done);
  } catch (e) {
    ui.alert('❌ 정돈 실패: ' + e.message);
  }
}

function applyNameFormatMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  try {
    _applyMemberNameFormatting(ss);
    ui.alert('✅ 멤버 이름 서식 통일 완료!\n\n멤버DB·참여자현황·잔액현황의 이름 칸이\n폰트 13 / 왼쪽 정렬 / 세로 가운데 정렬로 맞춰졌습니다.');
  } catch (e) {
    ui.alert('❌ 서식 적용 실패: ' + e.message);
  }
}

// ─────────────────────────────────────────
// 0. 메뉴
// ─────────────────────────────────────────
function onOpen() {
  _ensureAuditLogExists();   // ★ 매번 파일을 열 때마다 영구 로그 시트 존재를 확인·자동 복구
  SpreadsheetApp.getUi()
    .createMenu('🎮 길드정산')
    // ── 일상 사용 ──
    .addItem('📝 아이템 등록 (참여자현황에서)', 'registerItem')
    .addItem('↩️ 최근 지급 취소', 'undoLastPayout')
    .addItem('🔄 분배 정정 (제작자 전용 — 되돌리기/재분배)', 'correctDistribution')
    .addItem('🗑️ 아이템 완전 삭제 (연습/등록실수용 — 제작자 전용)', 'deleteLedgerItem')
    .addSeparator()
    // ── 시즌 관리 ──
    .addItem('🏁 시즌 종료 (기록 보존 후 초기화)', 'seasonEnd')
    .addSeparator()
    // ── 멤버 관리 ──
    .addItem('👥 멤버 동기화 (수동)', 'syncMembersManual')
    .addItem('✏️ 멤버 이름 변경', 'renameMemberManual')
    .addItem('🧹 시트 정리 (중복 제거)', 'cleanupSheets')
    .addItem('🔁 참여횟수 재계산 (레이드 출석 기준)', 'recalcParticipationMenu')
    .addSeparator()
    // ── 시스템 관리 ──
    .addItem('🚀 최초 설치 (새 파일에서 1회 실행)', 'firstTimeInstall')
    .addItem('🔄 데이터 보존 업그레이드 (전체 재구성)', 'upgradeKeepData')
    .addItem('📥 기존 길드정산 파일에서 가져오기 (새 파일로 이전)', 'importFromExisting')
    .addItem('📥 v2 데이터 가져오기 (아주 옛 파일에서)', 'importFromV2')
    .addItem('🔑 웹 API 토큰 (Vercel 앱 연동)', 'manageApiToken')
    .addItem('🔗 디스코드 웹훅 설정', 'setDiscordWebhook')
    .addItem('📤 디스코드로 전송', 'sendLatestToDiscord')
    .addItem('📖 사용안내 새로고침', 'refreshGuide')
    .addItem('📐 시트 정돈 (순서·행높이·불필요 시트 정리)', 'tidySheets')
    .addItem('🔤 멤버 이름 서식 통일', 'applyNameFormatMenu')
    .addItem('🔒 시트 보호 재적용', 'applyProtectionsMenu')
    .addItem('🔓 시트 보호 전체 해제', 'removeProtectionsMenu')
    .addSeparator()
    // ── 위험 구역 ──
    .addItem('⚠️ 공장 초기화 (시즌 기록 포함 전부 삭제)', 'firstTimeSetup')
    .addToUi();
}

// ─────────────────────────────────────────
// 🏁 시즌 종료: 스냅샷 보존 → 초기화 → 시즌 번호 증가
// ─────────────────────────────────────────
function seasonEnd() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();

  // 시즌 번호 결정 (저장값 우선, 시트 이름 충돌 시 자동 증가)
  let season = Number(props.getProperty('SEASON_NUM')) || 1;
  while (ss.getSheetByName('시즌' + season)) season++;

  const ledger = ss.getSheetByName(LEDGER_SHEET);
  const bal = ss.getSheetByName('잔액현황');
  const payLog = ss.getSheetByName(PAYOUT_SHEET);
  if (!ledger || !bal) { ui.alert('❌ ' + LEDGER_SHEET + '/잔액현황 시트를 찾을 수 없습니다.'); return; }

  const settleCount = Math.max(ledger.getLastRow() - 1, 0);

  // 미분배 아이템 잔존 검사
  let waitCount = 0;
  if (settleCount > 0) {
    ledger.getRange(2, LG.STATUS, settleCount, 1).getValues().forEach(r => {
      if (String(r[0]).trim() === ST_WAIT) waitCount++;
    });
  }

  // 미지급(분배전) 잔액 경고
  let unpaidCount = 0, unpaidSum = 0;
  if (bal.getLastRow() > 1) {
    bal.getRange(2, 1, bal.getLastRow() - 1, BAL_COL.PENDING).getValues().forEach(r => {
      const nm = String(r[0]).trim();
      const p = Number(String(r[BAL_COL.PENDING - 1]).replace(/,/g, '')) || 0;
      if (nm && nm !== '합계' && p > 0) { unpaidCount++; unpaidSum += p; }
    });
  }

  let msg = `🏁 시즌 ${season}을(를) 종료합니다.\n\n· 아이템 기록 ${settleCount}건과 잔액·지급 내역이\n  [시즌${season}] 시트에 보존됩니다.\n· 이후 ${LEDGER_SHEET}·지급기록·잔액이 초기화되고\n  시즌 ${season + 1}이 시작됩니다.`;
  if (waitCount > 0) {
    msg += `\n\n🚨 ${ST_WAIT} 아이템 ${waitCount}건이 남아있습니다!\n   시즌 종료 전에 분배(판매)를 먼저 완료하는 것을 강력히 권장합니다.\n   (종료하면 미분배 상태 그대로 시즌 시트에 보존되고 초기화됨)`;
  }
  if (unpaidCount > 0) {
    msg += `\n\n⚠️ 아직 지급하지 않은 분배전 잔액이 있습니다!\n   ${unpaidCount}명 · 총 ${unpaidSum.toLocaleString()} ${UNIT}\n   (기록은 보존되지만 새 시즌 잔액은 0으로 시작)`;
  }
  msg += '\n\n계속할까요?';
  if (ui.alert('🏁 시즌 종료 확인', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  try {
    const members = _getMembers(ss);

    // ═══ 1) 시즌N 스냅샷 시트 생성 ═══
    const arch = ss.insertSheet('시즌' + season);
    arch.setColumnWidth(1, 140);
    for (let c = 2; c <= 14; c++) arch.setColumnWidth(c, 100);
    arch.setColumnWidth(5, 240);
    let row = 1;

    // 제목
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    arch.getRange(row, 1, 1, 14).merge()
      .setValue(`🏁 시즌 ${season} 최종 기록  (종료일: ${today} · 정산 ${settleCount}건)`)
      .setBackground('#1A237E').setFontColor('#FFF').setFontWeight('bold').setFontSize(13)
      .setHorizontalAlignment('center');
    arch.setRowHeight(row, 40);
    row += 2;

    // ── 섹션 A: 최종 잔액현황 ──
    row = _archiveSection(arch, row, '💰 최종 잔액현황',
      [['멤버','분배전('+UNIT+')','분배완료('+UNIT+')','참여횟수']],
      bal.getLastRow() > 1
        ? bal.getRange(2, 1, bal.getLastRow() - 1, 4).getDisplayValues().filter(r => String(r[0]).trim())
        : []);

    // ── 섹션 B: 정산 이력 (인증샷은 URL 텍스트로 보존, 입력자/분배자/수정자 포함) ──
    let ledgerRows = [];
    if (settleCount > 0) {
      const disp = ledger.getRange(2, 1, settleCount, 14).getDisplayValues();
      const fmls = ledger.getRange(2, LG.PHOTO, settleCount, 1).getFormulas();
      ledgerRows = disp.map((r, i) => {
        const m = (fmls[i][0] || '').match(/HYPERLINK\("([^"]+)"/);
        if (m) r[LG.PHOTO - 1] = m[1];
        return r;
      });
    }
    row = _archiveSection(arch, row, '📄 아이템·분배 이력', [LEDGER_HEADERS], ledgerRows);

    // ── 섹션 C: 시즌 요약 통계 (아이템 이력에서 자동 집계) ──
    const doneRows = ledgerRows.filter(r => String(r[LG.STATUS - 1]).trim() === ST_DONE);
    const totalAmount = doneRows.reduce((sum, r) => sum + (Number(String(r[LG.AMOUNT - 1]).replace(/,/g, '')) || 0), 0);
    const totalFund = doneRows.reduce((sum, r) => sum + (Number(String(r[LG.FUND - 1]).replace(/,/g, '')) || 0), 0);
    const partTally = {};
    ledgerRows.forEach(r => {
      String(r[LG.NAMES - 1] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(p => {
        partTally[p] = (partTally[p] || 0) + 1;
      });
    });
    const partEntries = Object.entries(partTally).sort((a, b) => b[1] - a[1]);
    const topParticipant = partEntries.length > 0 ? `${partEntries[0][0]} (${partEntries[0][1]}회)` : '-';
    const summaryRows = [
      ['총 등록 아이템 수', ledgerRows.length + '건'],
      ['분배 완료된 아이템 수', doneRows.length + '건'],
      ['미분배로 종료된 아이템 수', (ledgerRows.length - doneRows.length) + '건'],
      ['총 분배 ' + UNIT, totalAmount.toLocaleString() + UNIT],
      ['총 혈비(' + FUND_NAME + ') 적립액', totalFund.toLocaleString() + UNIT],
      ['이번 시즌 참여 인원(고유)', Object.keys(partTally).length + '명'],
      ['최다 참여자', topParticipant],
    ];
    row = _archiveSection(arch, row, '📊 시즌 요약 통계', [['항목','값']], summaryRows);

    // ── 섹션 D: 지급 이력 ──
    const payRows = (payLog && payLog.getLastRow() > 1)
      ? payLog.getRange(2, 1, payLog.getLastRow() - 1, 3).getDisplayValues()
      : [];
    row = _archiveSection(arch, row, '💸 지급 이력', [['날짜','멤버','지급액(다이아)']], payRows);

    arch.setTabColor('#9E9E9E');

    // ═══ 2) 초기화 ═══
    if (settleCount > 0) ledger.deleteRows(2, settleCount);
    if (payLog && payLog.getLastRow() > 1) payLog.deleteRows(2, payLog.getLastRow() - 1);
    // 잔액현황: 멤버DB 기준 새로 생성 (미등록 행 제거 — 시즌 시트에 보존됨)
    ss.deleteSheet(bal);
    _buildBalance(ss, members);
    // 참여자현황: 입력값·체크 초기화
    const input = ss.getSheetByName(INPUT_SHEET);
    if (input) {
      input.getRange('B1').clearContent();
      input.getRange('B2').clearContent();
      input.getRange('B6').clearContent();
      const names = input.getRange(MEMBER_START_ROW, 1, MAX_MEMBERS, 1).getValues();
      let last = -1;
      names.forEach((r, i) => { if (String(r[0]).trim()) last = i; });
      if (last >= 0) input.getRange(MEMBER_START_ROW, 2, last + 1, 1).setValue(false);
    }

    // ═══ 3) 시즌 번호 증가 ═══
    props.setProperty('SEASON_NUM', String(season + 1));
    _reorderSheets(ss);
    _normalizeRowHeights(ss);
    _applyMemberNameFormatting(ss);
    _applyProtections(ss);

    ui.alert(`✅ 시즌 ${season} 종료 완료!\n\n· [시즌${season}] 시트에 모든 기록이 보존되었습니다.\n· 시즌 ${season + 1}이 시작되었습니다. (기록 초기화됨)`);
  } catch (e) {
    ui.alert('❌ 시즌 종료 실패: ' + e.message + '\n\n[시즌' + season + '] 시트가 생성되었다면 데이터는 보존된 상태이니, 오류 확인 후 다시 실행해주세요.');
  }
}

// 아카이브 섹션 쓰기 헬퍼: 제목 + 헤더 + 데이터 → 다음 시작 행 반환
function _archiveSection(sheet, startRow, title, headerRows, dataRows) {
  let row = startRow;
  const cols = headerRows[0].length;
  sheet.getRange(row, 1, 1, cols).merge()
    .setValue(title).setBackground('#455A64').setFontColor('#FFF').setFontWeight('bold');
  row++;
  sheet.getRange(row, 1, 1, cols).setValues(headerRows)
    .setBackground('#ECEFF1').setFontWeight('bold').setHorizontalAlignment('center');
  row++;
  if (dataRows.length > 0) {
    sheet.getRange(row, 1, dataRows.length, cols).setValues(dataRows);
    row += dataRows.length;
  } else {
    sheet.getRange(row, 1).setValue('(기록 없음)').setFontColor('#999');
    row++;
  }
  return row + 1; // 섹션 간 한 줄 여백
}

// ─────────────────────────────────────────
// ★ onEdit 자동 트리거
//   · 단일 셀 수정 + 기존 값 있음 → "개명"으로 처리 (제자리 변경)
//   · 빈 칸에 새 이름 입력 → "신규 멤버"로 처리 (행 추가)
//   · 이름 삭제 → 경고만 (자동 삭제 안 함)
//   · 여러 셀 붙여넣기 → 일반 동기화
// ─────────────────────────────────────────
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();

    // ═══ 누적기록: 분배✓ 체크 → 판매금액 입력 → 분배 실행 ═══
    if (sheetName === LEDGER_SHEET) {
      if (e.range.getColumn() > LG.CHECK || e.range.getLastColumn() < LG.CHECK) return;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const startR = Math.max(e.range.getRow(), 2);
      const endR = e.range.getLastRow();
      for (let r = startR; r <= endR; r++) {
        if (sheet.getRange(r, LG.CHECK).getValue() === true) _processDistribute(ss, sheet, r);
      }
      return;
    }

    // ═══ 잔액현황: 지급✓ 체크 → 중간정산 처리 ═══
    if (sheetName === '잔액현황') {
      if (e.range.getColumn() > BAL_COL.CHECK || e.range.getLastColumn() < BAL_COL.CHECK) return;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const startR = Math.max(e.range.getRow(), 2);
      const endR = e.range.getLastRow();
      for (let r = startR; r <= endR; r++) {
        const checked = sheet.getRange(r, BAL_COL.CHECK).getValue();
        if (checked === true) _processPayout(ss, sheet, r);
      }
      return;
    }

    if (sheetName !== '멤버DB') return;
    if (e.range.getColumn() > 2 || e.range.getLastColumn() < 2) return;
    if (e.range.getLastRow() < 2 || e.range.getRow() > MAX_MEMBERS + 1) return;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const isSingleCell = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;

    if (isSingleCell) {
      const oldName = e.oldValue !== undefined ? String(e.oldValue).trim() : '';
      const newName = e.value !== undefined ? String(e.value).trim() : '';

      // ① 개명: 기존 이름 → 새 이름
      if (oldName && newName && oldName !== newName) {
        const r = _renameMember(ss, oldName, newName);
        ss.toast(r.message, '✏️ 개명 처리', 6);
        return;
      }
      // ② 이름 삭제: 경고만
      if (oldName && !newName) {
        ss.toast(`"${oldName}" 삭제 감지. 잔액 보존을 위해 시트에는 남겨둡니다.\n정리하려면 [🧹 시트 정리] 실행`, '⚠️ 확인 필요', 8);
        return;
      }
      // ③ 신규 입력: 아래 일반 동기화로 진행
    }

    // 신규 멤버 추가 / 여러 셀 붙여넣기 → 일반 동기화
    const result = _syncMembers(ss);
    if (result.added.length > 0) {
      ss.toast('참여자현황·잔액현황에 추가됨: ' + result.added.join(', '), '👥 멤버 동기화 완료', 5);
    }
    if (result.removed.length > 0) {
      ss.toast('멤버DB에서 사라진 이름: ' + result.removed.join(', ') +
        ' → [🧹 시트 정리]로 정리 가능', '⚠️ 확인 필요', 8);
    }
    // ★ 다건 편집(붙여넣기 등)으로 개명이 놓쳤을 수 있는 경우 자동 감지
    const candidates = _findRenameCandidates(ss);
    if (candidates.length > 0) {
      ss.toast(`개명으로 추정되는 항목 ${candidates.length}건 발견 → [🔀 개명 후보 확인] 메뉴에서 확인해주세요.`, '🔀 확인 필요', 8);
    }
  } catch (err) {
    // onEdit는 조용히 실패 허용 (수동 메뉴로 복구 가능)
  }
}

// ─────────────────────────────────────────
// ★ 중간정산: 지급✓ 체크 시 분배전 → 분배완료 이동
// ─────────────────────────────────────────
// 분배✓ onEdit 래퍼: H열(판매금액) 선입력 시 즉시, 비었으면 팝업
function _processDistribute(ss, ledger, row) {
  const uncheck = () => ledger.getRange(row, LG.CHECK).setValue(false);
  const status = String(ledger.getRange(row, LG.STATUS).getValue()).trim();
  const itemName = String(ledger.getRange(row, LG.ITEM).getValue()).trim();

  if (status === ST_DONE) {
    uncheck();
    ss.toast(`"${itemName}"은(는) 이미 분배된 아이템입니다.`, 'ℹ️ 분배', 4);
    return;
  }
  if (status !== ST_WAIT) { uncheck(); return; }

  // 판매금액: H열 선입력 우선, 없으면 팝업
  let amount = String(ledger.getRange(row, LG.AMOUNT).getValue()).trim();
  if (amount === '') {
    const n = Number(ledger.getRange(row, LG.CNT).getValue()) || 0;
    try {
      const ui = SpreadsheetApp.getUi();
      const resp = ui.prompt('💎 아이템 분배 — ' + itemName,
        '참여 ' + n + '명 · 혈비 ' + Math.round(FUND_RATE * 100) + '% 공제 후 1/N 분배됩니다.\n\n' +
        '판매금액(' + UNIT + ')을 입력하세요:',
        ui.ButtonSet.OK_CANCEL);
      if (resp.getSelectedButton() !== ui.Button.OK) { uncheck(); return; }
      amount = resp.getResponseText().trim();
    } catch (e) {
      // UI 불가 환경(모바일 시트 앱) → H열에 금액을 적고 체크하거나 웹앱 사용
      uncheck();
      return;
    }
  }

  const r = _distributeCore(ss, ledger, row, amount);
  if (!r.ok) {
    uncheck();
    if (r.reason === 'invalid') ss.toast('판매금액은 양의 정수여야 합니다. (입력값: ' + amount + ')', '⚠️ 분배', 6);
    else if (r.reason === 'done') ss.toast(`"${itemName}"은(는) 이미 분배되었습니다.`, 'ℹ️ 분배', 4);
    else if (r.reason === 'noparts') ss.toast('참여자명단이 비어 있습니다.', '⚠️ 분배', 5);
    return;
  }
  let msg = `"${r.item}" ${r.amount.toLocaleString()}${UNIT} 분배 완료 — 혈비 ${r.fund.toLocaleString()} / ${r.n}명 × ${r.perPerson.toLocaleString()}${r.fundNote}`;
  if (r.remainder > 0) msg += ` / 나머지 ${r.remainder}${UNIT} → ${r.remainderTo}`;
  if (r.missing.length > 0) msg += ` ⚠️ 미발견: ${r.missing.join(', ')}`;
  ss.toast(msg, '💎 분배', 7);
}

function _processPayout(ss, bal, row) {
  // F열(지급액)이 비어있으면 금액 입력 팝업 표시 (미리 적어둔 경우 팝업 생략)
  let amtOverride = null;
  const fCell = String(bal.getRange(row, BAL_COL.AMT).getValue()).trim();
  if (fCell === '') {
    const name = String(bal.getRange(row, BAL_COL.NAME).getValue()).trim();
    const pending = Number(String(bal.getRange(row, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;
    if (name && name !== '합계' && pending > 0) {
      try {
        const ui = SpreadsheetApp.getUi();
        const resp = ui.prompt('💸 중간정산 — ' + name,
          '분배전: ' + pending.toLocaleString() + ' ' + UNIT + '\n\n' +
          '지급할 ' + UNIT + ' 수를 입력하세요.\n' +
          '· 빈칸으로 [확인] → 전액 지급\n' +
          '· 숫자 입력 → 그 금액만 지급 (분배전 이하)\n' +
          '· [취소] → 지급하지 않음',
          ui.ButtonSet.OK_CANCEL);
        if (resp.getSelectedButton() !== ui.Button.OK) {
          bal.getRange(row, BAL_COL.CHECK).setValue(false);
          return;
        }
        const txt = resp.getResponseText().trim();
        if (txt !== '' && txt !== '전액') amtOverride = txt;
      } catch (e) {
        // UI 사용 불가 환경(모바일 시트 앱 등) → 기존 방식(전액 지급)으로 진행
      }
    }
  }
  const r = _payoutCore(ss, bal, row, amtOverride);
  if (r.skip) return;
  if (!r.ok) {
    if (r.reason === 'over') {
      ss.toast(`"${r.name}" 지급액 ${r.amt.toLocaleString()}${UNIT}가 분배전(${r.pending.toLocaleString()}${UNIT})보다 큽니다. 금액을 수정 후 다시 체크해주세요.`, '⚠️ 중간정산', 7);
    } else if (r.reason === 'invalid') {
      ss.toast(`"${r.name}" 지급액이 올바르지 않습니다. 양의 정수를 입력하거나, 전액 지급은 비워두고 체크해주세요.`, '⚠️ 중간정산', 7);
    } else {
      ss.toast(`"${r.name}" 분배전 금액이 0입니다. 처리할 것이 없습니다.`, 'ℹ️ 중간정산', 4);
    }
    return;
  }
  if (r.partial) {
    ss.toast(`"${r.name}" ${r.moved.toLocaleString()}${UNIT} 부분 지급 완료 (잔여 분배전 ${r.remain.toLocaleString()}${UNIT})`, '💸 중간정산', 6);
  } else {
    ss.toast(`"${r.name}" ${r.moved.toLocaleString()}${UNIT} 전액 지급완료 처리`, '💸 중간정산', 5);
  }
}

// ★ 지급 코어 (체크박스 트리거 + 모바일 웹앱 공용, UI 호출 없음)
//   amtOverride: 웹앱에서 전달하는 지급액 (null이면 시트 F열 "지급액" 참조)
//   F열이 비어있으면 전액 지급, 금액이 있으면 그 금액만 부분 지급
function _payoutCore(ss, bal, row, amtOverride, clientEmail) {
  const name = String(bal.getRange(row, BAL_COL.NAME).getValue()).trim();
  const uncheck = () => bal.getRange(row, BAL_COL.CHECK).setValue(false);
  const clearAmt = () => bal.getRange(row, BAL_COL.AMT).clearContent();

  if (!name || name === '합계') { uncheck(); return { skip: true }; }

  const pending = Number(String(bal.getRange(row, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;
  if (pending <= 0) { uncheck(); return { ok: false, name: name, moved: 0, reason: 'zero' }; }

  // 지급액 결정: override > F열 입력 > 전액
  let payAmt = pending;
  let rawStr = '';
  if (amtOverride !== undefined && amtOverride !== null) {
    rawStr = String(amtOverride).trim();
  } else {
    rawStr = String(bal.getRange(row, BAL_COL.AMT).getValue()).trim();
  }
  if (rawStr !== '') {
    const amt = Number(rawStr.replace(/,/g, ''));
    if (!amt || amt <= 0 || amt !== Math.floor(amt)) {
      uncheck();
      return { ok: false, name: name, moved: 0, reason: 'invalid', pending: pending };
    }
    if (amt > pending) {
      uncheck();
      return { ok: false, name: name, moved: 0, reason: 'over', pending: pending, amt: amt };
    }
    payAmt = amt;
  }

  const paid = Number(String(bal.getRange(row, BAL_COL.PAID).getValue()).replace(/,/g, '')) || 0;
  bal.getRange(row, BAL_COL.PAID).setValue(paid + payAmt);
  bal.getRange(row, BAL_COL.PENDING).setValue(pending - payAmt);
  uncheck();
  clearAmt();

  // 지급기록 로그 (처리자 포함)
  const actor = _getActorEmail(clientEmail);
  const log = _getOrCreatePayoutLog(ss);
  log.appendRow([new Date(), name, payAmt, actor]);
  const lr = log.getLastRow();
  log.getRange(lr, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  log.getRange(lr, 3).setNumberFormat('#,##0');
  _logAction(ss, '지급', name, actor, payAmt.toLocaleString() + UNIT + (payAmt < pending ? ' (부분지급)' : ' (전액)'));

  return { ok: true, name: name, moved: payAmt, remain: pending - payAmt, partial: payAmt < pending };
}

// ─────────────────────────────────────────
// ↩️ 최근 지급 취소 (실수 클릭 복구)
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// 🔄 분배 정정 (제작자 전용 — PC 메뉴에서만 제공, 모바일 웹앱 미노출)
//   이미 분배완료(✅)된 아이템의 금액을 되돌리거나, 되돌린 뒤
//   새 금액으로 즉시 재분배한다.
//   ★ 안전장치: 되돌릴 금액만큼 분배전 잔액이 남아있지 않은 대상이
//     있으면(이미 지급✓ 처리됨) 데이터 정합성을 위해 안전하게 중단.
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// 🗑️ 아이템 완전 삭제 (제작자 전용 — 연습 항목·등록 실수 정리용)
//   등록만 된 항목(⏳)은 바로 삭제. 이미 분배된 항목(✅)은
//   correctDistribution과 동일한 안전장치로 먼저 금액을 되돌린
//   뒤 삭제한다. 삭제 후 참여횟수는 자동 재계산된다.
// ─────────────────────────────────────────
function deleteLedgerItem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const ledger = ss.getSheetByName(LEDGER_SHEET);
  const balance = ss.getSheetByName('잔액현황');
  if (!ledger) { ui.alert('❌ ' + LEDGER_SHEET + ' 시트를 찾을 수 없습니다.'); return; }

  const r1 = ui.prompt('🗑️ 아이템 완전 삭제',
    '삭제할 아이템명을 정확히 입력하세요.\n(연습 항목, 잘못 등록한 항목 정리용 — 삭제하면 기록이 완전히 사라지고 되돌릴 수 없습니다)',
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const itemName = r1.getResponseText().trim();
  if (!itemName) { ui.alert('⚠️ 아이템명을 입력해주세요.'); return; }

  const lastRow = ledger.getLastRow();
  if (lastRow < 2) { ui.alert('⚠️ 등록된 항목이 없습니다.'); return; }
  const rows = ledger.getRange(2, 1, lastRow - 1, 14).getValues();
  const candidates = [];
  rows.forEach((r, i) => {
    if (String(r[LG.ITEM - 1]).trim() === itemName) candidates.push({ row: i + 2, data: r });
  });
  if (candidates.length === 0) {
    ui.alert('⚠️ "' + itemName + '" 이름의 항목을 찾지 못했습니다.');
    return;
  }
  candidates.sort((a, b) => b.row - a.row);
  const target = candidates[0];
  if (candidates.length > 1) {
    ui.alert('ℹ️ 동일 이름 항목이 ' + candidates.length + '건 있어, 가장 최근 건(행 ' + target.row + ')을 삭제 대상으로 합니다.');
  }

  const row = target.row;
  const data = target.data;
  const status = String(data[LG.STATUS - 1]).trim();
  const namesStr = String(data[LG.NAMES - 1]).trim();
  const participants = namesStr.split(',').map(s => s.trim()).filter(Boolean);
  const n = participants.length;

  let oldSplit = null;
  let remainderTarget = null;
  const findRowFactory = () => {
    const balData = balance.getRange(2, 1, Math.max(balance.getLastRow() - 1, 1), 4).getValues();
    const map = {};
    balData.forEach((r3, i) => { const nm = String(r3[0]).trim(); if (nm && nm !== '합계') map[_normName(nm)] = i + 2; });
    return (nm) => map[_normName(nm)];
  };
  const pendingOf = (r3) => Number(String(balance.getRange(r3, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;

  if (status === ST_DONE) {
    if (!balance) { ui.alert('❌ 잔액현황 시트를 찾을 수 없어 안전하게 삭제할 수 없습니다.'); return; }
    const oldAmount = Number(data[LG.AMOUNT - 1]) || 0;
    oldSplit = _calcSplit(oldAmount, n);
    const members = _getMembers(ss);
    remainderTarget = members.find(m => _coreName(m) === REMAINDER_NAME) || (members.filter(m => m !== FUND_NAME)[0]);

    // ── 안전성 검사: 되돌릴 금액만큼 분배전 잔액이 남아있는지 ──
    const findRow = findRowFactory();
    const insufficient = [];
    participants.forEach(p => {
      const r3 = findRow(p);
      const pending = r3 ? pendingOf(r3) : 0;
      if (!r3 || pending < oldSplit.perPerson) {
        insufficient.push(p + ' (분배전 ' + pending.toLocaleString() + ' < 필요 ' + oldSplit.perPerson.toLocaleString() + ')');
      }
    });
    if (oldSplit.fund > 0) {
      const fr = findRow(FUND_NAME);
      const pending = fr ? pendingOf(fr) : 0;
      if (!fr || pending < oldSplit.fund) insufficient.push(FUND_NAME + ' (분배전 ' + pending.toLocaleString() + ' < 필요 ' + oldSplit.fund.toLocaleString() + ')');
    }
    if (oldSplit.remainder > 0) {
      const rr = findRow(remainderTarget);
      const pending = rr ? pendingOf(rr) : 0;
      if (!rr || pending < oldSplit.remainder) insufficient.push(remainderTarget + '(나머지) (분배전 ' + pending.toLocaleString() + ' < 필요 ' + oldSplit.remainder.toLocaleString() + ')');
    }
    if (insufficient.length > 0) {
      ui.alert('❌ 삭제할 수 없습니다.\n\n다음 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다:\n\n' +
        insufficient.join('\n') + '\n\n지급 기록을 확인한 뒤 다시 시도해주세요.');
      return;
    }
  }

  // ── 확인 팝업 ──
  let msg = `📦 ${itemName} (행 ${row}, 상태: ${status})\n참여자 ${n}명\n`;
  if (status === ST_DONE) {
    msg += `\n[삭제 전 되돌릴 금액] 1인당 ${oldSplit.perPerson.toLocaleString()} / 혈비 ${oldSplit.fund.toLocaleString()} / 나머지 ${oldSplit.remainder.toLocaleString()}→${remainderTarget}\n`;
  }
  msg += `\n⚠️ 이 아이템 기록을 완전히 삭제합니다(되돌릴 수 없음).\n참여자의 참여횟수도 자동으로 재계산되어 이 항목만큼 줄어듭니다.\n\n계속할까요?`;
  if (ui.alert('🗑️ 삭제 확인', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  try {
    // ── 이미 분배된 경우: 금액부터 안전하게 되돌림 (개별 추적) ──
    if (status === ST_DONE) {
      const findRow = findRowFactory();
      const reversed = [];
      const failed = [];
      participants.forEach(p => {
        try {
          const r3 = findRow(p);
          if (!r3) { failed.push(p + ' (잔액현황에 없음)'); return; }
          balance.getRange(r3, BAL_COL.PENDING).setValue(pendingOf(r3) - oldSplit.perPerson);
          reversed.push(p);
        } catch (e) { failed.push(p + ' (' + e.message + ')'); }
      });
      if (oldSplit.fund > 0) {
        try {
          const fr = findRow(FUND_NAME);
          if (!fr) { failed.push(FUND_NAME + ' (잔액현황에 없음)'); }
          else {
            const cnt = Number(balance.getRange(fr, BAL_COL.CNT).getValue()) || 0;
            balance.getRange(fr, BAL_COL.PENDING).setValue(pendingOf(fr) - oldSplit.fund);
            balance.getRange(fr, BAL_COL.CNT).setValue(Math.max(cnt - 1, 0));
            reversed.push(FUND_NAME);
          }
        } catch (e) { failed.push(FUND_NAME + ' (' + e.message + ')'); }
      }
      if (oldSplit.remainder > 0) {
        try {
          const rr = findRow(remainderTarget);
          if (!rr) { failed.push(remainderTarget + '(나머지) (잔액현황에 없음)'); }
          else {
            balance.getRange(rr, BAL_COL.PENDING).setValue(pendingOf(rr) - oldSplit.remainder);
            reversed.push(remainderTarget + '(나머지)');
          }
        } catch (e) { failed.push(remainderTarget + '(나머지) (' + e.message + ')'); }
      }

      if (failed.length > 0) {
        ui.alert('⚠️ 금액 되돌리기가 일부만 반영되어 삭제를 중단했습니다.\n\n' +
          '✅ 반영됨(' + reversed.length + '건): ' + reversed.join(', ') + '\n\n' +
          '❌ 실패함(' + failed.length + '건): ' + failed.join(', ') + '\n\n' +
          '행은 삭제되지 않았습니다(누적기록 상태는 "' + ST_DONE + '"로 유지됨).\n' +
          '반영된 항목은 이미 되돌려졌으니, 실패한 항목만 수동 조정 후 다시 시도해주세요.');
        return;
      }
    }

    // ── 삭제 전 로그 기록 (행이 사라지기 전에 남겨야 함) ──
    const actor = _getActorEmail();
    const detail = (status === ST_DONE
      ? (Number(data[LG.AMOUNT - 1]) || 0).toLocaleString() + UNIT + ' 분배분 되돌린 뒤 삭제'
      : '미분배 상태에서 삭제') + ' (참여 ' + n + '명)';
    _logAction(ss, '삭제', itemName, actor, detail);

    // ── 누적기록 행 완전 삭제 ──
    ledger.deleteRow(row);
    // ── 참여횟수 재계산 (삭제된 행은 더 이상 등록 이력에 포함되지 않음) ──
    _recalcAllParticipationCounts(ss);
    _applyProtections(ss);

    ui.alert(`✅ "${itemName}" 삭제 완료.\n참여횟수가 자동으로 재계산되었습니다.`);
  } catch (e) {
    ui.alert('❌ 삭제 실패: ' + e.message + '\n\n일부만 반영되었을 수 있으니 잔액현황·' + LEDGER_SHEET + '을 확인해주세요.');
  }
}

function correctDistribution() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const ledger = ss.getSheetByName(LEDGER_SHEET);
  const balance = ss.getSheetByName('잔액현황');
  if (!ledger || !balance) { ui.alert('❌ ' + LEDGER_SHEET + '/잔액현황 시트를 찾을 수 없습니다.'); return; }

  const r1 = ui.prompt('🔄 분배 정정', '정정할 아이템명을 정확히 입력하세요 (분배완료 상태만 가능):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const itemName = r1.getResponseText().trim();
  if (!itemName) { ui.alert('⚠️ 아이템명을 입력해주세요.'); return; }

  const lastRow = ledger.getLastRow();
  if (lastRow < 2) { ui.alert('⚠️ 등록된 항목이 없습니다.'); return; }
  const rows = ledger.getRange(2, 1, lastRow - 1, 14).getValues();
  const candidates = [];
  rows.forEach((r, i) => {
    if (String(r[LG.ITEM - 1]).trim() === itemName && String(r[LG.STATUS - 1]).trim() === ST_DONE) {
      candidates.push({ row: i + 2, data: r });
    }
  });
  if (candidates.length === 0) {
    ui.alert('⚠️ "' + itemName + '" 이름의 분배완료 항목을 찾지 못했습니다.\n(이름이 다르거나, 이미 미분배 상태이거나, 이미 정정했을 수 있습니다)');
    return;
  }
  candidates.sort((a, b) => b.row - a.row);
  const target = candidates[0];
  if (candidates.length > 1) {
    ui.alert('ℹ️ 동일 이름의 분배완료 항목이 ' + candidates.length + '건 있어, 가장 최근 건(행 ' + target.row + ')을 대상으로 진행합니다.');
  }

  const row = target.row;
  const data = target.data;
  const oldAmount = Number(data[LG.AMOUNT - 1]) || 0;
  const namesStr = String(data[LG.NAMES - 1]).trim();
  const participants = namesStr.split(',').map(s => s.trim()).filter(Boolean);
  const n = participants.length;
  if (n === 0) { ui.alert('❌ 참여자 명단을 읽을 수 없습니다.'); return; }

  const oldSplit = _calcSplit(oldAmount, n);
  const members = _getMembers(ss);
  const remainderTarget = members.find(m => _coreName(m) === REMAINDER_NAME) ||
                          (members.filter(m => m !== FUND_NAME)[0]);

  const r2 = ui.prompt('🔄 분배 정정 — ' + itemName,
    '현재 판매금액: ' + oldAmount.toLocaleString() + ' ' + UNIT + ' (' + n + '명)\n\n' +
    '새 판매금액을 입력하세요.\n· 숫자 입력 → 되돌린 후 새 금액으로 즉시 재분배\n· 빈칸 + 확인 → 되돌리기만 하고 ' + ST_WAIT + ' 상태로 복귀',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const newAmountStr = r2.getResponseText().trim();
  let newAmount = null;
  if (newAmountStr !== '') {
    newAmount = Number(newAmountStr.replace(/,/g, ''));
    if (!newAmount || newAmount <= 0 || newAmount !== Math.floor(newAmount)) {
      ui.alert('⚠️ 새 판매금액은 양의 정수여야 합니다.');
      return;
    }
  }

  // ── 잔액현황 조회 ──
  const balData = balance.getRange(2, 1, Math.max(balance.getLastRow() - 1, 1), 4).getValues();
  const nameToRow = {};
  balData.forEach((r3, i) => {
    const nm = String(r3[0]).trim();
    if (nm && nm !== '합계') nameToRow[_normName(nm)] = i + 2;
  });
  const findRow = (nm) => nameToRow[_normName(nm)];
  const pendingOf = (r3) => Number(String(balance.getRange(r3, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;

  // ── 안전성 검사: 되돌릴 금액만큼 분배전 잔액이 남아있는지 ──
  const insufficient = [];
  participants.forEach(p => {
    const r3 = findRow(p);
    const pending = r3 ? pendingOf(r3) : 0;
    if (!r3 || pending < oldSplit.perPerson) {
      insufficient.push(p + ' (분배전 ' + pending.toLocaleString() + ' < 필요 ' + oldSplit.perPerson.toLocaleString() + ')');
    }
  });
  if (oldSplit.fund > 0) {
    const fr = findRow(FUND_NAME);
    const pending = fr ? pendingOf(fr) : 0;
    if (!fr || pending < oldSplit.fund) insufficient.push(FUND_NAME + ' (분배전 ' + pending.toLocaleString() + ' < 필요 ' + oldSplit.fund.toLocaleString() + ')');
  }
  if (oldSplit.remainder > 0) {
    const rr = findRow(remainderTarget);
    const pending = rr ? pendingOf(rr) : 0;
    if (!rr || pending < oldSplit.remainder) insufficient.push(remainderTarget + '(나머지분) (분배전 ' + pending.toLocaleString() + ' < 필요 ' + oldSplit.remainder.toLocaleString() + ')');
  }
  if (insufficient.length > 0) {
    ui.alert('❌ 정정할 수 없습니다.\n\n다음 대상이 이미 지급✓ 처리되어 분배전 잔액이 부족합니다(이미 실제로 지급되었을 가능성):\n\n' +
      insufficient.join('\n') +
      '\n\n지급 기록을 확인하거나 잔액을 수동 조정한 뒤 다시 시도해주세요.');
    return;
  }

  // ── 확인 팝업 ──
  let msg = `📦 ${itemName} (행 ${row})\n\n[되돌릴 내역]\n참여자 1인당 ${oldSplit.perPerson.toLocaleString()} / 혈비 ${oldSplit.fund.toLocaleString()} / 나머지 ${oldSplit.remainder.toLocaleString()}→${remainderTarget}\n`;
  if (newAmount !== null) {
    const newSplit = _calcSplit(newAmount, n);
    msg += `\n[새 판매금액] ${newAmount.toLocaleString()} ${UNIT}\n→ 참여자 1인당 ${newSplit.perPerson.toLocaleString()} / 혈비 ${newSplit.fund.toLocaleString()} / 나머지 ${newSplit.remainder.toLocaleString()}→${remainderTarget}`;
  } else {
    msg += `\n(재분배 금액 미입력 — 되돌리기만 하고 ${ST_WAIT} 상태로 복귀합니다)`;
  }
  msg += '\n\n계속할까요?';
  if (ui.alert('🔄 분배 정정 확인', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  // ── 되돌리기 실행 (참여횟수는 절대 건드리지 않음 — 등록 시점에 이미 확정된 값) ──
  //   각 대상을 개별 try/catch로 감싸 부분 실패를 정확히 추적한다.
  //   실패가 하나라도 있으면 누적기록 상태는 절대 바꾸지 않고(✅분배완료 유지),
  //   정확히 누가 반영됐고 누가 안 됐는지 알려준 뒤 즉시 중단한다.
  const reversed = [];
  const failed = [];
  participants.forEach(p => {
    try {
      const r3 = findRow(p);
      if (!r3) { failed.push(p + ' (잔액현황에 없음)'); return; }
      const pending = pendingOf(r3);
      balance.getRange(r3, BAL_COL.PENDING).setValue(pending - oldSplit.perPerson);
      reversed.push(p);
    } catch (e) {
      failed.push(p + ' (' + e.message + ')');
    }
  });
  if (oldSplit.fund > 0) {
    try {
      const fr = findRow(FUND_NAME);
      if (!fr) { failed.push(FUND_NAME + ' (잔액현황에 없음)'); }
      else {
        const pending = pendingOf(fr);
        const cnt = Number(balance.getRange(fr, BAL_COL.CNT).getValue()) || 0;
        balance.getRange(fr, BAL_COL.PENDING).setValue(pending - oldSplit.fund);
        balance.getRange(fr, BAL_COL.CNT).setValue(Math.max(cnt - 1, 0));
        reversed.push(FUND_NAME);
      }
    } catch (e) { failed.push(FUND_NAME + ' (' + e.message + ')'); }
  }
  if (oldSplit.remainder > 0) {
    try {
      const rr = findRow(remainderTarget);
      if (!rr) { failed.push(remainderTarget + '(나머지) (잔액현황에 없음)'); }
      else {
        const pending = pendingOf(rr);
        balance.getRange(rr, BAL_COL.PENDING).setValue(pending - oldSplit.remainder);
        reversed.push(remainderTarget + '(나머지)');
      }
    } catch (e) { failed.push(remainderTarget + '(나머지) (' + e.message + ')'); }
  }

  if (failed.length > 0) {
    ui.alert('⚠️ 되돌리기가 일부만 반영되었습니다!\n\n' +
      '✅ 반영됨(' + reversed.length + '건): ' + reversed.join(', ') + '\n\n' +
      '❌ 실패함(' + failed.length + '건): ' + failed.join(', ') + '\n\n' +
      '누적기록 상태는 안전을 위해 그대로 "' + ST_DONE + '"로 유지했습니다.\n' +
      '위 반영된 항목은 이미 되돌려졌으니, 실패한 항목만 잔액현황에서 직접 -' + oldSplit.perPerson + '만큼 수동 조정한 뒤\n' +
      '누적기록의 상태/금액/혈비/1인당/분배일을 직접 정리해주세요.');
    return;
  }

  try {
    // 누적기록 행을 미분배 상태로 복귀 (되돌리기 전부 성공했을 때만 도달)
    const actor = _getActorEmail();
    ledger.getRange(row, LG.STATUS).setValue(ST_WAIT);
    ledger.getRange(row, LG.AMOUNT).clearContent();
    ledger.getRange(row, LG.FUND).clearContent();
    ledger.getRange(row, LG.PER).clearContent();
    ledger.getRange(row, LG.DIST).clearContent();
    ledger.getRange(row, LG.CHECK).insertCheckboxes().setValue(false);
    ledger.getRange(row, LG.EDITBY).setValue(actor);
    _logAction(ss, '정정-되돌리기', itemName, actor, oldAmount.toLocaleString() + UNIT + ' 분배를 되돌림');

    let doneMsg = `✅ "${itemName}" 되돌리기 완료.`;

    // ── 재분배 실행 (새 금액 입력 시) ──
    if (newAmount !== null) {
      const r = _distributeCore(ss, ledger, row, newAmount);
      if (r.ok) {
        ledger.getRange(row, LG.EDITBY).setValue(actor);   // 재분배 시 DISTBY는 _distributeCore가 채우고, EDITBY는 "정정 실행자"로 유지
        _logAction(ss, '정정-재분배', itemName, actor, oldAmount.toLocaleString() + ' → ' + newAmount.toLocaleString() + UNIT);
        doneMsg = `✅ "${itemName}" 정정 완료!\n${oldAmount.toLocaleString()} → ${newAmount.toLocaleString()} ${UNIT}\n혈비 ${r.fund.toLocaleString()} / ${r.n}명 × ${r.perPerson.toLocaleString()}`;
        if (r.remainder > 0) doneMsg += ` / 나머지 ${r.remainder}${UNIT}→${r.remainderTo}`;
      } else {
        doneMsg += `\n\n⚠️ 되돌리기는 성공했지만 재분배 실행에 실패했습니다(${r.reason}).\n[${LEDGER_SHEET}]에서 분배✓를 다시 눌러 수동으로 처리해주세요.`;
      }
    } else {
      doneMsg += `\n${ST_WAIT} 상태로 복귀했습니다. [${LEDGER_SHEET}]에서 분배✓로 다시 처리할 수 있습니다.`;
    }
    ui.alert(doneMsg);
  } catch (e) {
    ui.alert('❌ 정정 실패: ' + e.message + '\n\n일부만 반영되었을 수 있으니 잔액현황을 확인해주세요.');
  }
}

function undoLastPayout() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const log = ss.getSheetByName(PAYOUT_SHEET);
  if (!log || log.getLastRow() < 2) { ui.alert('⚠️ 취소할 지급 기록이 없습니다.'); return; }

  const lr = log.getLastRow();
  const rec = log.getRange(lr, 1, 1, 3).getValues()[0];
  const name = String(rec[1]).trim();
  const amt = Number(String(rec[2]).replace(/,/g, '')) || 0;
  const dateStr = Utilities.formatDate(new Date(rec[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  const resp = ui.alert('↩️ 지급 취소',
    `마지막 지급 건을 되돌립니다:\n\n📅 ${dateStr}\n👤 ${name}\n💎 ${amt.toLocaleString()} ${UNIT}\n\n분배완료 → 분배전으로 복구할까요?`,
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  const bal = ss.getSheetByName('잔액현황');
  if (!bal) { ui.alert('❌ 잔액현황 시트를 찾을 수 없습니다.'); return; }
  const vals = bal.getRange(2, 1, Math.max(bal.getLastRow() - 1, 1), 1).getValues();
  let row = -1;
  vals.forEach((r, i) => {
    if (_normName(r[0]) === _normName(name)) row = i + 2;
  });
  if (row < 0) { ui.alert(`❌ 잔액현황에서 "${name}"을 찾지 못했습니다.`); return; }

  const pending = Number(String(bal.getRange(row, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;
  const paid = Number(String(bal.getRange(row, BAL_COL.PAID).getValue()).replace(/,/g, '')) || 0;
  bal.getRange(row, BAL_COL.PENDING).setValue(pending + amt);
  bal.getRange(row, BAL_COL.PAID).setValue(Math.max(paid - amt, 0));
  const actor = _getActorEmail();
  _logAction(ss, '지급취소', name, actor, amt.toLocaleString() + UNIT + ' 지급 건을 취소·복구 (원 지급일 ' + dateStr + ')');
  log.deleteRow(lr);   // 지급기록 원본 행은 삭제되지만, 위 작업기록에는 영구히 남음
  ui.alert(`✅ 취소 완료: "${name}" ${amt.toLocaleString()}${UNIT}가 분배전으로 복구되었습니다.`);
}

// 지급기록 시트 확보 (없으면 생성)
function _getOrCreatePayoutLog(ss) {
  let log = ss.getSheetByName(PAYOUT_SHEET);
  if (!log) {
    log = ss.insertSheet(PAYOUT_SHEET);
    log.setColumnWidth(1, 140);
    log.setColumnWidth(2, 150);
    log.setColumnWidth(3, 100);
    log.setColumnWidth(4, 180);
    log.getRange('A1:D1').setValues([['날짜','멤버','지급액(다이아)','처리자']])
      .setBackground('#37474F').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
    log.setFrozenRows(1);
    log.setTabColor('#F44336');
  } else if (log.getRange('D1').getValue() === '') {
    // 구버전 3열 파일 호환: 처리자 헤더가 없으면 추가
    log.setColumnWidth(4, 180);
    log.getRange('D1').setValue('처리자').setBackground('#37474F').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  }
  return log;
}

// ─────────────────────────────────────────
// 잔액현황 형식 감지 백업 헬퍼 (구 3열 / 신 5열 모두 지원)
//   반환: name → { pending, paid, cnt }
// ─────────────────────────────────────────
function _readBalanceMap(sheet) {
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  const headerB = String(sheet.getRange(1, 2).getValue());
  const isNew = headerB.indexOf('분배전') >= 0;
  const cols = isNew ? 4 : 3;
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getValues();
  vals.forEach(r => {
    const name = String(r[0]).trim();
    if (!name || name === '합계') return;
    const key = name.replace(' (미등록)', '');
    if (!map[key]) map[key] = { pending: 0, paid: 0, cnt: 0 };
    if (isNew) {
      map[key].pending += Number(String(r[1]).replace(/,/g, '')) || 0;
      map[key].paid += Number(String(r[2]).replace(/,/g, '')) || 0;
      map[key].cnt += Number(r[3]) || 0;
    } else {
      // 구버전: 누적수령 전액을 "분배전"으로 이관
      map[key].pending += Number(String(r[1]).replace(/,/g, '')) || 0;
      map[key].cnt += Number(r[2]) || 0;
    }
  });
  // 잔액이 전부 0인 항목 제거
  Object.keys(map).forEach(k => {
    if (map[k].pending === 0 && map[k].paid === 0 && map[k].cnt === 0) delete map[k];
  });
  return map;
}

// 잔액현황 멤버 행 쓰기 헬퍼 (5열 + 체크박스)
function _writeBalanceRow(bal, row, name, pending, paid, cnt, isUnreg) {
  bal.getRange(row, BAL_COL.NAME).setValue(isUnreg ? name + ' (미등록)' : name)
    .setFontColor(isUnreg ? '#999999' : (name === FUND_NAME ? '#E65100' : '#000'))
    .setBackground('#FAFAFA');
  if (name === FUND_NAME && !isUnreg) bal.getRange(row, BAL_COL.NAME).setFontStyle('italic');
  bal.getRange(row, BAL_COL.PENDING).setValue(pending).setBackground('#E8F5E9').setNumberFormat('#,##0').setHorizontalAlignment('right');
  bal.getRange(row, BAL_COL.PAID).setValue(paid).setBackground('#E3F2FD').setNumberFormat('#,##0').setHorizontalAlignment('right');
  bal.getRange(row, BAL_COL.CNT).setValue(cnt).setBackground('#FAFAFA').setHorizontalAlignment('center');
  bal.getRange(row, BAL_COL.CHECK).insertCheckboxes();
  bal.getRange(row, BAL_COL.AMT).setBackground('#FFF9C4').setNumberFormat('#,##0').setHorizontalAlignment('right');
  bal.setRowHeight(row, 34);
}


// ─────────────────────────────────────────
// ★ 개명 코어: 참여자현황·잔액현황에서 이름을 제자리 변경 (5열 대응)
// ─────────────────────────────────────────
function _renameMember(ss, oldName, newName, email) {
  // 참여자현황: 멤버DB 기준으로 목록 블록 재구성 (중복 원천 차단)
  _rebuildInputMembers(ss);

  // 잔액현황: 이름 제자리 변경 or 병합
  const bal = ss.getSheetByName('잔액현황');
  let msg = `"${oldName}" → "${newName}"`;
  if (bal && bal.getLastRow() > 1) {
    const vals = bal.getRange(2, 1, bal.getLastRow() - 1, 4).getValues();
    let oldRow = -1, newRow = -1;
    vals.forEach((r, i) => {
      const nm = _normName(r[0]);
      if (nm === _normName(oldName)) oldRow = i + 2;
      if (nm === _normName(newName)) newRow = i + 2;
    });

    if (oldRow > 0 && newRow > 0 && oldRow !== newRow) {
      // 중복 상태 → 병합 (분배전·분배완료·횟수 모두 합산 후 옛 행 삭제)
      const num = (row, col) => Number(String(bal.getRange(row, col).getValue()).replace(/,/g, '')) || 0;
      const movedPending = num(oldRow, BAL_COL.PENDING);
      bal.getRange(newRow, BAL_COL.PENDING).setValue(num(newRow, BAL_COL.PENDING) + movedPending);
      bal.getRange(newRow, BAL_COL.PAID).setValue(num(newRow, BAL_COL.PAID) + num(oldRow, BAL_COL.PAID));
      bal.getRange(newRow, BAL_COL.CNT).setValue(num(newRow, BAL_COL.CNT) + num(oldRow, BAL_COL.CNT));
      bal.deleteRow(oldRow);
      msg += ` (분배전 ${movedPending.toLocaleString()}G 포함 승계·병합 완료)`;
      _rewriteBalanceTotal(bal);
    } else if (oldRow > 0) {
      // 단순 개명
      bal.getRange(oldRow, 1).setValue(newName).setFontColor('#000');
      msg += ' (잔액 승계 완료)';
    } else {
      msg += ' (잔액현황에 옛 이름 없음 — 신규로 처리됨)';
      _syncMembers(ss);
    }
  }
  _logAction(ss, '개명', newName, _getActorEmail(email), '"' + oldName + '" → "' + newName + '"' + (msg.indexOf('병합') >= 0 ? ' (중복 병합 발생)' : ''));
  return { message: msg, merged: msg.indexOf('병합') >= 0 };
}

// ─────────────────────────────────────────
// ★ 개명 코어 (PC 메뉴 + 앱 공용, UI 없음)
//   멤버DB(진실 원천)를 먼저 고치고, 그다음 잔액을 승계한다.
//   순서가 바뀌면 _rebuildInputMembers 가 옛 이름을 다시 써넣는다.
// ─────────────────────────────────────────
function _renameCore(ss, oldName, newName, email) {
  const db = ss.getSheetByName('멤버DB');
  let found = false;
  if (db) {
    const vals = db.getRange(2, 2, MAX_MEMBERS, 1).getValues();
    vals.forEach((r, i) => {
      if (_normName(r[0]) === _normName(oldName)) {
        db.getRange(i + 2, 2).setValue(newName);
        found = true;
      }
    });
  }
  const result = _renameMember(ss, oldName, newName, email);
  result.foundInDb = found;
  return result;
}

// 잔액현황 합계행 수식 재작성 헬퍼 (분배전·분배완료 각각 합계)
function _rewriteBalanceTotal(bal) {
  const lastRow = bal.getLastRow();
  const colA = bal.getRange(2, 1, Math.max(lastRow - 1, 1), 1).getValues();
  let totalRow = -1;
  colA.forEach((r, i) => { if (String(r[0]).trim() === '합계') totalRow = i + 2; });
  if (totalRow > 0) {
    bal.getRange(totalRow, 2).setFormula(`=SUM(B2:B${totalRow - 1})`)
      .setFontWeight('bold').setNumberFormat('#,##0').setHorizontalAlignment('right');
    bal.getRange(totalRow, 3).setFormula(`=SUM(C2:C${totalRow - 1})`)
      .setFontWeight('bold').setNumberFormat('#,##0').setHorizontalAlignment('right');
  }
}

// ─────────────────────────────────────────
// ★ 참여자현황 멤버 블록 재구성 (멤버DB가 유일한 기준)
//   중복·유령 행이 절대 남지 않는 결정적(deterministic) 방식
// ─────────────────────────────────────────
function _rebuildInputMembers(ss) {
  const input = ss.getSheetByName(INPUT_SHEET);
  if (!input) return;
  const members = _getMembers(ss);

  // 기존 멤버 블록 전체 클리어 (내용·체크박스·서식)
  const block = input.getRange(MEMBER_START_ROW, 1, MAX_MEMBERS, 2);
  block.clearContent();
  block.clearDataValidations();
  block.setBackground(null);

  // 멤버DB 순서 그대로 재작성
  const n = members.length;
  if (n > 0) {
    input.getRange(MEMBER_START_ROW, 1, n, 1).setValues(members.map(m => [m]));
    input.getRange(MEMBER_START_ROW, 2, n, 1).insertCheckboxes();
    for (let i = 0; i < n; i++) {
      if (members[i] === FUND_NAME) {
        input.getRange(MEMBER_START_ROW + i, 1).setFontColor('#E65100').setFontStyle('italic');
      }
      input.setRowHeight(MEMBER_START_ROW + i, 36);
    }
  }
}

// ─────────────────────────────────────────
// ✏️ 수동 개명 메뉴
// ─────────────────────────────────────────
function renameMemberManual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const r1 = ui.prompt('✏️ 멤버 이름 변경 (1/2)', '변경할 기존 이름을 입력하세요:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const oldName = r1.getResponseText().trim();
  if (!oldName) { ui.alert('⚠️ 이름이 비어있습니다.'); return; }

  const r2 = ui.prompt('✏️ 멤버 이름 변경 (2/2)', `"${oldName}"의 새 이름을 입력하세요:`, ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const newName = r2.getResponseText().trim();
  if (!newName) { ui.alert('⚠️ 새 이름이 비어있습니다.'); return; }

  const result = _renameCore(ss, oldName, newName, '');
  ui.alert('✅ ' + result.message);
}

// ─────────────────────────────────────────
// 🔀 개명 후보 탐지: 잔액현황의 미매칭 이름 중 "코어이름"(괄호 앞부분)이
//   현재 멤버DB의 정확히 1명과만 일치하면 개명 후보로 판단.
//   같은 코어이름이 여러 명과 동시에 매칭되는 애매한 경우는
//   잘못된 병합을 막기 위해 후보에서 제외한다 (ambiguous로 별도 보고).
// ─────────────────────────────────────────
function _findRenameCandidates(ss) {
  const core = (s) => {
    const m = String(s).match(/^([^(]+)/);
    return (m ? m[1] : s).trim();
  };

  const members = _getMembers(ss).filter(m => m !== FUND_NAME);
  const memberSet = new Set(members);
  const coreMap = {};
  members.forEach(m => {
    const c = core(m);
    (coreMap[c] = coreMap[c] || []).push(m);
  });

  const bal = ss.getSheetByName('잔액현황');
  const raw = [];
  if (bal && bal.getLastRow() > 1) {
    bal.getRange(2, 1, bal.getLastRow() - 1, 4).getValues().forEach(r => {
      const name = String(r[0]).trim().replace(' (미등록)', '');
      if (!name || name === '합계' || name === FUND_NAME) return;
      if (memberSet.has(name)) return;              // 이미 정확히 일치 → 후보 아님
      const cands = coreMap[core(name)] || [];
      if (cands.length === 1) {
        raw.push({
          oldName: name, newName: cands[0],
          pending: Number(String(r[1]).replace(/,/g, '')) || 0,
          paid: Number(String(r[2]).replace(/,/g, '')) || 0,
          cnt: Number(r[3]) || 0
        });
      }
    });
  }

  // 같은 newName으로 몰리는 애매한 다대일 매칭은 안전하게 전부 제외
  const byTarget = {};
  raw.forEach(c => (byTarget[c.newName] = byTarget[c.newName] || []).push(c));
  const safe = [];
  const ambiguous = [];
  Object.keys(byTarget).forEach(target => {
    const group = byTarget[target];
    if (group.length === 1) safe.push(group[0]);
    else ambiguous.push(...group);
  });
  safe.ambiguous = ambiguous;   // 참고용 부가 정보
  return safe;
}

// 🔀 개명 후보 확인 (일괄 붙여넣기 대응)
function reviewRenameCandidates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const candidates = _findRenameCandidates(ss);
  const ambiguous = candidates.ambiguous || [];

  if (candidates.length === 0) {
    let msg = '감지된 개명 후보가 없습니다.';
    if (ambiguous.length > 0) {
      msg += `\n\n⚠️ 다만 이름이 애매하게 겹치는 항목 ${ambiguous.length}건이 있어 자동 판단을 보류했습니다:\n` +
        ambiguous.map(c => `· ${c.oldName} → ${c.newName}?`).join('\n') +
        '\n\n[✏️ 멤버 이름 변경]으로 개별 확인해주세요.';
    }
    ui.alert('🔀 개명 후보 확인', msg, ui.ButtonSet.OK);
    return;
  }

  let msg = `🔀 다음 ${candidates.length}건을 개명으로 판단했습니다 (잔액 승계·병합):\n\n`;
  candidates.forEach(c => {
    msg += `· ${c.oldName}  →  ${c.newName}`;
    if (c.pending || c.paid || c.cnt) msg += `  [분배전${c.pending.toLocaleString()}·분배완료${c.paid.toLocaleString()}·${c.cnt}회]`;
    msg += '\n';
  });
  if (ambiguous.length > 0) {
    msg += `\n⚠️ 판단이 애매해 제외된 항목 ${ambiguous.length}건은 이번에 처리되지 않습니다\n(처리 후 [✏️ 멤버 이름 변경]으로 개별 확인해주세요).\n`;
  }
  msg += '\n전부 적용할까요?';
  if (ui.alert('🔀 개명 후보 확인', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  let done = 0;
  candidates.forEach(c => {
    _renameMember(ss, c.oldName, c.newName);
    done++;
  });
  let doneMsg = `✅ ${done}건 개명 처리 완료! 참여자현황·잔액현황에 반영되었습니다.`;
  if (ambiguous.length > 0) doneMsg += `\n\n⚠️ 애매해서 제외된 ${ambiguous.length}건은 [✏️ 멤버 이름 변경]으로 개별 처리해주세요.`;
  ui.alert(doneMsg);
}

// ─────────────────────────────────────────
// 🧹 시트 정리: 중복·유령 행 청소
//   · 참여자현황: 멤버DB 기준 완전 재구성
//   · 잔액현황: 같은 이름 병합, 잔액 0인 유령 행 제거,
//     잔액 있는 미등록 이름은 보존, 합계 재작성
// ─────────────────────────────────────────
function cleanupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const members = _getMembers(ss);
  if (members.length === 0) { ui.alert('⚠️ 멤버DB에 멤버가 없습니다.'); return; }

  const resp = ui.alert('🧹 시트 정리',
    '· 참여자현황: 멤버DB 기준으로 목록을 재구성합니다 (중복/유령 행 제거)\n' +
    '· 잔액현황: 같은 이름은 잔액을 병합하고, 잔액 0인 미등록 행은 삭제합니다\n' +
    '· 잔액이 있는 미등록 이름은 보존됩니다\n\n계속할까요?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  try {
    // ① 참여자현황 재구성
    _rebuildInputMembers(ss);

    // ② 잔액현황: 이름별 병합 맵 구성 — 공백 무시 비교로 표기 차이 중복까지 병합
    const raw = _readBalanceMap(ss.getSheetByName('잔액현황'));
    const map = {};          // normKey → {pending, paid, cnt}
    const displayOf = {};    // normKey → 대표 표기 (미등록용)
    let mergedDup = 0;
    Object.keys(raw).forEach(name => {
      const k = _normName(name);
      if (map[k]) mergedDup++;
      if (!map[k]) { map[k] = { pending: 0, paid: 0, cnt: 0 }; displayOf[k] = name; }
      map[k].pending += raw[name].pending;
      map[k].paid += raw[name].paid;
      map[k].cnt += raw[name].cnt;
    });

    // ③ 잔액현황 전체 재작성: 멤버DB 순서 → 미등록(잔액>0) → 합계
    const sheetName = '잔액현황';
    const old = ss.getSheetByName(sheetName);
    if (old) ss.deleteSheet(old);
    _buildBalance(ss, members);
    const nb = ss.getSheetByName(sheetName);

    members.forEach((name, i) => {
      const k = _normName(name);
      if (map[k]) {
        nb.getRange(i + 2, BAL_COL.PENDING).setValue(map[k].pending);
        nb.getRange(i + 2, BAL_COL.PAID).setValue(map[k].paid);
        nb.getRange(i + 2, BAL_COL.CNT).setValue(map[k].cnt);
        delete map[k];
      }
    });

    // 미등록 잔액 보존 (_readBalanceMap이 전부 0인 유령은 이미 제거)
    let totalRow = members.length + 2;
    const kept = [];
    Object.keys(map).forEach(k => {
      nb.insertRowBefore(totalRow);
      _writeBalanceRow(nb, totalRow, displayOf[k], map[k].pending, map[k].paid, map[k].cnt, true);
      totalRow++;
      kept.push(displayOf[k]);
    });
    _rewriteBalanceTotal(nb);
    _reorderSheets(ss);
    _normalizeRowHeights(ss);
    _applyMemberNameFormatting(ss);
    _applyProtections(ss);

    let msg = `✅ 정리 완료!\n\n· 참여자현황: 멤버 ${members.length}명으로 재구성`;
    if (mergedDup > 0) msg += `\n· 표기 차이 중복 ${mergedDup}건 병합 (잔액 합산)`;
    if (kept.length > 0) msg += `\n· 잔액 있는 미등록 보존: ${kept.join(', ')}`;
    ui.alert(msg);
  } catch (e) {
    ui.alert('❌ 정리 실패: ' + e.message);
  }
}

function syncMembersManual() {
  const ui = SpreadsheetApp.getUi();
  const result = _syncMembers(SpreadsheetApp.getActiveSpreadsheet());
  let msg = '✅ 동기화 완료';
  msg += result.added.length > 0
    ? `\n\n추가된 멤버: ${result.added.join(', ')}`
    : '\n\n추가할 새 멤버가 없습니다. (이미 모두 반영됨)';
  if (result.removed.length > 0) {
    msg += `\n\n⚠️ 멤버DB에 없는 이름이 시트에 남아있음: ${result.removed.join(', ')}\n잔액 보존을 위해 자동 삭제하지 않습니다. 정리하려면 [🔄 데이터 보존 업그레이드]를 실행하세요.`;
  }
  ui.alert(msg);
}

// ─────────────────────────────────────────
// ★ 멤버 동기화 코어: 추가된 멤버를 참여자현황·잔액현황에 반영
//    (삭제·개명은 데이터 보존을 위해 자동 처리하지 않음)
// ─────────────────────────────────────────
function _syncMembers(ss) {
  const members = _getMembers(ss);
  const added = [];
  const removed = [];

  // ── 참여자현황 동기화 ──
  const input = ss.getSheetByName(INPUT_SHEET);
  if (input) {
    const existVals = input.getRange(MEMBER_START_ROW, 1, MAX_MEMBERS, 1).getValues();
    const existing = [];
    existVals.forEach(r => { const nm = String(r[0]).trim(); if (nm) existing.push(nm); });

    const existingNorm = existing.map(_normName);
    members.forEach(name => {
      if (existingNorm.indexOf(_normName(name)) < 0) {
        const newRow = MEMBER_START_ROW + existing.length;
        if (newRow > MEMBER_START_ROW + MAX_MEMBERS - 1) return; // 상한 초과 방지
        input.getRange(newRow, 1).setValue(name);
        input.getRange(newRow, 2).insertCheckboxes();
        input.getRange(newRow, 3)
          .setFormula(`=IF(B${newRow}=TRUE, TEXT(FLOOR($B$2/$B$3),"#,##0"), "")`)
          .setBackground('#F1F8FF').setHorizontalAlignment('right');
        input.setRowHeight(newRow, 36);
        existing.push(name); existingNorm.push(_normName(name));
        if (added.indexOf(name) < 0) added.push(name);
      }
    });
    const membersNorm = members.map(_normName);
    existing.forEach(nm => { if (membersNorm.indexOf(_normName(nm)) < 0 && removed.indexOf(nm) < 0) removed.push(nm); });
  }

  // ── 잔액현황 동기화 (합계행 앞에 삽입) ──
  const bal = ss.getSheetByName('잔액현황');
  if (bal) {
    const lastRow = bal.getLastRow();
    const colA = bal.getRange(2, 1, Math.max(lastRow - 1, 1), 1).getValues();
    const existing = [];
    let totalRow = -1;
    colA.forEach((r, i) => {
      const nm = String(r[0]).trim();
      if (nm === '합계') { totalRow = i + 2; return; }
      if (nm) existing.push(_normName(nm));
    });

    members.forEach(name => {
      if (existing.indexOf(_normName(name)) < 0) {
        let insertAt = totalRow > 0 ? totalRow : bal.getLastRow() + 1;
        if (totalRow > 0) bal.insertRowBefore(totalRow);
        _writeBalanceRow(bal, insertAt, name, 0, 0, 0, false);
        existing.push(_normName(name));
        if (totalRow > 0) totalRow++;
        if (added.indexOf(name) < 0) added.push(name);
      }
    });

    // 합계 수식 재작성 (삽입으로 범위가 어긋나는 경우 방지)
    _rewriteBalanceTotal(bal);
  }

  return { added: added, removed: removed };
}

// 이름 정규화: 공백 제거 + (미등록) 꼬리 제거 — 표기 차이 중복 방지용
function _normName(s) {
  return String(s || '').replace(' (미등록)', '').replace(/\s+/g, '');
}

// 멤버 표기("코어 (한자)")에서 코어(괄호 앞) 부분만 추출
function _coreName(s) {
  const m = String(s || '').match(/^([^(]+)/);
  return (m ? m[1] : s || '').trim();
}

// ─────────────────────────────────────────
// 헬퍼: 멤버DB에서 활성 멤버 목록 읽기 (동적)
// ─────────────────────────────────────────
function _getMembers(ss) {
  const db = ss.getSheetByName('멤버DB');
  if (!db) return [];
  const vals = db.getRange(2, 2, MAX_MEMBERS, 1).getValues(); // B2:B51
  const members = [];
  vals.forEach(r => {
    const name = String(r[0]).trim();
    if (name) members.push(name);
  });
  return members;
}

// ─────────────────────────────────────────
// 🚀 최초 설치: 새 파일에서 1회 실행 → 전체 시트 자동 세팅
//    이미 설치된 파일에서는 아무것도 삭제하지 않고 안내만 함
// ─────────────────────────────────────────
function firstTimeInstall() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // 이미 설치되어 있는지 검사 (핵심 시트 존재 여부)
  const core = ['멤버DB',INPUT_SHEET,LEDGER_SHEET,'잔액현황'];
  const found = core.filter(n => ss.getSheetByName(n));
  if (found.length > 0) {
    const ledger = ss.getSheetByName(LEDGER_SHEET);
    const hasData = ledger && ledger.getLastRow() > 1;
    ui.alert('ℹ️ 이미 설치되어 있습니다',
      '이 파일에는 시스템 시트가 이미 있습니다: ' + found.join(', ') +
      (hasData ? '\n(정산 기록도 존재합니다)' : '') +
      '\n\n· 멤버 변경 반영·시트 재구성 → [🔄 데이터 보존 업그레이드]' +
      '\n· 설명서만 갱신 → [📖 사용안내 새로고침]' +
      '\n· 모든 데이터를 지우고 처음부터 → [⚠️ 공장 초기화]' +
      '\n\n최초 설치는 아무것도 변경하지 않았습니다.',
      ui.ButtonSet.OK);
    return;
  }

  // 새 파일 → 안전 설치 (삭제 없음)
  try {
    _rebuildGuide(ss);
    _buildMemberDB(ss, []);
    _buildInputSheet(ss, []);
    _buildLedger(ss);
    _buildBalance(ss, []);
    _getOrCreatePayoutLog(ss);
    _getOrCreateAuditLog(ss);
    _reorderSheets(ss);
    _normalizeRowHeights(ss);
    _applyMemberNameFormatting(ss);
    _applyProtections(ss);
    ui.alert('🚀 설치 완료! (v' + VERSION + ')',
      '다음 순서로 시작하세요:\n\n' +
      '① [멤버DB] 시트 B열에 멤버 이름 입력 (최대 ' + MAX_MEMBERS + '명)\n' +
      '   → 참여자현황·잔액현황에 자동 반영됩니다\n' +
      '② [참여자현황]에서 아이템·' + UNIT + ' 입력 후 [✅ 정산하기]\n' +
      '③ 자세한 사용법은 첫 번째 탭 [사용안내] 참고\n\n' +
      '📱 모바일 사용은 [사용안내]의 웹앱 배포법을 따라주세요.',
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ 설치 실패: ' + e.message);
  }
}

// ─────────────────────────────────────────
// 1. 공장 초기화 (완전 리셋 — 데이터 삭제됨)
// ─────────────────────────────────────────
function firstTimeSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert('⚠️ 공장 초기화',
    '모든 시트가 재생성되고 기존 기록이 삭제됩니다.\n지난 시즌 기록(시즌1, 시즌2...)도 모두 삭제됩니다!\n(데이터를 유지하려면 [🔄 데이터 보존 업그레이드]를,\n시즌만 넘기려면 [🏁 시즌 종료]를 사용하세요)\n\n' +
    '🔒 [' + AUDIT_SHEET + '](누가 언제 무엇을 했는지의 영구 기록)은\n' +
    '이 작업으로도 절대 삭제되지 않습니다.\n\n계속할까요?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  // 최소 1시트 규칙 대응: 임시 시트 먼저 생성
  const temp = ss.insertSheet('_temp_setup_');
  try {
    // 기본 시트 + 시즌 아카이브 시트 전부 삭제
    // ★ AUDIT_SHEET(작업기록)는 어떤 이유로도 이 목록에 넣지 말 것 — 영구 로그 원칙
    const DELETABLE_ON_RESET = ['사용안내','멤버DB',INPUT_SHEET,LEDGER_SHEET,'잔액현황', PAYOUT_SHEET];
    ss.getSheets().forEach(s => {
      const nm = s.getName();
      if (nm === '_temp_setup_' || nm === AUDIT_SHEET) return;   // 작업기록은 절대 삭제 대상 아님
      if (DELETABLE_ON_RESET.indexOf(nm) >= 0 || /^시즌\d+$/.test(nm)) {
        ss.deleteSheet(s);
      }
    });
    PropertiesService.getDocumentProperties().deleteProperty('SEASON_NUM');
    _buildGuide(ss);
    _buildMemberDB(ss, []);
    _buildInputSheet(ss, []);
    _buildLedger(ss);
    _buildBalance(ss, []);
    _getOrCreatePayoutLog(ss);
    _getOrCreateAuditLog(ss);
    _logAction(ss, '공장초기화', '-', _getActorEmail(), '전체 시트 재생성 (작업기록은 보존됨)');
    _reorderSheets(ss);
    _normalizeRowHeights(ss);
    _applyMemberNameFormatting(ss);
    _applyProtections(ss);
    ui.alert('✅ 초기설정 완료!\n\n[멤버DB] 시트 B열에 멤버 이름을 입력한 뒤\n[🔄 데이터 보존 업그레이드]를 실행하면 목록이 반영됩니다.');
  } catch (e) {
    ui.alert('❌ 초기설정 실패: ' + e.message);
  } finally {
    const t = ss.getSheetByName('_temp_setup_');
    if (t) ss.deleteSheet(t);
  }
}

// ─────────────────────────────────────────
// 2. 🔄 데이터 보존 업그레이드 (핵심)
//    - 누적기록 전체 행 + 잔액현황(이름→골드·횟수) 백업
//    - 참여자현황/누적기록/잔액현황 삭제 후 50명 규격으로 재생성
//      → 시트에 씌워진 '테이블(표)'도 함께 제거됨
//    - 백업 데이터 복원 (이름 기준 매칭)
// ─────────────────────────────────────────
function upgradeKeepData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const members = _getMembers(ss);
  if (members.length === 0) {
    ui.alert('⚠️ 멤버DB에서 멤버를 찾지 못했습니다.\n[멤버DB] 시트 B2행부터 이름을 입력한 뒤 다시 실행해주세요.');
    return;
  }

  const resp = ui.alert('🔄 데이터 보존 업그레이드',
    `멤버DB 기준 ${members.length}명으로 시트를 재구성합니다.\n` +
    LEDGER_SHEET + '과 잔액현황 데이터는 백업 후 복원됩니다.\n\n' +
    '⚠️ 실행 전 [파일 → 사본 만들기]로 백업을 권장합니다.\n계속할까요?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  try {
    // ── 백업 1: 누적기록 — 형식 자동 감지 후 신 14열 스키마로 변환 ──
    //   구 v2(7열: 날짜,아이템,총액,인원,1인당,명단,인증샷)
    //   구 v4(8열: +혈비) → 전부 ✅분배완료로 이관
    //   구 v5~v7.1(11열)은 그대로 통과 + 입력자/분배자/수정자 3열 공란 추가
    //   신 v7.2(14열)은 그대로 통과
    let ledgerRows = [];        // [{values:[14], photoFormula}]
    const oldLedger = ss.getSheetByName(LEDGER_SHEET);
    if (oldLedger && oldLedger.getLastRow() > 1) {
      const n = oldLedger.getLastRow() - 1;
      const c = Math.max(oldLedger.getLastColumn(), 7);
      const headC1 = String(oldLedger.getRange(1, 3).getValue());
      const isNewSchema = headC1.indexOf('상태') >= 0;
      const vals = oldLedger.getRange(2, 1, n, c).getValues();
      const fmls = oldLedger.getRange(2, 1, n, c).getFormulas();
      const pad14 = (arr) => { const a = arr.slice(0, 14); while (a.length < 14) a.push(''); return a; };
      for (let i = 0; i < n; i++) {
        if (isNewSchema) {
          ledgerRows.push({ values: pad14(vals[i]), photoFormula: fmls[i][LG.PHOTO - 1] || '' });
        } else {
          // 구 스키마: [날짜, 아이템, 총액, 인원, 1인당, 명단, 인증샷, (혈비)]
          const v = vals[i];
          ledgerRows.push({
            values: pad14([v[0], v[1], ST_DONE, v[3], v[5], '', '', v[2], (v[7] !== undefined ? v[7] : ''), v[4], v[0]]),
            photoFormula: fmls[i][6] || ''
          });
        }
      }
    }

    // ── 백업 2: 잔액현황 (형식 자동 감지: 구 3열 → 분배전 이관 / 신 5열 그대로) ──
    const balanceMap = _readBalanceMap(ss.getSheetByName('잔액현황'));

    // ── 재생성 (테이블/표 제거 효과) — 지급기록은 보존 ──
    [INPUT_SHEET,LEDGER_SHEET,'잔액현황'].forEach(name => {
      const s = ss.getSheetByName(name);
      if (s) ss.deleteSheet(s);
    });
    _buildInputSheet(ss, members);
    _buildLedger(ss);
    _buildBalance(ss, members);
    _getOrCreatePayoutLog(ss);
    _getOrCreateAuditLog(ss);
    _rebuildGuide(ss);   // 사용안내도 최신 버전으로 갱신

    // ── 복원 1: 누적기록 (신 14열 스키마) ──
    if (ledgerRows.length > 0) {
      const ledger = ss.getSheetByName(LEDGER_SHEET);
      const outVals = ledgerRows.map(r => r.values);
      ledger.getRange(2, 1, outVals.length, 14).setValues(outVals);
      ledgerRows.forEach((r, i) => {
        if (r.photoFormula) ledger.getRange(i + 2, LG.PHOTO).setFormula(r.photoFormula);
        // 미분배 행에만 분배✓ 체크박스 + 금액 입력칸 서식
        const st = String(r.values[LG.STATUS - 1]);
        ledger.getRange(i + 2, LG.CHECK).insertCheckboxes();
        if (st === ST_WAIT) ledger.getRange(i + 2, LG.AMOUNT).setBackground('#FFF9C4');
      });
      ledger.getRange(2, LG.DATE, outVals.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      ledger.getRange(2, LG.DIST, outVals.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      [LG.AMOUNT, LG.FUND, LG.PER].forEach(col =>
        ledger.getRange(2, col, outVals.length, 1).setNumberFormat('#,##0'));
      ledger.getRange(2, LG.STATUS, outVals.length, 1).setHorizontalAlignment('center');
    }

    // ── 복원 2: 잔액현황 (분배전·분배완료·횟수) ──
    const bal = ss.getSheetByName('잔액현황');
    const unmatched = [];
    const membersNormU = members.map(_normName);
    Object.keys(balanceMap).forEach(name => {
      const idx = membersNormU.indexOf(_normName(name));
      const d = balanceMap[name];
      if (idx >= 0) {
        bal.getRange(idx + 2, BAL_COL.PENDING).setValue(d.pending);
        bal.getRange(idx + 2, BAL_COL.PAID).setValue(d.paid);
        bal.getRange(idx + 2, BAL_COL.CNT).setValue(d.cnt);
      } else {
        unmatched.push(name);
      }
    });
    // 멤버DB에 없는 이름(탈퇴자 등)은 목록 아래에 보존
    if (unmatched.length > 0) {
      let row = members.length + 2;
      unmatched.forEach(name => {
        bal.insertRowBefore(row);
        const d = balanceMap[name];
        _writeBalanceRow(bal, row, name, d.pending, d.paid, d.cnt, true);
        row++;
      });
      _rewriteBalanceTotal(bal);
    }

    _reorderSheets(ss);
    _normalizeRowHeights(ss);
    _applyMemberNameFormatting(ss);
    _applyProtections(ss);

    let msg = `✅ 업그레이드 완료!\n\n· 멤버 ${members.length}명 반영\n· ${LEDGER_SHEET} ${ledgerRows.length}건 복원\n· 잔액 ${Object.keys(balanceMap).length}명 복원`;
    if (unmatched.length > 0) msg += `\n\n⚠️ 멤버DB에 없는 이름 ${unmatched.length}명은 잔액현황 하단에 '(미등록)'으로 보존했습니다:\n${unmatched.join(', ')}\n이름이 바뀐 멤버라면 확인 후 수동 정리해주세요.`;
    ui.alert(msg);
  } catch (e) {
    ui.alert('❌ 업그레이드 실패: ' + e.message + '\n\n시트가 표(테이블)로 변환된 상태라면, 표 안의 셀 클릭 → 표 이름 드롭다운 → "범위로 변환" 후 다시 실행해주세요.');
  }
}

// ─────────────────────────────────────────
// 3. 사용안내 시트
// ─────────────────────────────────────────
function _buildGuide(ss) {
  _rebuildGuide(ss);
}

// 사용안내 재생성 (항상 첫 번째 탭, 전체 기능 반영)
function _rebuildGuide(ss) {
  const old = ss.getSheetByName('사용안내');
  if (old) ss.deleteSheet(old);
  const sheet = ss.insertSheet('사용안내', 0);   // 첫 번째 탭 고정
  sheet.setColumnWidth(1, 24);
  sheet.setColumnWidth(2, 560);
  sheet.setHiddenGridlines(true);

  const pct = Math.round(FUND_RATE * 100);
  // [텍스트, 유형] — title/sub/sec(섹션헤더)/b(본문)/warn(경고)/sp(여백)
  const L = [
    ['🎮 길드 정산 시스템 사용 설명서', 'title'],
    ['v' + VERSION + ' · 선등록·후분배 · ' + UNIT + ' · 혈비 ' + pct + '% · 시즌 관리 · 스마트폰 앱(PWA)', 'sub'],
    ['', 'sp'],

    ['📋 시트 구성 (아래 순서로 항상 정렬됩니다)', 'sec'],
    ['📖 사용안내 → 이 시트 (설명서)', 'b'],
    ['🔵 멤버DB → 멤버 이름 등록·관리 (여기만 수정하면 나머지 자동)', 'b'],
    ['🟢 참여자현황 → 레이드 직후 아이템·참여자 등록 (매번 사용)', 'b'],
    ['📄 ' + LEDGER_SHEET + ' → 아이템 파이프라인: ' + ST_WAIT + '/' + ST_DONE + ' 관리,', 'b'],
    ['   판매 후 여기서 분배✓ 실행 (분배✓·판매금액 외 수정 금지)', 'b'],
    ['   ※ 이름은 "' + LEDGER_SHEET + '"이지만 분배완료 이력도 함께 보관됩니다', 'b'],
    ['🟡 잔액현황 → 멤버별 분배전/분배완료/참여횟수 + 지급✓ 버튼', 'b'],
    ['🔴 지급기록 → 중간정산 지급 이력 자동 저장', 'b'],
    ['⬜ 시즌1, 시즌2... → 시즌 종료 시 자동 생성되는 보관 기록', 'b'],
    ['', 'sp'],

    ['👥 멤버 관리 — 멤버DB B열만 수정하면 끝', 'sec'],
    ['· 추가: 빈 칸에 이름 입력 → 참여자현황·잔액현황에 자동 반영', 'b'],
    ['· 개명(1명씩 직접 수정): 셀 하나를 고치면 자동 인식 → 잔액 승계', 'b'],
    ['· 개명(여러 명 붙여넣기/일괄 교체): 자동 인식이 안 될 수 있어', 'b'],
    ['  [🔀 개명 후보 확인]을 실행 → 코어이름이 일치하는 후보를 찾아', 'b'],
    ['  보여주고, 확인 한 번으로 잔액을 승계·병합합니다', 'b'],
    ['· 삭제: 잔액 보호를 위해 자동 삭제하지 않음 → [🧹 시트 정리]로 처리', 'b'],
    ['· 보조 메뉴: [👥 멤버 동기화] (자동 반영 누락 시), [✏️ 멤버 이름 변경]', 'b'],
    ['', 'sp'],

    ['📝 1단계: 아이템 등록 (레이드 직후)', 'sec'],
    ['① [참여자현황] 1행 아이템명, (선택) 2행 인증샷 링크 입력', 'b'],
    ['   ※ 모바일 웹앱에서는 사진을 첨부하면 자동으로 드라이브에', 'b'],
    ['   저장되고, 인식된 참여자가 자동 체크됩니다 (아래 참고)', 'b'],
    ['② 참여 멤버 체크 → 3행 인원 자동 집계 확인', 'b'],
    ['③ 메뉴 [🎮 길드정산] → [📝 아이템 등록]', 'b'],
    ['   ※ 모바일 웹앱은 등록 전 참여자 명단 전체를 팝업으로', 'b'],
    ['   다시 보여줍니다 — 체크가 맞는지 확인 후 등록하세요', 'b'],
    ['→ [' + LEDGER_SHEET + ']에 ' + ST_WAIT + ' 상태로 저장됨 (금액은 아직 없음)', 'b'],
    ['⭐ 참여횟수는 이 등록 시점에 즉시 확정됩니다 (레이드 출석 기준)', 'b'],
    ['   이후 분배·정정으로 금액이 바뀌어도 참여횟수는 변하지 않음', 'b'],
    ['   (다이아 액수와 완전히 독립된 지표 — 드리프트 시 [🔁 참여', 'b'],
    ['   횟수 재계산]으로 언제든 안전하게 재계산 가능, 잔액엔 영향 없음)', 'b'],
    [''  , 'sp'],

    ['💎 2단계: 분배 (아이템 판매 후 — 시즌 말 일괄 가능)', 'sec'],
    ['① [' + LEDGER_SHEET + ']에서 판매된 아이템의 "분배✓" 체크', 'b'],
    ['② 판매금액 입력 팝업 → 금액 입력 → 확인', 'b'],
    ['   (판매금액 열에 미리 적고 체크하면 팝업 생략 — 모바일 앱 호환)', 'b'],
    ['③ 혈비 공제 후 등록 당시 참여자에게 자동 1/N 분배', 'b'],
    ['   ⚖️ 규칙: 참여자는 예외 없이 전원 동일한 금액을 받습니다', 'b'],
    ['   (버림 계산 후 남는 나머지는 참여 여부와 무관하게 항상', 'b'],
    ['   "' + REMAINDER_NAME + '"에게 별도 적립되며, 참여횟수에는 포함되지 않습니다)', 'b'],
    ['   → 상태 ' + ST_DONE + ' + 분배일 기록, 잔액현황 분배전 가산', 'b'],
    ['※ ' + ST_WAIT + ' 행은 주황색으로 강조됩니다', 'b'],
    [''  , 'sp'],
    ['🔄 분배 정정 (판매금액을 잘못 입력했을 때 — 제작자 전용)', 'sec'],
    ['① 메뉴 [🎮 길드정산] → [🔄 분배 정정] → 아이템명 입력', 'b'],
    ['② 새 금액 입력 → 되돌린 후 즉시 재분배 (예: 5000→7000)', 'b'],
    ['   빈칸 + 확인 → 되돌리기만 하고 ' + ST_WAIT + ' 상태로 복귀', 'b'],
    ['※ 이미 지급✓ 처리되어 분배전 잔액이 부족하면 자동으로', 'warn'],
    ['   중단됩니다 — 데이터 정합성 보호를 위한 안전장치입니다', 'warn'],
    ['※ 이 메뉴는 PC(시트 편집 권한자)에서만 제공되며 모바일', 'b'],
    ['   웹앱에는 노출되지 않습니다', 'b'],
    [''  , 'sp'],
    ['🗑️ 아이템 완전 삭제 (연습·등록실수 정리용 — 제작자 전용)', 'sec'],
    ['① 메뉴 [🎮 길드정산] → [🗑️ 아이템 완전 삭제] → 아이템명 입력', 'b'],
    ['② 미분배 항목은 즉시 삭제, 분배완료 항목은 금액을 먼저', 'b'],
    ['   되돌린 뒤 삭제 (이미 지급✓된 경우 안전하게 차단됨)', 'b'],
    ['③ 삭제 후 참여횟수가 자동 재계산되어 정확히 반영됩니다', 'b'],
    ['💡 길드원 학습·연습용 아이템을 만들었다가 정리할 때 사용하세요', 'b'],
    ['   (예: "연습-테스트" 같은 이름으로 등록 → 실습 후 완전 삭제)', 'b'],
    ['※ 이 메뉴도 PC 전용이며 모바일 웹앱에는 노출되지 않습니다', 'b'],
    [''  , 'sp'],
    ['💸 중간정산 — 캐릭터별 지급 처리', 'sec'],
    ['① [잔액현황]에서 지급할 멤버의 "지급✓" 체크', 'b'],
    ['② 금액 입력 팝업이 뜸:', 'b'],
    ['   · 빈칸으로 [확인] → 분배전 전액 지급', 'b'],
    ['   · 숫자 입력 → 그 금액만 지급 (분배전 초과 불가, 잔여분 유지)', 'b'],
    ['   · [취소] → 지급하지 않음', 'b'],
    ['· 빠른 처리: "지급액" 칸에 금액을 미리 적고 체크하면 팝업 생략', 'b'],
    ['③ 내역은 [지급기록]에 자동 저장 · 실수 시 [↩️ 최근 지급 취소]', 'b'],
    ['※ 분배전 잔액이 남은 멤버는 노란색으로 강조됩니다', 'b'],
    ['※ 모바일 웹앱 [지급] 버튼도 금액 입력을 지원합니다 (기본: 전액)', 'b'],
    ['', 'sp'],

    ['🏁 시즌 종료 — 기록 보존 후 초기화', 'sec'],
    ['① 시즌이 끝나면 메뉴 [🏁 시즌 종료] 실행', 'b'],
    ['② 잔액·정산·지급 기록 전체가 [시즌N] 시트에 보존', 'b'],
    ['   (총 분배액·혈비 적립액·최다 참여자 등 요약 통계도 자동 생성)', 'b'],
    ['③ 기록 초기화 후 다음 시즌 자동 시작 (시즌 시트는 계속 누적)', 'b'],
    ['※ 종료 전에 분배전 잔액을 모두 지급✓ 처리하면 가장 깔끔합니다', 'b'],
    ['', 'sp'],

    ['📱 모바일에서 사용하기 (웹앱)', 'sec'],
    ['구글시트 모바일 앱은 커스텀 메뉴 미지원 → 전용 웹앱으로 사용', 'b'],
    ['[최초 1회 — PC에서]', 'b'],
    ['① 확장 프로그램 → Apps Script → [배포] → [새 배포]', 'b'],
    ['② 유형(⚙️) "웹 앱" → 실행: 나 / 액세스: 나만 → [배포]', 'b'],
    ['③ URL을 폰 브라우저로 열고 "홈 화면에 추가"', 'b'],
    ['[기능] 💰 잔액·지급 탭 / 📦 아이템 탭(등록 + 미분배 [분배] 버튼)', 'b'],
    ['· 핀치줌(확대축소) 지원 · 시트의 지급✓ 체크는 모바일 앱에서도 작동', 'b'],
    ['· 상단 대시보드에 "미분배 아이템 수·잔액 남은 인원"이 항상 표시됨', 'b'],
    [''  , 'sp'],
    ['👀 길드원용 개인 잔액 조회 링크 (관리 기능 없음)', 'sec'],
    ['· 매니저용 웹앱 주소 뒤에 "?view=lookup"을 붙여서 공유하세요', 'b'],
    ['  예) https://script.google.com/.../exec?view=lookup', 'b'],
    ['· 이름만 선택하면 본인 분배전/분배완료/참여횟수만 보입니다', 'b'],
    ['· 등록·분배 등 관리 기능이 전혀 없어 길드원에게 안전하게', 'b'],
    ['  공유할 수 있습니다 (매니저는 기존 링크를 계속 사용)', 'b'],
    [''  , 'sp'],

    ['🚚 운영 중인 파일에서 이 파일로 옮기기 (v8.1)', 'sec'],
    ['쓰던 파일을 건드리지 않고 새 파일에서 준비한 뒤 한 번에 옮깁니다.', 'b'],
    ['① 이 파일에서 [🚀 최초 설치] 실행 (빈 시트 구성)', 'b'],
    ['② 앱까지 연결해서 충분히 확인 (이 동안 옛 파일로 계속 정산)', 'b'],
    ['③ 옮길 준비가 되면 [📥 기존 길드정산 파일에서 가져오기]', 'b'],
    ['   → 옛 파일 URL 붙여넣기 → 멤버DB·잔액·아이템·지급·작업기록 이관', 'b'],
    ['④ [🔁 참여횟수 재계산] 으로 출석 수치 정리', 'b'],
    ['· 덮어쓰기 방식이라 여러 번 실행해도 결과가 같습니다', 'b'],
    ['· 옛 파일은 읽기만 하고 전혀 바꾸지 않습니다', 'b'],
    ['⚠️ 새 파일에서 정산을 시작한 뒤에 다시 실행하면 그 작업이', 'warn'],
    ['   사라집니다. 실행 전 확인 팝업의 경고를 꼭 읽어주세요', 'warn'],
    ['', 'sp'],

    ['👥 앱에서 혈맹원 아이디 바꾸기 (v8.1)', 'sec'],
    ['앱 [⚙️ 관리] → PIN 입력 → [혈맹원 관리] 에서 바로 변경합니다.', 'b'],
    ['· 게임에서 보이는 이름과 정확히 같게 입력하세요 (띄어쓰기 포함)', 'b'],
    ['· 바꾸면 잔액·참여횟수가 새 이름으로 그대로 따라갑니다', 'b'],
    ['· 이미 있는 이름으로 바꾸면 두 계정이 합쳐집니다 — 앱이 양쪽', 'b'],
    ['  잔액을 보여주며 한 번 더 확인을 받습니다', 'b'],
    ['· 모든 변경은 [작업기록] 시트에 영구히 남습니다', 'b'],
    ['', 'sp'],

    ['📲 스마트폰 전용 앱 (Vercel PWA) — v' + VERSION + ' 신규', 'sec'],
    ['화면은 Vercel에, 데이터는 이 시트가 담당하도록 분리했습니다.', 'b'],
    ['구글 로그인 없이 열리고, 홈 화면에 추가하면 진짜 앱처럼 씁니다.', 'b'],
    ['[최초 1회 설정 — PC에서]', 'b'],
    ['① [배포] → [새 배포] → 유형 "웹 앱"', 'b'],
    ['② 실행: 나 / 액세스: 모든 사용자  ← 이 조합이어야 연동됩니다', 'b'],
    ['③ 메뉴 [🔑 웹 API 토큰]으로 토큰 발급 → 복사', 'b'],
    ['④ Vercel → Settings → Environment Variables 에 등록', 'b'],
    ['   GAS_URL(=위 /exec 주소) · GAS_TOKEN(=③ 토큰)', 'b'],
    ['   ADMIN_PIN(관리자 비밀번호) · SESSION_SECRET(아무 긴 문자열)', 'b'],
    ['⑤ 저장 후 Redeploy → 폰에서 열고 "홈 화면에 추가"', 'b'],
    ['[권한 구분]', 'b'],
    ['· 길드원: 링크만 있으면 잔액·아이템 현황을 자유롭게 조회', 'b'],
    ['· 관리자: 앱 하단 [관리] 탭에서 PIN 입력 후에만 등록·분배·지급', 'b'],
    ['⚠️ 액세스를 "모든 사용자"로 열어도, 토큰이 없는 요청은 전부', 'warn'],
    ['   거부됩니다. 토큰은 Vercel 서버에만 저장되고 브라우저로', 'warn'],
    ['   내려가지 않습니다. 토큰이 새어나갔다고 판단되면 메뉴에서', 'warn'],
    ['   재발급하면 즉시 무효화됩니다', 'warn'],
    ['※ 기존 구글 로그인 웹앱(위 항목)도 그대로 살아있습니다 —', 'b'],
    ['  새 앱에 문제가 생기면 언제든 그쪽으로 돌아갈 수 있습니다', 'b'],
    [''  , 'sp'],
    ['🔔 디스코드 자동 알림', 'sec'],
    ['· [🔗 디스코드 웹훅 설정]을 한 번 해두면, 이후 아이템 등록·', 'b'],
    ['  분배 시 자동으로 디스코드에 알림이 전송됩니다', 'b'],
    ['· 웹훅을 설정하지 않으면 알림 없이 조용히 넘어갈 뿐, 등록·', 'b'],
    ['  분배 자체에는 전혀 영향이 없습니다', 'b'],
    ['· [📤 디스코드로 전송]은 특정 건을 수동으로 다시 보낼 때 사용', 'b'],
    [''  , 'sp'],
    ['📷 인증샷 첨부 시 참여자 자동 감지 (아이템 등록)', 'sec'],
    ['① 아이템 등록 화면에서 "사진 선택/촬영"으로 인증샷 첨부', 'b'],
    ['② 자동으로 드라이브에 저장 + 링크 자동 입력', 'b'],
    ['③ 사진 속 글자를 인식해 일치하는 멤버를 자동 체크', 'b'],
    ['※ 인식률이 완벽하지 않을 수 있어 항상 "제안"으로만 작동합니다', 'warn'],
    ['   등록 전 반드시 체크된 멤버 목록을 눈으로 확인해주세요', 'warn'],
    ['[최초 1회 설정 — PC에서]', 'b'],
    ['① Apps Script 좌측 메뉴 [서비스] 옆 + 클릭', 'b'],
    ['② "Drive API" 검색 → 추가 (일반 DriveApp과 별개 서비스)', 'b'],
    ['③ 설정 없이 사용하면 사진은 저장되지만 자동 감지만 생략됩니다', 'b'],
    ['※ 하이라이트 색상과 무관하게 사진 속 모든 글자를 인식 시도합니다', 'b'],
    ['※ 대소문자는 구분하지 않고 매칭합니다', 'b'],
    ['※ 3글자 이상 이름은 OCR이 1글자 오독해도 매칭됩니다 (2글자', 'b'],
    ['   이하는 안전을 위해 완전일치만 인정)', 'b'],
    ['※ 번체자(대만 등)·간체자 표기 차이도 자동으로 인식합니다', 'b'],
    ['   (같은 글자의 다른 서체만 연결 — 다른 뜻 글자는 연결 안 함)', 'b'],
    ['※ 일부만 인식됐다면 사진 아래 "🔍 인식된 텍스트 보기"를 눌러', 'b'],
    ['   OCR이 실제로 읽은 원문을 확인할 수 있습니다', 'b'],
    ['※ 사진은 업로드 전 자동으로 대비·밝기가 보정되어 인식률을 높입니다', 'b'],
    ['[인식률 올리기]', 'b'],
    ['자동 인식은 멤버 이름과 괄호 안 표기를 모두 확인하지만,', 'b'],
    ['게임 내 실제 표시 이름이 이 둘과 다르면 놓칠 수 있습니다.', 'b'],
    ['이 경우 [멤버DB] D열 "게임표시명"에 실제 게임에 뜨는', 'b'],
    ['이름 그대로 입력해두면 그 다음부터 정확히 인식됩니다', 'b'],
    ['(추측하지 않고 정확한 정보만 사용 — 오매칭 방지)', 'b'],
    ['', 'sp'],

    ['🔔 디스코드 알림', 'sec'],
    ['① [🔗 디스코드 웹훅 설정]에 채널 웹훅 URL 등록 (최초 1회)', 'b'],
    ['② 정산 후 [📤 디스코드로 전송] → 최근 정산 내역이 채널에 공지됨', 'b'],
    ['', 'sp'],

    ['🛠 관리 도구', 'sec'],
    ['· [🚀 최초 설치]: 새 파일에서 1회 실행 → 전체 시트 자동 세팅', 'b'],
    ['· [🔄 데이터 보존 업그레이드]: 시트 재구성 (기록·잔액 보존)', 'b'],
    ['· [📥 v2 데이터 가져오기]: 옛 파일 기록·잔액 이관 (1회만!)', 'b'],
    ['· [📖 사용안내 새로고침]: 이 설명서를 최신으로 갱신', 'b'],
    ['· [📐 시트 정돈]: 시트 순서를 표준대로 정렬 + 행높이 35 통일', 'b'],
    ['· [🔤 멤버 이름 서식 통일]: 이름 칸을 폰트 13/왼쪽/세로가운데로', 'b'],
    ['  (멤버DB·참여자현황·잔액현황 재구성 시에도 자동 유지됩니다)', 'b'],
    ['  (표준 목록에 없는 시트는 확인 후에만 삭제 — 안전 장치)', 'b'],
    ['· [🔒 보호 재적용]/[🔓 해제]: 자동 관리 영역 수정 방지', 'b'],
    ['  보호 영역(잔액·기록·수식 등)을 만지면 경고 팝업이 뜹니다.', 'b'],
    [''  , 'sp'],
    ['📇 담당자 기록 (누가 했는지 자동 확인)', 'sec'],
    ['· ' + LEDGER_SHEET + ' L/M/N열에 입력자·분배자·수정자 이메일이', 'b'],
    ['  자동 기록됩니다 (PC는 구글 계정, 모바일은 최초 1회 물어본', 'b'],
    ['  이메일을 기기에 저장해 재사용 — 이름 입력 불필요)', 'b'],
    ['· 웹앱 상단 📧 아이콘으로 저장된 이메일을 언제든 변경 가능', 'b'],
    ['· [' + AUDIT_SHEET + '] 시트: 등록·분배·정정·삭제·지급·지급취소·', 'b'],
    ['  개명까지 전부 영구 기록. 항목을 삭제해도 이 기록은 남습니다', 'b'],
    ['· [⚠️ 공장 초기화]를 실행해도 [' + AUDIT_SHEET + ']는 절대', 'b'],
    ['  삭제되지 않습니다 (파일을 열 때마다 존재 여부를 자동 점검·', 'b'],
    ['  복구하며, 복구 사실도 로그에 남습니다)', 'b'],
    ['  경고가 뜨면 [취소]하세요 — 강행하면 정합성이 깨질 수 있습니다.', 'b'],
    ['· [⚠️ 공장 초기화]: 시즌 기록 포함 전부 삭제 — 복구 불가!', 'warn'],
    ['', 'sp'],

    ['🚨 하지 마세요', 'sec'],
    ['· 시트를 "표(테이블)"로 변환 금지 → "유형이 적용된 열..." 오류로', 'warn'],
    ['  정산 중단됨. 복구: 표 셀 클릭 → 표 이름 드롭다운(▼) → 범위로 변환', 'warn'],
    ['· ' + LEDGER_SHEET + '·잔액현황·지급기록 수동 수정 금지 (자동 관리 영역)', 'warn'],
    ['· 시즌N 시트 이름 변경 금지 (시즌 번호 자동 계산에 사용)', 'warn'],
  ];

  L.forEach((l, i) => {
    const r = i + 2;
    const cell = sheet.getRange(r, 2);
    cell.setValue(l[0]);
    if (l[1] === 'title') { cell.setFontWeight('bold').setFontSize(16); sheet.setRowHeight(r, 34); }
    else if (l[1] === 'sub') { cell.setFontColor('#666').setFontSize(11); }
    else if (l[1] === 'sec') {
      sheet.getRange(r, 1, 1, 2).setBackground('#37474F');
      cell.setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(12);
      sheet.setRowHeight(r, 30);
    }
    else if (l[1] === 'warn') { cell.setFontColor('#C62828'); }
  });
  sheet.setTabColor('#9E9E9E');
}

// 📖 사용안내 새로고침 (메뉴)
function refreshGuide() {
  _rebuildGuide(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('✅ 사용안내가 v' + VERSION + ' 기준 최신 내용으로 갱신되었습니다.\n(첫 번째 탭에서 확인하세요)');
}

// ─────────────────────────────────────────
// 4. 멤버DB 시트 (기존 멤버 유지 옵션)
// ─────────────────────────────────────────
function _buildMemberDB(ss, existingMembers) {
  const sheet = ss.insertSheet('멤버DB');
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 160);
  sheet.getRange('A1:D1').setValues([['번호','멤버 이름','상태','게임표시명(선택, OCR용)']])
    .setBackground('#1A237E').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('D1').setNote('인증샷 자동 인식(OCR)이 이 멤버를 못 찾을 때 사용합니다.\n게임 화면에 실제로 표시되는 이름을 그대로 입력해두면\n이후 사진 속에서 정확히 매칭됩니다. 비워두면 기존처럼\n멤버 이름(코어) 및 괄호 안 표기로만 매칭을 시도합니다.');
  for (let i = 0; i < MAX_MEMBERS; i++) {
    const r = i + 2;
    sheet.getRange(r, 1).setValue(i + 1).setHorizontalAlignment('center').setFontColor('#999');
    sheet.getRange(r, 2).setBackground('#FFF9C4');
    sheet.getRange(r, 4).setBackground('#F1F8FF');
    if (existingMembers[i]) sheet.getRange(r, 2).setValue(existingMembers[i]);
  }
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['활성','비활성'], true).build();
  sheet.getRange(2, 3, MAX_MEMBERS, 1).setDataValidation(rule);
  sheet.setFrozenRows(1);
  sheet.setTabColor('#2196F3');
}

// 멤버 → 게임표시명(D열) 맵 조회 (없으면 빈 문자열)
function _getDisplayNameMap(ss) {
  const db = ss.getSheetByName('멤버DB');
  const map = {};
  if (!db) return map;
  const vals = db.getRange(2, 2, MAX_MEMBERS, 3).getValues(); // B,C,D
  vals.forEach(r => {
    const name = String(r[0]).trim();
    const disp = String(r[2]).trim();
    if (name && disp) map[name] = disp;
  });
  return map;
}

// ─────────────────────────────────────────
// 5. 참여자현황 시트
// ─────────────────────────────────────────
function _buildInputSheet(ss, members) {
  const sheet = ss.insertSheet(INPUT_SHEET);
  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 200);

  const n = members.length;
  const lastMemberRow = MEMBER_START_ROW + Math.max(n, 1) - 1;

  // 상단 입력부 (1아이템명 / 2인증샷 / 3참여인원) — 금액 입력 없음 (판매 후 누적기록에서 분배)
  const labels = [['📦 아이템명'],['🔗 인증샷(선택)'],['👥 참여인원']];
  sheet.getRange(1, 1, 3, 1).setValues(labels)
    .setBackground('#37474F').setFontColor('#FFF').setFontWeight('bold');
  sheet.getRange('B1').setBackground('#FFF9C4');
  sheet.getRange('B2').setBackground('#FFF9C4');
  sheet.getRange('B3').setBackground('#E8F5E9')
    .setFormula(`=COUNTIF(B${MEMBER_START_ROW}:B${MEMBER_START_ROW + MAX_MEMBERS - 1},TRUE)`)
    .setFontWeight('bold').setHorizontalAlignment('center');

  // 멤버 선택 헤더 (4행)
  sheet.getRange('A4').setValue('멤버명').setBackground('#78909C').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('B4').setValue('참여✓').setBackground('#78909C').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');

  // 멤버 행 (5행부터)
  if (n > 0) {
    sheet.getRange(MEMBER_START_ROW, 1, n, 1).setValues(members.map(m => [m]));
    sheet.getRange(MEMBER_START_ROW, 2, n, 1).insertCheckboxes();
    for (let i = 0; i < n; i++) {
      if (members[i] === FUND_NAME) {
        sheet.getRange(MEMBER_START_ROW + i, 1).setFontColor('#E65100').setFontStyle('italic')
          .setNote('혈비 적립 계정 — 참여 체크와 무관하게 분배 시 자동으로 ' + Math.round(FUND_RATE * 100) + '%가 적립됩니다.');
      }
      sheet.setRowHeight(MEMBER_START_ROW + i, 36);
    }
  }
  sheet.setFrozenRows(4);
  sheet.setTabColor('#4CAF50');
}

// ─────────────────────────────────────────
// 6. 누적기록 시트
// ─────────────────────────────────────────
function _buildLedger(ss) {
  const sheet = ss.insertSheet(LEDGER_SHEET);
  const widths = [110, 150, 90, 60, 260, 80, 60, 100, 90, 90, 110, 160, 160, 160];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS])
    .setBackground('#37474F').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(1, LG.AMOUNT).setNote('부분 팁: 판매금액을 여기에 미리 적고 분배✓를 체크하면 팝업 없이 즉시 분배됩니다 (모바일 시트 앱 호환).');
  sheet.getRange(1, LG.INPUTBY).setNote('아이템을 등록한 사람의 이메일 — 자동 기록, 수정하지 마세요.');
  sheet.getRange(1, LG.DISTBY).setNote('분배✓를 실행한 사람의 이메일 — 자동 기록, 수정하지 마세요.');
  sheet.getRange(1, LG.EDITBY).setNote('[🔄 분배 정정]을 실행한 사람의 이메일(최근 1건) — 자동 기록, 수정하지 마세요.\n전체 이력은 [' + AUDIT_SHEET + '] 시트에서 확인 가능합니다.');
  // 상태 조건부서식: 미분배 행 강조
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains(ST_WAIT)
    .setBackground('#FFF3E0')
    .setRanges([sheet.getRange(2, LG.STATUS, 500, 1)])
    .build();
  sheet.setConditionalFormatRules([rule]);
  sheet.setFrozenRows(1);
  sheet.setTabColor('#9C27B0');
}

// ─────────────────────────────────────────
// 작업기록 시트: 등록·분배·정정·삭제 영구 감사 로그
//   분배대기중 행이 삭제되어도(예: 아이템 완전 삭제) 이력은 여기 남는다.
// ─────────────────────────────────────────
function _buildAuditLog(ss) {
  const sheet = ss.insertSheet(AUDIT_SHEET);
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 320);
  sheet.getRange('A1:E1').setValues([['일시','작업','아이템명','담당자(이메일)','상세']])
    .setBackground('#37474F').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setTabColor('#607D8B');
}

// 실행자 이메일 확보: PC(Sheets 메뉴/onEdit)는 Session에서 자동 확인,
// 웹앱(모바일)은 Session이 비어있으므로 클라이언트가 전달한 이메일을 사용
function _getActorEmail(clientEmail) {
  try {
    const sessionEmail = Session.getActiveUser().getEmail();
    if (sessionEmail) return sessionEmail;
  } catch (e) { /* 무시 */ }
  const ce = String(clientEmail || '').trim();
  return ce || '(알수없음)';
}

// 작업기록에 한 줄 추가 (실패해도 본 기능은 계속 진행되도록 항상 try/catch로 감쌀 것)
function _logAction(ss, action, itemName, actor, detail) {
  try {
    const log = ss.getSheetByName(AUDIT_SHEET) || _getOrCreateAuditLog(ss);
    const r = log.getLastRow() + 1;
    log.getRange(r, 1, 1, 5).setValues([[new Date(), action, itemName, actor, detail || '']]);
    log.getRange(r, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  } catch (e) { /* 감사 로그 기록 실패는 본 작업을 막지 않음 */ }
}

function _getOrCreateAuditLog(ss) {
  let log = ss.getSheetByName(AUDIT_SHEET);
  if (!log) _buildAuditLog(ss);
  return ss.getSheetByName(AUDIT_SHEET);
}

// ★ 영구 로그 무결성 점검: 파일을 열 때마다 실행되어, 누군가 [작업기록]
//   시트를 수동으로 삭제했더라도(구글시트는 프로그램으로 완전히 막을 수
//   없음) 즉시 재생성하고 그 사실 자체를 새 로그에 남긴다.
function _ensureAuditLogExists() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName(AUDIT_SHEET)) {
      _buildAuditLog(ss);
      _applyProtections(ss);
      _logAction(ss, '복구', '-', _getActorEmail(),
        '[' + AUDIT_SHEET + '] 시트가 없어져 있어 자동으로 다시 생성했습니다. 이전 로그가 있었다면 유실된 것이니 확인이 필요합니다.');
    }
  } catch (e) { /* onOpen 초반 실패는 조용히 무시(권한 초기화 등) */ }
}

// ─────────────────────────────────────────
// 7. 잔액현황 시트 (합계행 포함)
// ─────────────────────────────────────────
function _buildBalance(ss, members) {
  const sheet = ss.insertSheet('잔액현황');
  sheet.setColumnWidth(BAL_COL.NAME, 150);
  sheet.setColumnWidth(BAL_COL.PENDING, 100);
  sheet.setColumnWidth(BAL_COL.PAID, 100);
  sheet.setColumnWidth(BAL_COL.CNT, 75);
  sheet.setColumnWidth(BAL_COL.CHECK, 60);
  sheet.setColumnWidth(BAL_COL.AMT, 100);
  sheet.getRange('A1:F1').setValues([['멤버','분배전(다이아)','분배완료(다이아)','참여횟수','지급✓','지급액(선택)']])
    .setBackground('#37474F').setFontColor('#FFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('F1').setNote('부분 지급: 금액을 입력한 뒤 지급✓를 체크하면 그 금액만 지급됩니다.\n비워두고 체크하면 분배전 전액이 지급됩니다.\n지급 후 이 칸은 자동으로 비워집니다.');

  const n = members.length;
  for (let i = 0; i < n; i++) {
    _writeBalanceRow(sheet, i + 2, members[i], 0, 0, 0, false);
  }
  // 합계행 (분배전·분배완료 각각)
  const totalRow = n + 2;
  sheet.getRange(totalRow, 1).setValue('합계').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(totalRow, 2).setFormula(`=SUM(B2:B${totalRow - 1})`).setFontWeight('bold').setNumberFormat('#,##0').setHorizontalAlignment('right');
  sheet.getRange(totalRow, 3).setFormula(`=SUM(C2:C${totalRow - 1})`).setFontWeight('bold').setNumberFormat('#,##0').setHorizontalAlignment('right');
  sheet.setRowHeight(totalRow, 34);
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);
  // 분배전 잔액이 남은 멤버 자동 강조 (한눈에 "줘야 할 사람" 식별)
  const hlRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setBackground('#FFE082')
    .setBold(true)
    .setRanges([sheet.getRange(2, BAL_COL.PENDING, MAX_MEMBERS + 10, 1)])
    .build();
  sheet.setConditionalFormatRules([hlRule]);
  sheet.setTabColor('#FF9800');
}

// ─────────────────────────────────────────
// 8. ✅ 정산 실행 (동적 멤버 수 대응)
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// 📝 아이템 등록: 참여자현황 → 누적기록에 ⏳미분배 행 추가
// ─────────────────────────────────────────
function registerItem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const inputSheet = ss.getSheetByName(INPUT_SHEET);
  const ledger = ss.getSheetByName(LEDGER_SHEET);
  if (!inputSheet || !ledger) {
    ui.alert('❌ 시트를 찾을 수 없습니다.\n· 새 파일이라면 → [🚀 최초 설치]\n· 기존 파일이라면 → [🔄 데이터 보존 업그레이드]');
    return;
  }

  const itemName = inputSheet.getRange('B1').getDisplayValue().trim();
  const photoLink = inputSheet.getRange('B2').getDisplayValue().trim();
  if (!itemName) { ui.alert('⚠️ 아이템명을 입력해주세요.'); return; }

  const checkData = inputSheet.getRange(MEMBER_START_ROW, 1, MAX_MEMBERS, 2).getValues();
  const participants = [];
  checkData.forEach(row => {
    const nm = String(row[0]).trim();
    if (nm && row[1] === true && nm !== FUND_NAME) participants.push(nm);
  });
  if (participants.length === 0) { ui.alert('⚠️ 참여 멤버를 1명 이상 선택해주세요.'); return; }

  const preview = participants.length <= 8 ? participants.join(', ')
    : participants.slice(0, 8).join(', ') + ' 외 ' + (participants.length - 8) + '명';
  if (ui.alert('📝 아이템 등록 확인',
      `📦 ${itemName}\n👥 참여 ${participants.length}명\n${preview}\n\n${LEDGER_SHEET}에 ${ST_WAIT} 상태로 등록됩니다.\n판매 후 [${LEDGER_SHEET}]에서 분배✓를 체크하면 분배가 실행됩니다.\n\n등록할까요?`,
      ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  try {
    _registerCore(ss, itemName, participants, photoLink);
    // 입력 초기화
    let lastNameIdx = -1;
    checkData.forEach((row, i) => { if (String(row[0]).trim()) lastNameIdx = i; });
    if (lastNameIdx >= 0) inputSheet.getRange(MEMBER_START_ROW, 2, lastNameIdx + 1, 1).setValue(false);
    inputSheet.getRange('B1').clearContent();
    inputSheet.getRange('B2').clearContent();
    ui.alert(`✅ 등록 완료!\n"${itemName}" (${participants.length}명)이 ${ST_WAIT} 상태로 저장되었습니다.\n판매되면 [${LEDGER_SHEET}]에서 분배✓ 체크 → 판매금액 입력으로 분배하세요.`);
  } catch (e) {
    if (String(e.message).indexOf('유형이 적용된') >= 0 || String(e.message).indexOf('type applied') >= 0) {
      ui.alert('❌ 시트가 "표(테이블)"로 변환되어 있어 등록할 수 없습니다.\n표 셀 클릭 → 표 이름 드롭다운(▼) → "범위로 변환"\n또는 [🔄 데이터 보존 업그레이드] 실행');
    } else {
      ui.alert('❌ 등록 실패: ' + e.message);
    }
  }
}

// 등록 코어 (메뉴 + 웹앱 공용, UI 없음)
function _registerCore(ss, itemName, participants, photoLink, clientEmail) {
  const ledger = ss.getSheetByName(LEDGER_SHEET);
  if (!ledger) throw new Error(LEDGER_SHEET + ' 시트를 찾을 수 없습니다.');
  const actor = _getActorEmail(clientEmail);
  const r = ledger.getLastRow() + 1;
  ledger.getRange(r, LG.DATE, 1, 5).setValues([[new Date(), itemName, ST_WAIT, participants.length, participants.join(', ')]]);
  ledger.getRange(r, LG.DATE).setNumberFormat('yyyy-mm-dd hh:mm');
  if (photoLink) ledger.getRange(r, LG.PHOTO).setFormula(`=HYPERLINK("${photoLink}","📷 보기")`);
  ledger.getRange(r, LG.CHECK).insertCheckboxes();
  ledger.getRange(r, LG.AMOUNT).setBackground('#FFF9C4').setNumberFormat('#,##0').setHorizontalAlignment('right');
  ledger.getRange(r, LG.STATUS).setHorizontalAlignment('center');
  ledger.getRange(r, LG.INPUTBY).setValue(actor);
  _recalcAllParticipationCounts(ss);   // ★ 등록 즉시 참여횟수 반영 (분배 여부 무관 — 레이드 출석 기준)
  _logAction(ss, '등록', itemName, actor, participants.length + '명 참여 등록');
  const regRow = ledger.getRange(r, 1, 1, 11).getValues()[0];
  _notifyDiscord(_formatDiscordMsg(regRow, false) + (photoLink ? `\n📷 인증샷: ${photoLink}` : ''));
  return r;
}

// ─────────────────────────────────────────
// ★ 참여횟수(레이드 출석) 전면 재계산
//   분배대기중의 모든 행(상태 무관 — 미분배/분배완료 둘 다)의
//   참여자명단을 스캔해 각 멤버가 몇 번 등장하는지 세고,
//   잔액현황 CNT열을 그 값으로 덮어쓴다. 다이아(분배전/완료)와는
//   완전히 독립적인 "순수 레이드 참여 횟수" 지표.
//   ※ 혈비(FUND_NAME)는 대상에서 제외 — 그쪽 CNT는 "분배 이벤트
//     횟수"라는 별개 의미로 _distributeCore에서 계속 관리한다.
// ─────────────────────────────────────────
function _recalcAllParticipationCounts(ss) {
  const ledger = ss.getSheetByName(LEDGER_SHEET);
  const balance = ss.getSheetByName('잔액현황');
  if (!ledger || !balance) return;

  const tally = {};
  if (ledger.getLastRow() > 1) {
    const n = ledger.getLastRow() - 1;
    ledger.getRange(2, LG.NAMES, n, 1).getValues().forEach(r => {
      const namesStr = String(r[0]).trim();
      if (!namesStr) return;
      namesStr.split(',').map(s => s.trim()).filter(Boolean).forEach(p => {
        const key = _normName(p);
        tally[key] = (tally[key] || 0) + 1;
      });
    });
  }

  if (balance.getLastRow() > 1) {
    const rows = balance.getLastRow() - 1;
    balance.getRange(2, BAL_COL.NAME, rows, 1).getValues().forEach((r, i) => {
      const nm = String(r[0]).trim();
      if (!nm || nm === '합계' || nm === FUND_NAME) return;
      const cnt = tally[_normName(nm)] || 0;
      balance.getRange(i + 2, BAL_COL.CNT).setValue(cnt);
    });
  }
}

// 메뉴: 참여횟수 수동 재계산 (드리프트 발생 시 보정용)
function recalcParticipationMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  try {
    _recalcAllParticipationCounts(ss);
    ui.alert('✅ 참여횟수를 ' + LEDGER_SHEET + ' 전체 등록 이력 기준으로 재계산했습니다.\n(다이아 잔액은 변경되지 않습니다 — 참여횟수만 갱신됩니다)');
  } catch (e) {
    ui.alert('❌ 재계산 실패: ' + e.message);
  }
}

// 분배 산식 (단일 소스)
function _calcSplit(totalGold, n) {
  const fund = Math.floor(totalGold * FUND_RATE);
  const distributable = totalGold - fund;
  const perPerson = Math.floor(distributable / n);
  const remainder = distributable - perPerson * n;
  return { fund: fund, distributable: distributable, perPerson: perPerson, remainder: remainder };
}

// ─────────────────────────────────────────
// ★ 분배 코어 (누적기록 분배✓ + 모바일 웹앱 공용, UI 없음)
//   미분배 행에 판매금액을 적용 → 혈비 공제 → 참여자 분배전 가산
// ─────────────────────────────────────────
function _distributeCore(ss, ledger, row, amount, clientEmail) {
  const status = String(ledger.getRange(row, LG.STATUS).getValue()).trim();
  if (status !== ST_WAIT) return { ok: false, reason: 'done' };

  amount = Number(String(amount).replace(/,/g, ''));
  if (!amount || amount <= 0 || amount !== Math.floor(amount)) return { ok: false, reason: 'invalid' };

  const itemName = String(ledger.getRange(row, LG.ITEM).getValue()).trim();
  const namesStr = String(ledger.getRange(row, LG.NAMES).getValue()).trim();
  const participants = namesStr.split(',').map(s => s.trim()).filter(Boolean);
  if (participants.length === 0) return { ok: false, reason: 'noparts' };

  const balance = ss.getSheetByName('잔액현황');
  if (!balance) return { ok: false, reason: 'nobal' };

  const s = _calcSplit(amount, participants.length);
  const members = _getMembers(ss);
  // 나머지 잔여분 귀속 대상: REMAINDER_NAME(고정 지정) 우선, 못 찾으면 첫 번째 멤버로 폴백
  const remainderTarget = members.find(m => _coreName(m) === REMAINDER_NAME) ||
                          (members.filter(m => m !== FUND_NAME)[0]) || participants[0];

  // 잔액현황 이름→행 맵 (_normName 매칭)
  const balData = balance.getRange(2, 1, Math.max(balance.getLastRow() - 1, 1), 4).getValues();
  const nameToRow = {};
  let totalRowIdx = -1;
  balData.forEach((r2, i) => {
    const nm = String(r2[0]).trim();
    if (nm === '합계') { totalRowIdx = i + 2; return; }
    if (nm) nameToRow[_normName(nm)] = i + 2;
  });
  const findRow = (nm) => nameToRow[_normName(nm)];

  // ★ 규칙: 참여자는 전원 예외 없이 동일한 1/N 금액만 받는다 (나머지 미포함)
  //   참여횟수(CNT)는 등록 시점(_registerCore)에 이미 확정되어 있으므로
  //   여기서는 절대 건드리지 않는다 — 분배 금액과 완전히 독립.
  const missing = [];
  participants.forEach(p => {
    const r2 = findRow(p);
    if (!r2) { missing.push(p); return; }
    const curPending = Number(String(balance.getRange(r2, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;
    balance.getRange(r2, BAL_COL.PENDING).setValue(curPending + s.perPerson);
  });
  // ★ 나머지 잔여분은 참여 여부와 무관하게 항상 REMAINDER_NAME에게 별도 적립
  //   (참여횟수는 증가시키지 않음 — 실제 참여 이력과 분리된 순수 잔여분 적립)
  if (s.remainder > 0) {
    const r2 = findRow(remainderTarget);
    if (r2) {
      const cur = Number(String(balance.getRange(r2, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;
      balance.getRange(r2, BAL_COL.PENDING).setValue(cur + s.remainder);
    }
  }
  // 혈비 적립
  let fundNote = '';
  if (s.fund > 0) {
    const fr = findRow(FUND_NAME);
    if (fr) {
      const curP = Number(String(balance.getRange(fr, BAL_COL.PENDING).getValue()).replace(/,/g, '')) || 0;
      const curC = Number(balance.getRange(fr, BAL_COL.CNT).getValue()) || 0;
      balance.getRange(fr, BAL_COL.PENDING).setValue(curP + s.fund);
      balance.getRange(fr, BAL_COL.CNT).setValue(curC + 1);
    } else {
      const insertAt = totalRowIdx > 0 ? totalRowIdx : balance.getLastRow() + 1;
      if (totalRowIdx > 0) balance.insertRowBefore(totalRowIdx);
      _writeBalanceRow(balance, insertAt, FUND_NAME, s.fund, 0, 1, false);
      _rewriteBalanceTotal(balance);
      fundNote = ' (유일배분 행 신규 생성)';
    }
  }

  // 누적기록 행 갱신: 금액·혈비·1인당·분배일·상태
  const actor = _getActorEmail(clientEmail);
  ledger.getRange(row, LG.AMOUNT).setValue(amount).setNumberFormat('#,##0');
  ledger.getRange(row, LG.FUND).setValue(s.fund).setNumberFormat('#,##0');
  ledger.getRange(row, LG.PER).setValue(s.perPerson).setNumberFormat('#,##0');
  ledger.getRange(row, LG.DIST).setValue(new Date()).setNumberFormat('yyyy-mm-dd hh:mm');
  ledger.getRange(row, LG.STATUS).setValue(ST_DONE);
  ledger.getRange(row, LG.CHECK).setValue(false);
  ledger.getRange(row, LG.DISTBY).setValue(actor);
  _logAction(ss, '분배', itemName, actor, amount.toLocaleString() + UNIT + ' 분배 (' + participants.length + '명 × ' + s.perPerson.toLocaleString() + ')');
  const distRow = ledger.getRange(row, 1, 1, 11).getValues()[0];
  const photoFormula = ledger.getRange(row, LG.PHOTO).getFormula();
  const pm = photoFormula.match(/HYPERLINK\("([^"]+)"/);
  _notifyDiscord(_formatDiscordMsg(distRow, true) + (pm ? `\n📷 인증샷: ${pm[1]}` : ''));

  return { ok: true, item: itemName, amount: amount, fund: s.fund, perPerson: s.perPerson,
           remainder: s.remainder, remainderTo: remainderTarget, n: participants.length, missing: missing, fundNote: fundNote };
}

// ─────────────────────────────────────────
// 9. 📥 v2 데이터 가져오기 (옛 스프레드시트 → 현재 파일)
//    - 옛 파일의 [누적기록] 전체 행 + [잔액현황] 이름별 잔액을 가져옴
//    - 잔액은 현재 값에 "더하기" 방식 → 새 파일(잔액 0)에서 1회만 실행
//    - 멤버DB에 없는 옛 이름은 잔액현황 하단에 보존
// ─────────────────────────────────────────
function importFromV2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // ── 옛 파일 URL/ID 입력 ──
  const resp = ui.prompt('📥 v2 데이터 가져오기',
    '옛 v2 스프레드시트의 URL(또는 파일 ID)을 붙여넣어주세요.\n' +
    '※ 같은 구글 계정으로 접근 가능한 파일이어야 합니다.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const raw = resp.getResponseText().trim();
  const m = raw.match(/[-\w]{25,}/);
  if (!m) { ui.alert('⚠️ URL에서 파일 ID를 찾지 못했습니다.'); return; }
  const oldId = m[0];
  if (oldId === ss.getId()) {
    ui.alert('⚠️ 현재 파일과 같은 파일입니다.\n같은 파일이라면 데이터가 이미 시트에 있으므로\n[🔄 데이터 보존 업그레이드]만 실행하면 됩니다.');
    return;
  }

  let oldSS;
  try {
    oldSS = SpreadsheetApp.openById(oldId);
  } catch (e) {
    ui.alert('❌ 옛 파일을 열 수 없습니다: ' + e.message +
      '\n\n· 파일 ID가 맞는지\n· 현재 계정에 열람 권한이 있는지 확인해주세요.');
    return;
  }

  const oldLedger = oldSS.getSheetByName('누적기록');
  const oldBal = oldSS.getSheetByName('잔액현황');
  if (!oldLedger && !oldBal) {
    ui.alert('⚠️ 옛 파일에서 [누적기록]/[잔액현황] 시트를 찾지 못했습니다.\n시트 이름을 확인해주세요.');
    return;
  }

  // ── 중복 실행 방지 경고 ──
  const curLedger = ss.getSheetByName(LEDGER_SHEET);
  const curBal = ss.getSheetByName('잔액현황');
  if (!curLedger || !curBal) {
    ui.alert('❌ 현재 파일에 [' + LEDGER_SHEET + ']/[잔액현황] 시트가 없습니다.\n[🔄 데이터 보존 업그레이드]를 먼저 실행해주세요.');
    return;
  }
  const alreadyHasData = curLedger.getLastRow() > 1;
  let warnMsg = `옛 파일: "${oldSS.getName()}"\n\n· 누적기록 ${oldLedger ? Math.max(oldLedger.getLastRow() - 1, 0) : 0}건\n· 잔액현황 잔액을 현재 값에 더해서 가져옵니다.\n\n⚠️ 이 기능은 새 파일에서 1회만 실행하세요.\n두 번 실행하면 잔액이 중복 합산됩니다.`;
  if (alreadyHasData) warnMsg += `\n\n🚨 현재 파일에 이미 ${LEDGER_SHEET} ${curLedger.getLastRow() - 1}건이 있습니다!\n중복 가능성을 확인 후 진행하세요.`;
  if (ui.alert('📥 가져오기 확인', warnMsg + '\n\n계속할까요?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  try {
    let importedLedger = 0;
    let importedBalance = 0;
    const unmatched = [];

    // ── 1) 누적기록 가져오기 — 구 스키마를 신 14열로 변환 (✅분배완료 이관) ──
    if (oldLedger && oldLedger.getLastRow() > 1) {
      const n = oldLedger.getLastRow() - 1;
      const c = Math.max(oldLedger.getLastColumn(), 7);
      const headC1 = String(oldLedger.getRange(1, 3).getValue());
      const isNewSchema = headC1.indexOf('상태') >= 0;
      const vals = oldLedger.getRange(2, 1, n, c).getValues();
      const fmls = oldLedger.getRange(2, 1, n, c).getFormulas();
      const startRow = curLedger.getLastRow() + 1;
      const outVals = [];
      const photoFs = [];
      const pad14 = (arr) => { const a = arr.slice(0, 14); while (a.length < 14) a.push(''); return a; };
      for (let i = 0; i < n; i++) {
        if (isNewSchema) {
          outVals.push(pad14(vals[i]));
          photoFs.push(fmls[i][LG.PHOTO - 1] || '');
        } else {
          // 구: [날짜, 아이템, 총액, 인원, 1인당, 명단, 인증샷, (혈비)]
          const v = vals[i];
          outVals.push(pad14([v[0], v[1], ST_DONE, v[3], v[5], '', '', v[2], (v[7] !== undefined ? v[7] : ''), v[4], v[0]]));
          photoFs.push(fmls[i][6] || '');
        }
      }
      curLedger.getRange(startRow, 1, n, 14).setValues(outVals);
      for (let i = 0; i < n; i++) {
        if (photoFs[i]) curLedger.getRange(startRow + i, LG.PHOTO).setFormula(photoFs[i]);
        curLedger.getRange(startRow + i, LG.CHECK).insertCheckboxes();
      }
      curLedger.getRange(startRow, LG.DATE, n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      curLedger.getRange(startRow, LG.DIST, n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      [LG.AMOUNT, LG.FUND, LG.PER].forEach(col =>
        curLedger.getRange(startRow, col, n, 1).setNumberFormat('#,##0'));
      curLedger.getRange(startRow, LG.STATUS, n, 1).setHorizontalAlignment('center');
      importedLedger = n;
    }

    // ── 2) 잔액현황 가져오기 (v2 누적수령 → 분배전으로 가산) ──
    if (oldBal && oldBal.getLastRow() > 1) {
      const importMap = _readBalanceMap(oldBal);   // name → {pending, paid, cnt}

      // 현재 잔액현황 이름 → 행 맵
      const curVals = curBal.getRange(2, 1, Math.max(curBal.getLastRow() - 1, 1), 1).getValues();
      const nameToRow = {};
      let totalRow = -1;
      curVals.forEach((r, i) => {
        const nm = String(r[0]).trim();
        if (nm === '합계') { totalRow = i + 2; return; }
        if (nm) nameToRow[nm.replace(' (미등록)', '')] = i + 2;
      });

      Object.keys(importMap).forEach(name => {
        const d = importMap[name];
        if (nameToRow[name]) {
          const r = nameToRow[name];
          const num = (col) => Number(String(curBal.getRange(r, col).getValue()).replace(/,/g, '')) || 0;
          curBal.getRange(r, BAL_COL.PENDING).setValue(num(BAL_COL.PENDING) + d.pending);
          curBal.getRange(r, BAL_COL.PAID).setValue(num(BAL_COL.PAID) + d.paid);
          curBal.getRange(r, BAL_COL.CNT).setValue(num(BAL_COL.CNT) + d.cnt);
        } else {
          // 멤버DB에 없는 옛 이름 → 합계행 앞에 보존
          let insertAt = totalRow > 0 ? totalRow : curBal.getLastRow() + 1;
          if (totalRow > 0) curBal.insertRowBefore(totalRow);
          _writeBalanceRow(curBal, insertAt, name, d.pending, d.paid, d.cnt, true);
          if (totalRow > 0) totalRow++;
          unmatched.push(name);
        }
        importedBalance++;
      });

      // 합계 수식 재작성
      _rewriteBalanceTotal(curBal);
    }

    let msg = `✅ v2 데이터 가져오기 완료!\n\n· ${LEDGER_SHEET} ${importedLedger}건 가져옴\n· 잔액 ${importedBalance}명 반영`;
    if (unmatched.length > 0) {
      msg += `\n\n⚠️ 멤버DB에 없는 이름 ${unmatched.length}명은 '(미등록)'으로 하단에 보존:\n${unmatched.join(', ')}\n현재 멤버와 같은 사람(표기 차이)이라면 멤버DB 표기를 맞춘 뒤 수동 정리해주세요.`;
    }
    ui.alert(msg);
  } catch (e) {
    ui.alert('❌ 가져오기 실패: ' + e.message);
  }
}

// ─────────────────────────────────────────
// 10. 디스코드 웹훅
// ─────────────────────────────────────────
function setDiscordWebhook() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('🔗 디스코드 웹훅 설정', '웹훅 URL을 붙여넣어주세요:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const url = resp.getResponseText().trim();
  if (!url.startsWith('https://discord.com/api/webhooks/')) {
    ui.alert('⚠️ 올바른 디스코드 웹훅 URL이 아닙니다.'); return;
  }
  PropertiesService.getDocumentProperties().setProperty('DISCORD_WEBHOOK', url);
  ui.alert('✅ 웹훅이 저장되었습니다.\n앞으로 아이템 등록·분배 시 자동으로 알림이 전송됩니다.');
}

// 디스코드 자동/수동 전송 공용 헬퍼. 웹훅 미설정 시 조용히 무시,
// 전송 실패도 절대 본 기능(등록·분배)을 막지 않도록 항상 안전하게 처리.
function _notifyDiscord(message) {
  try {
    const url = PropertiesService.getDocumentProperties().getProperty('DISCORD_WEBHOOK');
    if (!url) return false;
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ content: message }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) { return false; }
}

// 등록/분배 건에 대한 디스코드 메시지 포맷 (자동 알림 + 수동 재전송 공용)
function _formatDiscordMsg(row, isDone) {
  let msg;
  if (isDone) {
    const distDate = Utilities.formatDate(new Date(row[LG.DIST - 1]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    msg = `🎮 **길드 분배 알림**\n📅 ${distDate}\n📦 ${row[LG.ITEM - 1]}\n💎 판매 ${Number(row[LG.AMOUNT - 1]).toLocaleString()} ${UNIT}\n🏦 혈비(${FUND_NAME}): ${Number(row[LG.FUND - 1]).toLocaleString()} ${UNIT}\n👥 ${row[LG.CNT - 1]}명 × ${Number(row[LG.PER - 1]).toLocaleString()} ${UNIT}\n📝 ${row[LG.NAMES - 1]}`;
  } else {
    const regDate = Utilities.formatDate(new Date(row[LG.DATE - 1]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    msg = `🎮 **길드 아이템 등록 알림**\n📅 ${regDate}\n📦 ${row[LG.ITEM - 1]} (${ST_WAIT})\n👥 ${row[LG.CNT - 1]}명 참여\n📝 ${row[LG.NAMES - 1]}`;
  }
  const photoFormula = String(row[LG.PHOTO - 1] || '');
  return msg;
}

function sendLatestToDiscord() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const url = PropertiesService.getDocumentProperties().getProperty('DISCORD_WEBHOOK');
  if (!url) { ui.alert('⚠️ 웹훅이 설정되지 않았습니다.\n[🔗 디스코드 웹훅 설정]을 먼저 실행해주세요.'); return; }

  const ledger = ss.getSheetByName(LEDGER_SHEET);
  if (!ledger || ledger.getLastRow() < 2) { ui.alert('⚠️ 전송할 기록이 없습니다.'); return; }

  // 가장 최근 ✅분배완료 행 탐색 (없으면 최근 등록 건)
  const n = ledger.getLastRow() - 1;
  const vals = ledger.getRange(2, 1, n, 11).getValues();
  let idx = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (String(vals[i][LG.STATUS - 1]).trim() === ST_DONE) { idx = i; break; }
  }
  const isDone = idx >= 0;
  if (idx < 0) idx = n - 1;
  const row = vals[idx];
  const r = idx + 2;
  const photoFormula = ledger.getRange(r, LG.PHOTO).getFormula();
  const m = photoFormula.match(/HYPERLINK\("([^"]+)"/);
  const photoUrl = m ? m[1] : '';

  let msg = _formatDiscordMsg(row, isDone);
  if (photoUrl) msg += `\n📷 인증샷: ${photoUrl}`;

  _notifyDiscord(msg);
  ui.alert('📤 디스코드로 전송했습니다.');
}

// ═══════════════════════════════════════════════════════════════
//  🔒 시트 보호 (v4.6) — 자동 관리 영역 수작업 방지
//  경고 모드(warn): 수정 시도 시 "정말 수정?" 팝업 — 실수 방지
//  차단 모드(block): 공유 편집자 수정 차단 (소유자는 경고만 가능)
//  ※ 스크립트의 자동 기록(정산·지급 등)은 보호와 무관하게 작동
// ═══════════════════════════════════════════════════════════════
function _applyOneProtection(p, desc) {
  p.setDescription('🔒 자동관리: ' + desc);
  if (PROTECT_MODE === 'block') {
    try { p.removeEditors(p.getEditors().map(String)); } catch (e) {}
    try { if (p.canDomainEdit()) p.setDomainEdit(false); } catch (e) {}
  } else {
    p.setWarningOnly(true);
  }
}

function _clearAllProtections(ss) {
  ss.getSheets().forEach(s => {
    s.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => { try { p.remove(); } catch (e) {} });
    s.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => { try { p.remove(); } catch (e) {} });
  });
}

function _applyProtections(ss) {
  _clearAllProtections(ss);
  const lastMemberRow = MEMBER_START_ROW + MAX_MEMBERS - 1;
  const balRows = MAX_MEMBERS + 20;   // 미등록·합계 여유 포함

  // 전체 보호 시트 (누적기록은 부분 보호로 변경 — 분배✓·판매금액 입력 허용)
  const whole = [
    ['사용안내', '설명서 (메뉴 [📖 사용안내 새로고침]으로 갱신)'],
    [PAYOUT_SHEET, '지급 원장 — 자동 기록 전용'],
    [AUDIT_SHEET, '작업기록(감사 로그) — 자동 기록 전용, 수정·삭제 금지'],
  ];
  whole.forEach(([name, desc]) => {
    const s = ss.getSheetByName(name);
    if (s) _applyOneProtection(s.protect(), desc);
  });
  // 시즌 보관 시트 전체 보호
  ss.getSheets().forEach(s => {
    if (/^시즌\d+$/.test(s.getName())) _applyOneProtection(s.protect(), '시즌 보관 기록 — 변경 금지');
  });

  // 멤버DB: 번호·헤더만 보호 (이름·상태는 입력 창구)
  const db = ss.getSheetByName('멤버DB');
  if (db) {
    _applyOneProtection(db.getRange('A1:D1').protect(), '헤더');
    _applyOneProtection(db.getRange(2, 1, MAX_MEMBERS, 1).protect(), '번호 자동 생성');
  }

  // 참여자현황: 라벨·멤버명·자동계산 보호 (B1 아이템명·B2 인증샷·체크박스는 입력 허용)
  const inp = ss.getSheetByName(INPUT_SHEET);
  if (inp) {
    _applyOneProtection(inp.getRange('A1:A' + lastMemberRow).protect(), '라벨·멤버명 — 멤버DB에서 관리');
    _applyOneProtection(inp.getRange('B3').protect(), '참여인원 자동 계산');
    _applyOneProtection(inp.getRange('A4:B4').protect(), '헤더');
  }

  // 누적기록: 분배✓(G)·판매금액(H)만 입력 허용, 나머지 보호
  const lg = ss.getSheetByName(LEDGER_SHEET);
  if (lg) {
    const lgRows = Math.max(lg.getLastRow(), 2) + 300;   // 향후 추가 행 여유
    _applyOneProtection(lg.getRange(1, 1, lgRows, LG.PHOTO).protect(), '아이템 기록 — [📝 아이템 등록]으로만 추가');
    _applyOneProtection(lg.getRange(1, LG.FUND, lgRows, 6).protect(), '분배 결과·담당자 기록 — 자동 기록 전용');
    _applyOneProtection(lg.getRange(1, LG.CHECK, 1, 2).protect(), '헤더');
  }

  // 잔액현황: 멤버·잔액·횟수 보호 (지급✓·지급액은 입력 허용)
  const bal = ss.getSheetByName('잔액현황');
  if (bal) {
    _applyOneProtection(bal.getRange(1, 1, balRows, 4).protect(), '멤버·분배전·분배완료·횟수 — 정산/지급으로만 변경');
    _applyOneProtection(bal.getRange('E1:F1').protect(), '헤더');
  }
}

function applyProtectionsMenu() {
  _applyProtections(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('🔒 시트 보호 적용 완료 (모드: ' + (PROTECT_MODE === 'block' ? '차단' : '경고') + ')\n\n' +
    '보호 영역을 수정하려 하면 경고가 표시됩니다.\n' +
    '입력 가능한 곳: 참여자현황 B1·B2·B6·체크박스,\n잔액현황 지급✓·지급액, 멤버DB 이름·상태');
}

function removeProtectionsMenu() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('🔓 보호 전체 해제', '모든 시트 보호를 해제합니다.\n관리 작업 후 [🔒 시트 보호 재적용]을 잊지 마세요.\n\n계속할까요?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  _clearAllProtections(SpreadsheetApp.getActiveSpreadsheet());
  ui.alert('🔓 해제 완료. 작업 후 [🔒 시트 보호 재적용]을 실행해주세요.');
}

// ═══════════════════════════════════════════════════════════════
//  👥 혈맹원 명단 · 아이디 변경 API (v8.1)
// ═══════════════════════════════════════════════════════════════

// 앱 [혈맹원 관리]용 명단 — 이름과 게임표시명(선택)을 함께 준다
function api_getRoster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const displayMap = _getDisplayNameMap(ss);
  const bal = ss.getSheetByName('잔액현황');

  // 잔액이 남은 사람은 이름을 바꿀 때 더 조심해야 하므로 함께 내려준다
  const pendingMap = {};
  if (bal && bal.getLastRow() > 1) {
    bal.getRange(2, 1, bal.getLastRow() - 1, 2).getValues().forEach(r => {
      const nm = String(r[0]).trim();
      if (nm && nm !== '합계') {
        pendingMap[_normName(nm)] = Number(String(r[1]).replace(/,/g, '')) || 0;
      }
    });
  }

  return _getMembers(ss).map(function (name) {
    return {
      name: name,
      displayName: displayMap[name] || '',
      pending: pendingMap[_normName(name)] || 0,
      isFund: name === FUND_NAME
    };
  });
}

// 혈맹원 아이디 변경
//   바꿀 이름이 이미 명단에 있으면 두 사람의 잔액·참여횟수가 합쳐진다.
//   실수로 남의 잔액을 흡수하는 사고를 막기 위해, 그 경우에는
//   confirmMerge 를 명시적으로 받기 전까지 거부한다.
function api_renameMember(oldName, newName, email, confirmMerge) {
  oldName = String(oldName || '').trim();
  newName = String(newName || '').trim();

  if (!oldName || !newName) return { ok: false, msg: '이름을 모두 입력해주세요.' };
  if (newName.length > 30) return { ok: false, msg: '이름이 너무 깁니다 (30자 이내).' };
  if (_normName(oldName) === _normName(newName)) {
    return { ok: false, msg: '기존 이름과 같습니다.' };
  }
  if (oldName === FUND_NAME || newName === FUND_NAME) {
    return { ok: false, msg: '혈비 계정(' + FUND_NAME + ')은 앱에서 변경할 수 없습니다. PC 시트에서 처리해주세요.' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const members = _getMembers(ss);

  const exists = members.some(function (m) { return _normName(m) === _normName(oldName); });
  if (!exists) return { ok: false, msg: '"' + oldName + '" 을(를) 멤버DB에서 찾지 못했습니다. 새로고침 후 다시 시도해주세요.' };

  // 이미 있는 이름으로 바꾸려는 경우 → 병합. 한 번 더 확인받는다.
  const dup = members.filter(function (m) { return _normName(m) === _normName(newName); })[0];
  if (dup && confirmMerge !== true) {
    const roster = api_getRoster();
    const pick = function (nm) {
      const hit = roster.filter(function (r) { return _normName(r.name) === _normName(nm); })[0];
      return hit ? hit.pending : 0;
    };
    return {
      ok: false,
      needsConfirm: true,
      msg: '"' + newName + '" 은(는) 이미 명단에 있는 이름입니다.\n\n' +
           '그대로 진행하면 두 계정이 하나로 합쳐집니다.\n' +
           '· ' + oldName + ' 분배전 ' + pick(oldName).toLocaleString() + UNIT + '\n' +
           '· ' + newName + ' 분배전 ' + pick(newName).toLocaleString() + UNIT + '\n\n' +
           '동일 인물이 맞을 때만 진행하세요.'
    };
  }

  try {
    const r = _renameCore(ss, oldName, newName, email);
    return {
      ok: true,
      merged: r.merged === true,
      msg: '✅ "' + oldName + '" → "' + newName + '" 변경 완료' + (r.merged ? ' (중복 계정 병합됨)' : '')
    };
  } catch (e) {
    return { ok: false, msg: '변경 중 오류가 발생했습니다: ' + e.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  📥 기존 길드정산 파일에서 가져오기 (v8.1)
//
//  왜 필요한가: 운영 중인 파일을 건드리면 옮기는 동안 길드 관리가 멈춘다.
//  그래서 새 파일에 v8.1을 설치해 충분히 확인한 뒤, 준비가 끝났을 때
//  이 메뉴로 실제 데이터를 한 번에 옮긴다.
//
//  방식은 "덮어쓰기"다. 여러 번 실행해도 결과가 같아서(멱등),
//  옮기다 중단되거나 옛 파일에서 며칠 더 쓰다 다시 옮겨도 안전하다.
//  ⚠️ 반대로, 새 파일에서 이미 정산을 시작한 뒤에 다시 실행하면
//     그 작업이 사라진다 — 그래서 아래에서 한 번 더 확인받는다.
// ═══════════════════════════════════════════════════════════════
const IMPORT_MARK_PROP = 'IMPORTED_FROM';

function importFromExisting() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();

  const resp = ui.prompt('📥 기존 길드정산 파일에서 가져오기',
    '지금 쓰고 계신 길드정산 스프레드시트의 URL(또는 파일 ID)을 붙여넣어주세요.\n' +
    '※ 같은 구글 계정으로 열 수 있는 파일이어야 합니다.\n' +
    '※ 옛 파일은 읽기만 하고 전혀 바꾸지 않습니다.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const m = String(resp.getResponseText()).match(/[-\w]{25,}/);
  if (!m) { ui.alert('⚠️ 입력한 값에서 파일 ID를 찾지 못했습니다.'); return; }
  const oldId = m[0];
  if (oldId === ss.getId()) { ui.alert('⚠️ 지금 이 파일과 같은 파일입니다.'); return; }

  let old;
  try {
    old = SpreadsheetApp.openById(oldId);
  } catch (e) {
    ui.alert('❌ 파일을 열 수 없습니다: ' + e.message + '\n\n· 파일 ID가 맞는지\n· 이 계정에 열람 권한이 있는지 확인해주세요.');
    return;
  }

  const srcDb = old.getSheetByName('멤버DB');
  const srcBal = old.getSheetByName('잔액현황');
  const srcLedger = old.getSheetByName(LEDGER_SHEET) || old.getSheetByName('누적기록');
  const srcPay = old.getSheetByName(PAYOUT_SHEET);
  const srcLog = old.getSheetByName(AUDIT_SHEET);

  if (!srcDb && !srcBal && !srcLedger) {
    ui.alert('⚠️ 그 파일에서 [멤버DB]/[잔액현황]/[' + LEDGER_SHEET + '] 을 찾지 못했습니다.\n길드정산 파일이 맞는지 확인해주세요.');
    return;
  }
  if (!ss.getSheetByName('멤버DB') || !ss.getSheetByName('잔액현황')) {
    ui.alert('❌ 이 파일에 시트가 아직 없습니다.\n메뉴 [🚀 최초 설치] 를 먼저 실행해주세요.');
    return;
  }

  const rows = function (sheet) { return sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0; };
  let warn = '옛 파일: "' + old.getName() + '"\n\n' +
    '· 멤버DB ' + rows(srcDb) + '명\n' +
    '· 잔액현황 ' + rows(srcBal) + '행\n' +
    '· ' + LEDGER_SHEET + ' ' + rows(srcLedger) + '건\n' +
    '· ' + PAYOUT_SHEET + ' ' + rows(srcPay) + '건\n' +
    '· ' + AUDIT_SHEET + ' ' + rows(srcLog) + '건\n\n' +
    '이 파일의 기존 내용을 지우고 위 내용으로 덮어씁니다.';

  const already = props.getProperty(IMPORT_MARK_PROP);
  if (already) {
    warn += '\n\n🚨 이 파일은 이미 ' + already + ' 에 가져오기를 실행했습니다.\n' +
            '다시 실행하면 그 이후 이 파일에서 한 등록·분배·지급이 모두 사라집니다.';
  }

  if (ui.alert('📥 가져오기 확인', warn + '\n\n계속할까요?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  try {
    const report = _importCore(ss, old, srcDb, srcBal, srcLedger, srcPay, srcLog);
    props.setProperty(IMPORT_MARK_PROP,
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
    _logAction(ss, '데이터가져오기', old.getName(), _getActorEmail(''), report.join(' / '));
    ui.alert('✅ 가져오기 완료\n\n' + report.join('\n') +
      '\n\n다음으로:\n· [🔁 참여횟수 재계산] 으로 출석 수치를 맞춰보세요\n' +
      '· 앱에서 잔액이 옛 파일과 같은지 확인하세요');
  } catch (e) {
    ui.alert('❌ 가져오는 중 오류가 발생했습니다.\n\n' + e.message +
      '\n\n옛 파일은 그대로입니다. 원인을 확인한 뒤 다시 실행해주세요.');
  }
}

// 실제 이관 (UI 없음)
function _importCore(ss, old, srcDb, srcBal, srcLedger, srcPay, srcLog) {
  const report = [];

  // ── ① 멤버DB — 이름이 유일한 진실 원천이므로 가장 먼저 ──
  if (srcDb && srcDb.getLastRow() > 1) {
    const n = Math.min(srcDb.getLastRow() - 1, MAX_MEMBERS);
    const width = Math.max(srcDb.getLastColumn(), 4);
    const vals = srcDb.getRange(2, 1, n, width).getValues();
    const db = ss.getSheetByName('멤버DB');
    db.getRange(2, 2, MAX_MEMBERS, 1).clearContent();   // 이름(B)
    db.getRange(2, 4, MAX_MEMBERS, 1).clearContent();   // 게임표시명(D)

    const names = [];
    const displays = [];
    vals.forEach(function (r) {
      const nm = String(r[1]).trim();
      if (!nm) return;
      names.push([nm]);
      displays.push([width >= 4 ? String(r[3]).trim() : '']);
    });
    if (names.length) {
      db.getRange(2, 2, names.length, 1).setValues(names);
      db.getRange(2, 4, displays.length, 1).setValues(displays);
    }
    report.push('멤버DB ' + names.length + '명');
  }

  // 멤버DB 기준으로 참여자현황·잔액현황 행을 만들어 둔다
  _syncMembers(ss);
  _rebuildInputMembers(ss);

  // ── ② 잔액현황 — 이름별 분배전/분배완료/참여횟수 덮어쓰기 ──
  if (srcBal && srcBal.getLastRow() > 1) {
    const map = _readBalanceMap(srcBal);   // {name: {pending, paid, cnt}}
    const bal = ss.getSheetByName('잔액현황');
    const curVals = bal.getRange(2, 1, Math.max(bal.getLastRow() - 1, 1), 1).getValues();

    const nameToRow = {};
    let totalRow = -1;
    curVals.forEach(function (r, i) {
      const nm = String(r[0]).trim();
      if (nm === '합계') { totalRow = i + 2; return; }
      if (nm) nameToRow[_normName(nm)] = i + 2;
    });

    let applied = 0;
    let carried = 0;
    Object.keys(map).forEach(function (name) {
      const d = map[name];
      const key = _normName(name);
      if (nameToRow[key]) {
        const row = nameToRow[key];
        bal.getRange(row, BAL_COL.PENDING).setValue(d.pending);
        bal.getRange(row, BAL_COL.PAID).setValue(d.paid);
        bal.getRange(row, BAL_COL.CNT).setValue(d.cnt);
        applied++;
      } else if (d.pending || d.paid || d.cnt) {
        // 멤버DB에 없는 옛 이름(탈퇴자 등) — 잔액이 있으면 버리지 않고 보존한다
        const insertAt = totalRow > 0 ? totalRow : bal.getLastRow() + 1;
        if (totalRow > 0) bal.insertRowBefore(totalRow);
        _writeBalanceRow(bal, insertAt, name, d.pending, d.paid, d.cnt, true);
        if (totalRow > 0) totalRow++;
        carried++;
      }
    });
    _rewriteBalanceTotal(bal);
    report.push('잔액 ' + applied + '명' + (carried ? ' (+미등록 ' + carried + '명 보존)' : ''));
  }

  // ── ③ 아이템 파이프라인 ──
  if (srcLedger && srcLedger.getLastRow() > 1) {
    const ledger = ss.getSheetByName(LEDGER_SHEET);
    if (ledger.getLastRow() > 1) ledger.deleteRows(2, ledger.getLastRow() - 1);

    const n = srcLedger.getLastRow() - 1;
    const width = Math.max(srcLedger.getLastColumn(), 7);
    const vals = srcLedger.getRange(2, 1, n, width).getValues();
    const fmls = srcLedger.getRange(2, 1, n, width).getFormulas();
    const isNew = String(srcLedger.getRange(1, 3).getValue()).indexOf('상태') >= 0;
    const pad14 = function (arr) { const a = arr.slice(0, 14); while (a.length < 14) a.push(''); return a; };

    const out = [];
    const photos = [];
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      if (isNew) {
        out.push(pad14(v));
        photos.push(fmls[i][LG.PHOTO - 1] || '');
      } else {
        // 아주 옛 스키마: [날짜, 아이템, 총액, 인원, 1인당, 명단, 인증샷, (혈비)]
        out.push(pad14([v[0], v[1], ST_DONE, v[3], v[5], '', '', v[2], (v[7] !== undefined ? v[7] : ''), v[4], v[0]]));
        photos.push(fmls[i][6] || '');
      }
    }
    ledger.getRange(2, 1, n, 14).setValues(out);
    for (let i = 0; i < n; i++) {
      if (photos[i]) ledger.getRange(2 + i, LG.PHOTO).setFormula(photos[i]);
      ledger.getRange(2 + i, LG.CHECK).insertCheckboxes();
    }
    ledger.getRange(2, LG.DATE, n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    ledger.getRange(2, LG.DIST, n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    [LG.AMOUNT, LG.FUND, LG.PER].forEach(function (col) {
      ledger.getRange(2, col, n, 1).setNumberFormat('#,##0');
    });
    ledger.getRange(2, LG.STATUS, n, 1).setHorizontalAlignment('center');
    report.push(LEDGER_SHEET + ' ' + n + '건');
  }

  // ── ④ 지급기록 · ⑤ 작업기록 — 있는 그대로 옮긴다 ──
  [[srcPay, PAYOUT_SHEET], [srcLog, AUDIT_SHEET]].forEach(function (pair) {
    const from = pair[0];
    const name = pair[1];
    if (!from || from.getLastRow() < 2) return;
    const to = ss.getSheetByName(name) || (name === AUDIT_SHEET ? _getOrCreateAuditLog(ss) : null);
    if (!to) return;
    if (to.getLastRow() > 1) to.deleteRows(2, to.getLastRow() - 1);
    const n = from.getLastRow() - 1;
    const width = Math.min(Math.max(from.getLastColumn(), 1), to.getMaxColumns());
    to.getRange(2, 1, n, width).setValues(from.getRange(2, 1, n, width).getValues());
    to.getRange(2, 1, n, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    report.push(name + ' ' + n + '건');
  });

  _applyProtections(ss);
  _applyMemberNameFormatting(ss);
  return report;
}

// ═══════════════════════════════════════════════════════════════
//  🌐 외부 웹앱 연동 JSON API (v8.0)
//
//  화면(PWA)은 Vercel에, 데이터는 이 스크립트가 담당하는 구조.
//  Vercel 서버 → doPost(JSON) → 기존 api_* 코어 → 구글시트
//
//  [배포 방법 — 최초 1회]
//   ① [배포] → [새 배포] → 유형 '웹 앱'
//   ② 실행: 나(me) / 액세스: 모든 사용자(Anyone)   ← 반드시 이 조합
//      · '나만'으로 두면 Vercel 서버에는 구글 로그인 세션이 없어 호출 불가
//      · 대신 아래 토큰을 모르는 요청은 전부 거부되므로 URL만으로는 못 씀
//   ③ [🔑 웹 API 토큰] 메뉴로 토큰을 발급받아 Vercel 환경변수에 등록
//   ※ 코드 수정 후에는 [배포 관리] → 기존 배포 편집 → 새 버전
//     (새 배포로 만들면 URL이 바뀌므로 Vercel 환경변수도 함께 갱신할 것)
// ═══════════════════════════════════════════════════════════════
const API_TOKEN_PROP = 'API_TOKEN';
// 쓰기(잔액·원장을 바꾸는) 액션 — LockService로 직렬화한다
const API_WRITE_ACTIONS = ['register', 'distribute', 'payout', 'rename'];

// 🔑 토큰 발급·확인·재발급 (메뉴)
function manageApiToken() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const cur = props.getProperty(API_TOKEN_PROP);
  if (cur) {
    const r = ui.alert('🔑 웹 API 토큰',
      '현재 토큰:\n\n' + cur + '\n\n' +
      '이 값을 Vercel 환경변수 GAS_TOKEN 에 넣으세요.\n\n' +
      '새로 발급받으시겠습니까?\n' +
      '(재발급하면 기존 토큰은 즉시 무효가 되어, Vercel 환경변수도 함께 바꿔야 앱이 다시 동작합니다)',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  const token = _genApiToken();
  props.setProperty(API_TOKEN_PROP, token);
  ui.alert('🔑 토큰 발급 완료',
    token + '\n\n' +
    '[다음 단계]\n' +
    '1) Vercel 프로젝트 → Settings → Environment Variables\n' +
    '2) GAS_TOKEN 에 위 값을 붙여넣기\n' +
    '3) GAS_URL 에는 이 스크립트의 /exec 주소를 넣기\n' +
    '4) 저장 후 Redeploy',
    ui.ButtonSet.OK);
}

function _genApiToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  const bytes = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < 48; i++) {
    s += chars.charAt((bytes.charCodeAt(i % bytes.length) + i * 7 + Math.floor(Math.random() * 56)) % chars.length);
  }
  return s;
}

// 길이·내용 노출을 줄이기 위한 상수시간 비교
function _tokenEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

function _jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 🌐 API 진입점
function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return _jsonOut({ ok: false, msg: '요청 형식이 올바르지 않습니다(JSON 아님).' });
  }

  const expected = PropertiesService.getScriptProperties().getProperty(API_TOKEN_PROP);
  if (!expected) {
    return _jsonOut({ ok: false, msg: 'API 토큰이 아직 발급되지 않았습니다. 스프레드시트 메뉴 [🎮 길드정산] → [🔑 웹 API 토큰]을 한 번 실행해주세요.' });
  }
  if (!_tokenEq(String(req.token || ''), expected)) {
    return _jsonOut({ ok: false, msg: '인증에 실패했습니다.' });
  }

  const action = String(req.action || '');
  const needsLock = API_WRITE_ACTIONS.indexOf(action) >= 0;
  let lock = null;
  if (needsLock) {
    lock = LockService.getScriptLock();
    // 다른 사람이 처리 중이면 최대 25초 대기 — 동시 클릭으로 잔액이 꼬이는 것을 방지
    try {
      lock.waitLock(25000);
    } catch (err) {
      return _jsonOut({ ok: false, msg: '다른 작업이 처리 중입니다. 잠시 후 다시 시도해주세요.' });
    }
  }

  try {
    return _jsonOut(_apiRoute(action, req));
  } catch (err) {
    return _jsonOut({ ok: false, msg: '서버 오류: ' + (err && err.message ? err.message : err) });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (err) {} }
  }
}

// 액션 라우터 — 전부 기존 api_* 코어를 그대로 호출한다 (산식 중복 구현 금지)
function _apiRoute(action, req) {
  switch (action) {
    case 'ping':
      return { ok: true, version: VERSION, unit: UNIT };

    case 'state':
      return { ok: true, data: api_getState() };

    case 'members':
      return { ok: true, data: api_getMemberNames() };

    case 'lookup':
      return api_lookupBalance(req.name);

    case 'register':
      return api_register(req.itemName, req.participants, req.photoLink, req.email);

    case 'distribute':
      return api_distribute(req.row, req.amount, req.email);

    case 'payout':
      return api_payout(req.name, req.amount, req.email);

    case 'photo':
      return api_analyzePhoto(req.base64);

    case 'roster':
      return { ok: true, data: api_getRoster() };

    case 'rename':
      return api_renameMember(req.oldName, req.newName, req.email, req.confirmMerge === true);

    // ⚠️ correctDistribution / deleteLedgerItem 은 의도적으로 노출하지 않는다.
    //    (되돌리기·완전삭제는 제작자 전용 PC 메뉴 유지 — 아키텍처 함정 #17)
    default:
      return { ok: false, msg: '알 수 없는 요청입니다: ' + action };
  }
}

// ═══════════════════════════════════════════════════════════════
//  📱 모바일 웹앱 (v4.0)
//  배포: [배포] → [새 배포] → 유형 '웹 앱' → 실행 '나' → 액세스 '나만'
//  → 생성된 URL을 폰 브라우저에서 열고 홈 화면에 추가
// ═══════════════════════════════════════════════════════════════
function doGet(e) {
  const view = (e && e.parameter && e.parameter.view) || '';
  if (view === 'lookup') {
    return HtmlService.createHtmlOutput(_lookupHtml())
      .setTitle('내 다이아 조회')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=yes');
  }
  return HtmlService.createHtmlOutput(_mobileHtml())
    .setTitle('길드정산')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=yes');
}

// 조회 전용 링크에 사용할 멤버 이름 목록 (혈비 계정 제외)
function api_getMemberNames() {
  return _getMembers(SpreadsheetApp.getActiveSpreadsheet()).filter(m => m !== FUND_NAME);
}

// 개인 잔액 조회 (본인 이름만, 다른 사람 정보 없이 딱 필요한 것만 반환)
function api_lookupBalance(name) {
  name = String(name || '').trim();
  if (!name) return { ok: false, msg: '이름을 선택해주세요.' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bal = ss.getSheetByName('잔액현황');
  if (!bal || bal.getLastRow() < 2) return { ok: false, msg: '잔액현황 시트를 찾을 수 없습니다.' };
  const vals = bal.getRange(2, 1, bal.getLastRow() - 1, 4).getValues();
  let found = null;
  vals.forEach(r => {
    if (_normName(r[0]) === _normName(name)) {
      found = {
        name: String(r[0]).trim(),
        pending: Number(String(r[1]).replace(/,/g, '')) || 0,
        paid: Number(String(r[2]).replace(/,/g, '')) || 0,
        cnt: Number(r[3]) || 0
      };
    }
  });
  if (!found) return { ok: false, msg: '멤버DB에서 찾지 못했습니다. 이름을 다시 확인해주세요.' };
  return { ok: true, unit: UNIT, season: Number(PropertiesService.getDocumentProperties().getProperty('SEASON_NUM')) || 1, data: found };
}

// 상태 조회 API
function api_getState() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bal = ss.getSheetByName('잔액현황');
  const rows = [];
  if (bal && bal.getLastRow() > 1) {
    bal.getRange(2, 1, bal.getLastRow() - 1, 4).getValues().forEach(r => {
      const nm = String(r[0]).trim();
      if (!nm || nm === '합계') return;
      rows.push({
        name: nm,
        pending: Number(String(r[1]).replace(/,/g, '')) || 0,
        paid: Number(String(r[2]).replace(/,/g, '')) || 0,
        cnt: Number(r[3]) || 0
      });
    });
  }
  // 미분배 아이템 목록
  const ledger = ss.getSheetByName(LEDGER_SHEET);
  const items = [];
  if (ledger && ledger.getLastRow() > 1) {
    const n = ledger.getLastRow() - 1;
    const vals = ledger.getRange(2, 1, n, 5).getValues();
    vals.forEach((r, i) => {
      if (String(r[LG.STATUS - 1]).trim() === ST_WAIT) {
        items.push({
          row: i + 2,
          item: String(r[LG.ITEM - 1]),
          date: Utilities.formatDate(new Date(r[LG.DATE - 1]), Session.getScriptTimeZone(), 'MM/dd'),
          cnt: Number(r[LG.CNT - 1]) || 0
        });
      }
    });
  }
  const season = Number(PropertiesService.getDocumentProperties().getProperty('SEASON_NUM')) || 1;
  return {
    rows: rows,
    items: items,
    members: _getMembers(ss),
    fundName: FUND_NAME,
    remainderName: REMAINDER_NAME,
    fundRate: FUND_RATE,
    unit: UNIT,
    season: season
  };
}

// 아이템 등록 API
function api_register(itemName, participants, photoLink, email) {
  itemName = String(itemName || '').trim();
  participants = (participants || []).map(p => String(p).trim()).filter(p => p && p !== FUND_NAME);
  if (!itemName) return { ok: false, msg: '아이템명을 입력해주세요.' };
  if (participants.length === 0) return { ok: false, msg: '참여 멤버를 선택해주세요.' };
  try {
    _registerCore(SpreadsheetApp.getActiveSpreadsheet(), itemName, participants, String(photoLink || '').trim(), email);
    return { ok: true, msg: '✅ "' + itemName + '" 등록 완료 (' + participants.length + '명, ' + ST_WAIT + ')' };
  } catch (e) {
    return { ok: false, msg: '오류: ' + e.message };
  }
}

// ─────────────────────────────────────────
// 📷 인증샷 분석 API: 업로드 → 드라이브 저장(공유 링크) → OCR → 멤버 매칭
//   ※ Advanced Drive Service("Drive API") 활성화 필요
//     Apps Script 좌측 [서비스] → [+] → "Drive API" 추가 (최초 1회)
// ─────────────────────────────────────────
function api_analyzePhoto(base64) {
  if (!base64) return { ok: false, msg: '이미지 데이터가 없습니다.' };
  let imgFile;
  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg',
      'proof_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.jpg');
    const folder = _getOrCreateProofFolder();
    imgFile = folder.createFile(blob);
    imgFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const photoUrl = imgFile.getUrl();

    // OCR (실패해도 사진 저장은 이미 완료된 상태 — 참여자 없이 링크만 반환)
    let ocrText = '';
    try {
      ocrText = _ocrImage(blob);
    } catch (ocrErr) {
      const emsg = String(ocrErr.message || '');
      const hint = emsg.indexOf('Drive is not defined') >= 0
        ? ' (Apps Script [서비스]에서 "Drive API"를 추가해주세요)'
        : emsg.indexOf('not a function') >= 0
        ? ' (Drive API 버전 호환성 문제로 추정 — 코드가 최신 버전인지 확인해주세요)'
        : ' (' + emsg + ')';
      return { ok: true, photoUrl: photoUrl, matched: [],
        msg: '📷 사진은 저장했지만 자동 인식은 실패했습니다' + hint + '. 참여자를 직접 선택해주세요.' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const members = _getMembers(ss).filter(m => m !== FUND_NAME);
    const displayMap = _getDisplayNameMap(ss);
    const normText = _toSimplified(ocrText.replace(/\s+/g, '').toLowerCase());
    const matched = members.filter(m => {
      const keys = _ocrSearchKeys(m, displayMap[m]);
      return keys.some(key => key.length >= 2 && _fuzzyContains(normText, _toSimplified(key.toLowerCase())));
    });

    const msg = matched.length > 0
      ? `📷 ${matched.length}명 자동 감지됨 — 등록 전에 꼭 확인해주세요.`
      : '📷 사진은 저장했지만 자동으로 인식된 참여자가 없습니다. 직접 선택해주세요.\n(멤버DB "게임표시명" 열에 실제 게임 표시 이름을 등록하면 인식률이 올라갑니다)';
    return { ok: true, photoUrl: photoUrl, matched: matched, msg: msg, ocrPreview: ocrText.slice(0, 800) };
  } catch (e) {
    return { ok: false, msg: '분석 실패: ' + e.message };
  }
}

// OCR 실행 (Advanced Drive Service) — 임시 변환 문서는 즉시 삭제
// OCR 매칭에 사용할 후보 문자열 목록: 코어이름, 괄호 안 표기, 게임표시명(있으면)
// 번체 한자를 간체로 정규화 (서체 변환 전용 — 다른 뜻 글자는 절대 바꾸지 않음)
// 완전일치 우선 → 실패 시 3글자 이상 키에 한해 편집거리(치환) 1까지 허용
// (2글자 이하는 서로 다른 실제 이름끼리 편집거리 1인 경우가 있어 절대 제외 — 오귀속 방지)
function _fuzzyContains(text, key) {
  if (text.indexOf(key) >= 0) return true;
  const kl = key.length;
  if (kl < 3) return false;
  for (let i = 0; i + kl <= text.length; i++) {
    let diff = 0;
    for (let j = 0; j < kl; j++) {
      if (text.charAt(i + j) !== key.charAt(j)) { diff++; if (diff > 1) break; }
    }
    if (diff <= 1) return true;
  }
  return false;
}

function _toSimplified(s) {
  return String(s).split('').map(ch => T2S_MAP[ch] || ch).join('');
}

function _ocrSearchKeys(member, displayName) {
  const keys = [];
  const core = String(member).match(/^([^(]+)/);
  if (core) keys.push(core[1].trim().replace(/\s+/g, ''));
  const paren = String(member).match(/\(([^)]+)\)/);
  if (paren) keys.push(paren[1].trim().replace(/\s+/g, ''));
  if (displayName) keys.push(String(displayName).trim().replace(/\s+/g, ''));
  return keys.filter(Boolean);
}

function _ocrImage(blob) {
  const ts = 'ocr_temp_' + new Date().getTime();
  let ocrFile;

  if (typeof Drive.Files.create === 'function') {
    // Drive API v3 (현재 신규 설치 시 기본값): insert→create, title→name,
    // ocr 불리언 대신 대상 mimeType 지정 + ocrLanguage 파라미터로 변환·인식
    const resource = { name: ts, mimeType: MimeType.GOOGLE_DOCS };
    ocrFile = Drive.Files.create(resource, blob, { ocrLanguage: 'ko' });
  } else if (typeof Drive.Files.insert === 'function') {
    // Drive API v2 (구버전 설치본 호환)
    const resource = { title: ts, mimeType: MimeType.GOOGLE_DOCS };
    ocrFile = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'ko' });
  } else {
    throw new Error('Drive API 서비스에서 사용 가능한 업로드 함수를 찾지 못했습니다.');
  }

  try {
    const doc = DocumentApp.openById(ocrFile.id);
    return doc.getBody().getText();
  } finally {
    try { Drive.Files.remove(ocrFile.id); } catch (e) { /* 정리 실패는 무시 (임시 문서 하나 남는 정도, 무해) */ }
  }
}

// 인증샷 보관 폴더 확보 (실행 계정 드라이브 기준)
function _getOrCreateProofFolder() {
  const name = '길드정산_인증샷';
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

// 분배 실행 API (행 번호 + 판매금액)
function api_distribute(row, amount, email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledger = ss.getSheetByName(LEDGER_SHEET);
  if (!ledger) return { ok: false, msg: LEDGER_SHEET + ' 시트를 찾을 수 없습니다.' };
  const r = _distributeCore(ss, ledger, Number(row), amount, email);
  if (!r.ok) {
    if (r.reason === 'done') return { ok: false, msg: '이미 분배된 아이템입니다. 새로고침해주세요.' };
    if (r.reason === 'invalid') return { ok: false, msg: '⚠️ 판매금액은 양의 정수여야 합니다.' };
    return { ok: false, msg: '분배할 수 없는 행입니다.' };
  }
  let msg = '✅ "' + r.item + '" ' + r.amount.toLocaleString() + UNIT + ' 분배 완료 — 혈비 ' +
            r.fund.toLocaleString() + ' / ' + r.n + '명 × ' + r.perPerson.toLocaleString();
  if (r.remainder > 0) msg += ' / 나머지 ' + r.remainder + UNIT + ' → ' + r.remainderTo;
  if (r.missing.length > 0) msg += ' (⚠️ 미발견: ' + r.missing.join(', ') + ')';
  return { ok: true, msg: msg };
}

// 지급 처리 API (이름 + 지급액 — amount 미지정 시 전액)
function api_payout(name, amount, email) {
  name = String(name || '').trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bal = ss.getSheetByName('잔액현황');
  if (!bal) return { ok: false, msg: '잔액현황 시트를 찾을 수 없습니다.' };
  const vals = bal.getRange(2, 1, Math.max(bal.getLastRow() - 1, 1), 1).getValues();
  let row = -1;
  vals.forEach((r, i) => { if (_normName(r[0]) === _normName(name)) row = i + 2; });
  if (row < 0) return { ok: false, msg: '"' + name + '"을 찾지 못했습니다.' };
  const r = _payoutCore(ss, bal, row, (amount === undefined || amount === null || amount === '') ? null : amount, email);
  if (r.skip) return { ok: false, msg: '처리할 수 없는 행입니다.' };
  if (!r.ok) {
    if (r.reason === 'over') return { ok: false, msg: '⚠️ 지급액이 분배전(' + r.pending.toLocaleString() + UNIT + ')보다 큽니다.' };
    if (r.reason === 'invalid') return { ok: false, msg: '⚠️ 지급액은 양의 정수여야 합니다.' };
    return { ok: false, msg: '"' + name + '" 분배전 금액이 0입니다.' };
  }
  let msg = '✅ "' + name + '" ' + r.moved.toLocaleString() + UNIT + ' 지급 완료';
  if (r.partial) msg += ' (잔여 분배전 ' + r.remain.toLocaleString() + UNIT + ')';
  return { ok: true, msg: msg };
}

// 모바일 HTML (외부 의존성 없음, 핀치줌 허용)
// 개인 잔액 조회 전용 경량 페이지 (일반 길드원용 — 등록/분배 등 관리 기능 없음)
function _lookupHtml() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{font-family:-apple-system,"Noto Sans KR",sans-serif;background:#f4f6f8;color:#222;padding:20px 16px;min-height:100vh}' +
'.card{background:#fff;border-radius:14px;padding:22px 18px;box-shadow:0 1px 6px rgba(0,0,0,.1);max-width:420px;margin:0 auto}' +
'h1{font-size:18px;color:#1A237E;text-align:center;margin-bottom:4px}' +
'.sub{text-align:center;font-size:12px;color:#888;margin-bottom:18px}' +
'select,button{width:100%;padding:14px;font-size:16px;border-radius:10px;margin-bottom:10px}' +
'select{border:1.5px solid #d0d5da}' +
'button{border:none;background:#1A237E;color:#fff;font-weight:700;cursor:pointer}' +
'.res{display:none;margin-top:18px;text-align:center}' +
'.resName{font-size:17px;font-weight:700;margin-bottom:14px}' +
'.resGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
'.resBox{background:#F1F8FF;border-radius:10px;padding:14px 8px}' +
'.resBox.paid{background:#E8F5E9}' +
'.resNum{font-size:20px;font-weight:800;color:#1565C0}' +
'.resBox.paid .resNum{color:#2E7D32}' +
'.resLabel{font-size:11px;color:#666;margin-top:3px}' +
'.resCnt{margin-top:12px;font-size:13px;color:#555}' +
'.err{color:#C62828;text-align:center;font-size:13px;margin-top:10px;display:none}' +
'</style></head><body>' +
'<div class="card">' +
'<h1>💎 내 다이아 조회</h1>' +
'<div class="sub" id="season"></div>' +
'<select id="nameSel"><option value="">이름을 선택하세요</option></select>' +
'<button onclick="lookup()">조회</button>' +
'<div class="err" id="err"></div>' +
'<div class="res" id="res">' +
'<div class="resName" id="resName"></div>' +
'<div class="resGrid">' +
'<div class="resBox"><div class="resNum" id="resPending">-</div><div class="resLabel">분배전(대기중)</div></div>' +
'<div class="resBox paid"><div class="resNum" id="resPaid">-</div><div class="resLabel">분배완료(지급됨)</div></div>' +
'</div>' +
'<div class="resCnt" id="resCnt"></div>' +
'</div>' +
'</div>' +
'<script>' +
'function $(id){return document.getElementById(id)}' +
'function fmt(n){return (n||0).toLocaleString()}' +
'google.script.run.withSuccessHandler(function(names){' +
'var sel=$("nameSel");' +
'names.forEach(function(n){var o=document.createElement("option");o.value=n;o.textContent=n;sel.appendChild(o)});' +
'}).api_getMemberNames();' +
'function lookup(){' +
'var name=$("nameSel").value;' +
'$("err").style.display="none";$("res").style.display="none";' +
'if(!name){$("err").textContent="이름을 선택해주세요.";$("err").style.display="block";return}' +
'google.script.run.withSuccessHandler(function(r){' +
'if(!r.ok){$("err").textContent=r.msg;$("err").style.display="block";return}' +
'$("season").textContent="시즌 "+r.season;' +
'$("resName").textContent=r.data.name;' +
'$("resPending").textContent=fmt(r.data.pending)+" "+r.unit;' +
'$("resPaid").textContent=fmt(r.data.paid)+" "+r.unit;' +
'$("resCnt").textContent="참여횟수: "+r.data.cnt+"회";' +
'$("res").style.display="block";' +
'}).withFailureHandler(function(e){$("err").textContent="오류: "+e.message;$("err").style.display="block"}).api_lookupBalance(name)}' +
'</scr'+'ipt></body></html>';
}

function _mobileHtml() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}' +
'body{font-family:-apple-system,"Noto Sans KR",sans-serif;background:#f4f6f8;color:#222;padding-bottom:70px}' +
'.hd{background:#1A237E;color:#fff;padding:14px 16px;font-size:17px;font-weight:700;position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center}' +
'.hd small{font-weight:400;opacity:.85;font-size:12px}' +
'.tabs{display:flex;background:#fff;border-bottom:1px solid #e0e0e0;position:sticky;top:48px;z-index:5}' +
'.tab{flex:1;text-align:center;padding:13px 0;font-size:15px;font-weight:600;color:#888;border-bottom:3px solid transparent}' +
'.tab.on{color:#1A237E;border-color:#1A237E}' +
'.pg{display:none;padding:12px}' +
'.pg.on{display:block}' +
'.card{background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
'.sect{font-size:13px;font-weight:700;color:#555;margin:2px 2px 8px}' +
'.row{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border-bottom:1px solid #f0f0f0}' +
'.row:last-child{border-bottom:none}' +
'.nm{font-size:15px;font-weight:600}' +
'.nm .cnt{font-size:11px;color:#999;font-weight:400;margin-left:5px}' +
'.amt{text-align:right;margin-right:10px}' +
'.pend{font-size:15px;font-weight:700;color:#E65100}' +
'.pend.zero{color:#bbb;font-weight:400}' +
'.paid{font-size:11px;color:#2E7D32}' +
'.btn{border:none;border-radius:8px;font-size:13px;font-weight:700;padding:9px 14px;color:#fff;background:#1A237E}' +
'.btn:disabled{background:#ccc}' +
'.btn.big{width:100%;padding:15px;font-size:16px;border-radius:10px;margin-top:10px}' +
'.btn.dist{background:#E65100}' +
'input[type=text],input[type=number],input[type=url]{width:100%;padding:13px;font-size:16px;border:1.5px solid #d0d5da;border-radius:8px;margin:5px 0 12px}' +
'label.fl{font-size:13px;font-weight:700;color:#555}' +
'.mgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}' +
'.mchip{display:flex;align-items:center;gap:7px;background:#fafafa;border:1.5px solid #e0e0e0;border-radius:8px;padding:10px;font-size:14px}' +
'.mchip.sel{background:#E8F5E9;border-color:#4CAF50;font-weight:700}' +
'.mchip input{width:18px;height:18px}' +
'.selbar{display:flex;gap:8px;margin-top:10px}' +
'.selbar .btn{flex:1;background:#546E7A}' +
'.empty{color:#999;font-size:14px;padding:8px 4px}' +
'.photoPrev{display:none;margin:4px 0 12px}' +
'.photoPrev img{max-width:100%;border-radius:8px;display:block}' +
'.photoStatus{font-size:12px;color:#666;margin-top:5px}' +
'.fileBtn{display:block;width:100%;padding:12px;text-align:center;background:#F1F8FF;border:1.5px dashed #90A4AE;border-radius:8px;font-size:14px;color:#455A64;font-weight:600;margin:5px 0 4px;cursor:pointer}' +
'.warnNote{background:#FFF3E0;color:#E65100;font-size:12px;font-weight:600;padding:9px 11px;border-radius:8px;margin-top:10px;text-align:center}' +
'#toast{position:fixed;bottom:16px;left:12px;right:12px;background:#323232;color:#fff;padding:13px 16px;border-radius:10px;font-size:14px;display:none;z-index:99}' +
'#load{position:fixed;inset:0;background:rgba(255,255,255,.75);display:none;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#1A237E;z-index:98}' +
'.totline{font-size:13px;color:#555;padding:4px 4px 10px}' +
'.dashBar{display:flex;gap:8px;padding:10px 12px;background:#EDE7F6;border-bottom:1px solid #D1C4E9}' +
'.dashItem{flex:1;text-align:center;background:#fff;border-radius:8px;padding:8px 4px}' +
'.dashNum{font-size:19px;font-weight:800;color:#4527A0}' +
'.dashLabel{font-size:11px;color:#666;margin-top:2px}' +
'</style></head><body>' +
'<div class="hd"><span>🎮 길드정산</span><small><a href="#" onclick="changeMyEmail();return false;" style="color:#fff;opacity:.8;text-decoration:underline;margin-right:8px">📧</a><span id="season"></span></small></div>' +
'<div class="tabs"><div class="tab on" id="t0" onclick="tab(0)">💰 잔액·지급</div><div class="tab" id="t1" onclick="tab(1)">📦 아이템</div></div>' +
'<div class="dashBar">' +
'<div class="dashItem"><div class="dashNum" id="dashPending">-</div><div class="dashLabel">⏳ 미분배 아이템</div></div>' +
'<div class="dashItem"><div class="dashNum" id="dashOwed">-</div><div class="dashLabel">💰 잔액 남은 인원</div></div>' +
'</div>' +

'<div class="pg on" id="p0">' +
'<div class="totline" id="tot"></div>' +
'<div class="card" id="ballist">불러오는 중...</div>' +
'</div>' +

'<div class="pg" id="p1">' +
'<div class="sect">⏳ 미분배 아이템 — [분배] 누르고 판매금액 입력</div>' +
'<div class="card" id="itemlist">불러오는 중...</div>' +
'<div class="sect">📝 새 아이템 등록 (레이드 직후)</div>' +
'<div class="card">' +
'<label class="fl">📦 아이템명</label><input type="text" id="fItem" placeholder="예: 기란 세금">' +
'<label class="fl">📷 인증샷 첨부 (사진에서 참여자 자동 감지)</label>' +
'<label class="fileBtn" for="fPhotoFile">📎 사진 선택 / 촬영</label>' +
'<input type="file" id="fPhotoFile" accept="image/*" style="display:none">' +
'<div class="photoPrev" id="photoPrev"><img id="photoImg"><div class="photoStatus" id="photoStatus"></div>' +
'<div id="ocrToggle" style="display:none"><a href="#" onclick="toggleOcr();return false;" style="font-size:12px;color:#1565C0">🔍 인식된 텍스트 보기</a>' +
'<div id="ocrText" style="display:none;background:#F5F5F5;border-radius:6px;padding:8px;margin-top:5px;font-size:11px;color:#555;white-space:pre-wrap;max-height:150px;overflow:auto"></div></div></div>' +
'<label class="fl">🔗 인증샷 링크 (사진 첨부 시 자동 입력, 직접 붙여넣기도 가능)</label>' +
'<input type="url" id="fPhoto" placeholder="https://...">' +
'<div class="selbar"><button class="btn" onclick="selAll(true)">전체 선택</button><button class="btn" onclick="selAll(false)">전체 해제</button></div>' +
'<div class="mgrid" id="mgrid"></div>' +
'<div class="warnNote">⚠️ 등록 전 체크된 참여자가 맞는지 꼭 확인해주세요 (자동 감지는 참고용입니다)</div>' +
'<button class="btn big" id="goBtn" onclick="registerItem()">📝 아이템 등록</button>' +
'</div></div>' +

'<div id="toast"></div><div id="load">처리 중...</div>' +
'<script>' +
'var S=null;' +
'function $(id){return document.getElementById(id)}' +
'function tab(i){for(var k=0;k<2;k++){$("t"+k).className="tab"+(k==i?" on":"");$("p"+k).className="pg"+(k==i?" on":"")}}' +
'function toast(m){var t=$("toast");t.textContent=m;t.style.display="block";setTimeout(function(){t.style.display="none"},4000)}' +
'function load(on){$("load").style.display=on?"flex":"none"}' +
'function fmt(n){return (n||0).toLocaleString()}' +
'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;").replace(/\x27/g,"&#39;")}' +
'function getMyEmail(){' +
'var e=localStorage.getItem("gm_email");' +
'if(e)return e;' +
'e=prompt("기록용 이메일 주소를 입력해주세요.\\n(누가 등록·분배했는지 기록에 남기기 위함 \u2014 한 번만 물어봅니다)");' +
'if(!e)return "";' +
'e=e.trim();' +
'if(e)localStorage.setItem("gm_email",e);' +
'return e}' +
'function changeMyEmail(){' +
'var e=prompt("이메일 주소를 변경합니다.",localStorage.getItem("gm_email")||"");' +
'if(e===null)return;' +
'e=e.trim();' +
'if(e){localStorage.setItem("gm_email",e);toast("이메일이 저장되었습니다: "+e)}' +
'else{localStorage.removeItem("gm_email");toast("이메일이 삭제되었습니다.")}}' +
'function refresh(){load(true);google.script.run.withSuccessHandler(render).withFailureHandler(function(e){load(false);toast("연결 오류: "+e.message)}).api_getState()}' +
'function render(st){S=st;load(false);' +
'$("season").textContent="시즌 "+st.season;' +
'var tp=0,td=0,owed=0,h="";' +
'st.rows.forEach(function(r){tp+=r.pending;td+=r.paid;if(r.pending>0)owed++;' +
'h+="<div class=row><div class=nm>"+esc(r.name)+"<span class=cnt>"+r.cnt+"회</span></div>"+' +
'"<div style=\'display:flex;align-items:center\'><div class=amt><div class=\'pend"+(r.pending>0?"":" zero")+"\'>"+fmt(r.pending)+" "+S.unit+"</div><div class=paid>완료 "+fmt(r.paid)+"</div></div>"+' +
'"<button class=btn "+(r.pending>0?"":"disabled")+" data-n=\'"+esc(r.name)+"\'>지급</button></div></div>"});' +
'$("ballist").innerHTML=h||"멤버가 없습니다";' +
'$("tot").textContent="분배전 합계 "+fmt(tp)+" "+S.unit+" · 분배완료 합계 "+fmt(td)+" "+S.unit;' +
'$("dashPending").textContent=st.items.length;' +
'$("dashOwed").textContent=owed;' +
'var ih="";st.items.forEach(function(it){' +
'ih+="<div class=row><div class=nm>"+esc(it.item)+"<span class=cnt>"+it.date+" · "+it.cnt+"명</span></div>"+' +
'"<button class=\'btn dist\' data-r=\'"+it.row+"\'>분배</button></div>"});' +
'$("itemlist").innerHTML=ih||"<div class=empty>미분배 아이템이 없습니다. 아래에서 등록하세요.</div>";' +
'var g="";st.members.forEach(function(m){if(m===st.fundName)return;' +
'g+="<label class=mchip><input type=checkbox data-n=\'"+esc(m)+"\' onchange=\'chip(this)\'>"+esc(m)+"</label>"});' +
'$("mgrid").innerHTML=g}' +
'function chip(cb){cb.parentNode.className="mchip"+(cb.checked?" sel":"")}' +
'function selAll(v){document.querySelectorAll("#mgrid input").forEach(function(cb){cb.checked=v;cb.parentNode.className="mchip"+(v?" sel":"")})}' +
'function picked(){var a=[];document.querySelectorAll("#mgrid input:checked").forEach(function(cb){a.push(cb.getAttribute("data-n"))});return a}' +
'function pay(name){var r=S.rows.find(function(x){return x.name===name});if(!r||r.pending<=0)return;' +
'var v=prompt(name+" 지급할 금액을 입력하세요.\\n(분배전 전액: "+fmt(r.pending)+" "+S.unit+" — 그대로 확인하면 전액 지급)",r.pending);' +
'if(v===null)return;var amt=Number(String(v).replace(/,/g,""));' +
'if(!amt||amt<=0||amt!==Math.floor(amt)){toast("지급액은 양의 정수여야 합니다.");return}' +
'if(amt>r.pending){toast("지급액이 분배전("+fmt(r.pending)+" "+S.unit+")보다 큽니다.");return}' +
'if(!confirm(name+" 에게 "+fmt(amt)+" "+S.unit+" 지급 처리할까요?"+(amt<r.pending?"\\n(부분 지급 — 잔여 "+fmt(r.pending-amt)+" "+S.unit+"는 분배전에 유지)":"\\n(전액 지급)")))return;' +
'load(true);google.script.run.withSuccessHandler(function(res){toast(res.msg);refresh()}).withFailureHandler(function(e){load(false);toast("오류: "+e.message)}).api_payout(name,amt,getMyEmail())}' +
'function distribute(row){var it=S.items.find(function(x){return x.row==row});if(!it)return;' +
'var v=prompt(it.item+" — 판매금액("+S.unit+")을 입력하세요.\\n참여 "+it.cnt+"명 · 혈비 "+Math.round(S.fundRate*100)+"% 공제 후 1/N 분배","");' +
'if(v===null)return;var amt=Number(String(v).replace(/,/g,""));' +
'if(!amt||amt<=0||amt!==Math.floor(amt)){toast("판매금액은 양의 정수여야 합니다.");return}' +
'var fund=Math.floor(amt*S.fundRate),per=Math.floor((amt-fund)/it.cnt);' +
'var rem=(amt-fund)-per*it.cnt;' +
'if(!confirm("📦 "+it.item+"\\n💎 판매 "+fmt(amt)+" "+S.unit+"\\n🏦 혈비 "+fmt(fund)+"\\n👥 "+it.cnt+"명 × "+fmt(per)+(rem>0?"\\n➕ 나머지 "+rem+" → "+S.remainderName:"")+"\\n\\n분배할까요?"))return;' +
'load(true);google.script.run.withSuccessHandler(function(res){toast(res.msg);refresh()}).withFailureHandler(function(e){load(false);toast("오류: "+e.message)}).api_distribute(row,amt,getMyEmail())}' +

'function onPhotoFile(){var f=$("fPhotoFile").files&&$("fPhotoFile").files[0];if(!f)return;' +
'var rd=new FileReader();' +
'rd.onload=function(ev){var img=new Image();' +
'img.onload=function(){' +
'var maxDim=1600,w=img.width,h=img.height;' +
'if(w>maxDim||h>maxDim){var sc=maxDim/Math.max(w,h);w=Math.round(w*sc);h=Math.round(h*sc)}' +
'var cv=document.createElement("canvas");cv.width=w;cv.height=h;' +
'var ctx=cv.getContext("2d");' +
'try{ctx.filter="contrast(160%) brightness(112%) saturate(105%)";}catch(fe){}' +
'ctx.drawImage(img,0,0,w,h);' +
'var dataUrl=cv.toDataURL("image/jpeg",0.82);' +
'var b64=dataUrl.split(",")[1];' +
'$("photoPrev").style.display="block";$("photoImg").src=dataUrl;' +
'$("photoStatus").textContent="분석 중...";' +
'google.script.run.withSuccessHandler(function(res){' +
'if(!res.ok){$("photoStatus").textContent="분석 실패: "+res.msg;return}' +
'if(res.photoUrl)$("fPhoto").value=res.photoUrl;' +
'if(res.matched&&res.matched.length>0){' +
'document.querySelectorAll("#mgrid input").forEach(function(cb){' +
'if(res.matched.indexOf(cb.getAttribute("data-n"))>=0){cb.checked=true;cb.parentNode.className="mchip sel"}' +
'})}' +
'$("photoStatus").textContent=res.msg;' +
'if(res.ocrPreview){$("ocrToggle").style.display="block";$("ocrText").textContent=res.ocrPreview;$("ocrText").style.display="none"}' +
'else{$("ocrToggle").style.display="none"}' +
'}).withFailureHandler(function(e){$("photoStatus").textContent="분석 오류: "+e.message}).api_analyzePhoto(b64)' +
'};img.src=ev.target.result};' +
'rd.readAsDataURL(f)}' +
'function toggleOcr(){var e=$("ocrText");e.style.display=e.style.display==="none"?"block":"none"}' +
'function registerItem(){var item=$("fItem").value.trim(),ps=picked();' +
'if(!item){toast("아이템명을 입력해주세요.");return}' +
'if(ps.length===0){toast("참여 멤버를 선택해주세요.");return}' +
'var listTxt=ps.length<=12?ps.join(", "):ps.slice(0,12).join(", ")+" 외 "+(ps.length-12)+"명";' +
'if(!confirm("⚠️ 참여자를 다시 한 번 확인해주세요\\n\\n📦 "+item+"\\n👥 "+ps.length+"명 참여\\n"+listTxt+"\\n\\n체크가 정확하면 확인을 눌러 등록하세요."))return;' +
'load(true);$("goBtn").disabled=true;' +
'google.script.run.withSuccessHandler(function(res){$("goBtn").disabled=false;toast(res.msg);' +
'if(res.ok){$("fItem").value="";$("fPhoto").value="";selAll(false);' +
'$("fPhotoFile").value="";$("photoPrev").style.display="none";$("photoStatus").textContent="";' +
'$("ocrToggle").style.display="none";$("ocrText").textContent=""}refresh()})' +
'.withFailureHandler(function(e){load(false);$("goBtn").disabled=false;toast("오류: "+e.message)})' +
'.api_register(item,ps,$("fPhoto").value.trim(),getMyEmail())}' +
'document.getElementById("ballist").addEventListener("click",function(e){' +
'var b=e.target;while(b&&b!==this&&!(b.getAttribute&&b.getAttribute("data-n")))b=b.parentNode;' +
'if(b&&b!==this&&!b.disabled)pay(b.getAttribute("data-n"))});' +
'document.getElementById("itemlist").addEventListener("click",function(e){' +
'var b=e.target;while(b&&b!==this&&!(b.getAttribute&&b.getAttribute("data-r")))b=b.parentNode;' +
'if(b&&b!==this)distribute(b.getAttribute("data-r"))});' +
'document.getElementById("fPhotoFile").addEventListener("change",onPhotoFile);' +
'refresh();' +
'</scr'+'ipt></body></html>';
}
