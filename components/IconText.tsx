'use client';

import Glyph, { EMOJI_GLYPH } from './Glyph';

/**
 * 앞머리 이모지를 글리프로 바꿔 그리는 라벨 (v11.7).
 *
 * 사전(`lib/i18n.tsx`)의 문구는 `💰 멤버별 잔액` 처럼 이모지로 시작한다.
 * 그 500여 줄을 손대는 대신, **그리는 자리에서** 앞머리만 글리프로 바꾼다.
 *
 * ★ 이렇게 하는 이유
 *   ① 사전은 세 언어가 한 줄에 묶여 있다. 이모지를 떼려면 세 곳을 같이 고쳐야 하고,
 *     하나라도 빠지면 그 언어만 이모지가 남는다.
 *   ② 시트가 보내는 문구(도구 이름 등)에도 같은 이모지가 붙어 온다. 그리는 자리에서
 *     바꾸면 시트를 고치지 않고도 함께 통일된다.
 * ★ **표에 없는 이모지는 건드리지 않는다.** 비슷해 보인다고 아무 글리프에나 이으면
 *   뜻이 바뀐 채 화면에 남는다 (규칙 7).
 * ★ ✅ · ⚠️ · ❌ 로 시작하는 문구는 **일부러 그대로 둔다.** 그건 장식이 아니라
 *   결과 신호이고, 시트가 그것으로 성공·실패를 판정한다 (규칙 5-3).
 */
export default function IconText({ text, size = 16 }: { text: string; size?: number }) {
  const s = String(text ?? '');
  // 앞머리 한 글자(+변이 선택자)만 본다. 문장 중간의 이모지는 뜻을 가진 내용이다
  const head = (s.match(/^(\p{Extended_Pictographic}️?)\s*/u) ?? [])[1] ?? '';
  const name = head ? EMOJI_GLYPH[head] : undefined;
  if (!name) return <>{s}</>;

  return (
    <>
      <Glyph name={name} size={size} />
      <span className="itx">{s.slice(head.length).trim()}</span>
    </>
  );
}
