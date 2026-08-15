'use client';

import { useEffect, useRef } from 'react';

/**
 * 폰 뒤로가기 처리 (v11.2.1) — 한 곳에서만 관리한다.
 *
 * ★ 왜 필요한가
 *   v11.1 에서 "팝업은 바깥을 눌러도 닫히지 않는다"로 바꿨는데(입력하던 내용이
 *   사라지는 사고 때문), 그때 **뒤로가기는 손대지 않았다.** 그래서 팝업을 닫으려고
 *   폰 뒤로가기를 누르면 — 가장 자연스러운 동작인데 — 앱을 통째로 벗어나고
 *   참여자를 스무 명 체크한 것이 그대로 날아간다. 막으려던 사고가 다른 문으로
 *   열려 있었던 셈이다.
 *
 * ★ 구조 — history 항목은 **언제나 최대 한 개**만 쌓는다
 *   화면에 덮인 것(팝업·크게보기·홈이 아닌 탭)마다 "뒤로가기를 받으면 할 일"을
 *   목록에 쌓아두고, history 에는 그 목록이 비어 있지 않은 동안만 **표식 하나**를
 *   올려둔다. 뒤로가기가 그 표식을 지우면 목록의 **맨 위 하나**를 실행하고,
 *   아직 남아 있으면 표식을 다시 올린다.
 *
 *     팝업 열림   → push(닫기)            · 표식 올림
 *     뒤로가기    → 닫기 실행 (앱은 그대로) · 남아 있으면 표식 다시 올림
 *     [✕] 로 닫음 → release(...) — history 는 **건드리지 않는다**
 *
 * ★ 왜 [✕] 로 닫을 때 `history.back()` 을 부르지 않는가
 *   `history.back()` 은 비동기다. 탭을 옮기면서 팝업이 함께 닫히면 back() 과
 *   pushState() 가 같은 순간에 겹쳐 **한 번에 두 겹이 닫히거나** 뒤로가기가
 *   먹통이 된다. 표식을 한 개로 고정하면 그 경합 자체가 없어진다.
 *
 *   대신 목록을 전부 [✕] 로 닫고 나면 표식 하나가 남아, 앱을 나가려고 누른
 *   뒤로가기 한 번이 그 표식을 지우는 데 쓰인다(두 번 눌러야 나간다).
 *   앱을 나가는 일은 드물고, 반대 실수(입력 날아감)보다 훨씬 가볍다.
 */

type Entry = { id: number; run: () => void };

const stack: Entry[] = [];
let seq = 0;
/** history 에 우리 표식이 올라가 있는가 */
let armed = false;
let listening = false;

function arm() {
  if (armed || typeof window === 'undefined') return;
  window.history.pushState({ gm: true }, '');
  armed = true;
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', () => {
    // 방금 사라진 것이 우리 표식이다
    armed = false;
    const top = stack.pop();
    if (!top) return; // 닫을 것이 없다 — 다음 뒤로가기는 앱 밖으로
    top.run();
    if (stack.length > 0) arm();
  });
}

/** 뒤로가기를 받으면 할 일을 하나 쌓는다 */
export function pushBack(run: () => void): number {
  if (typeof window === 'undefined') return 0;
  listen();
  const id = (seq += 1);
  stack.push({ id, run });
  arm();
  return id;
}

/**
 * 뒤로가기가 아닌 방법([✕]·저장·탭 이동)으로 닫혔을 때 목록에서 지운다.
 * 이미 뒤로가기로 처리된 항목이면 아무것도 하지 않는다.
 */
export function releaseBack(id: number) {
  if (!id) return;
  const at = stack.findIndex((e) => e.id === id);
  if (at >= 0) stack.splice(at, 1);
}

/**
 * 덮은 화면이 떠 있는 동안 뒤로가기를 가로챈다.
 *
 * 컴포넌트가 그려져 있는 동안만 살아 있으므로, 팝업처럼
 * `{열림 ? <Sheet/> : null}` 로 조건부로 그리는 것에 그대로 쓸 수 있다.
 */
export function useBackClose(onClose: () => void) {
  // onClose 가 매 렌더 새로 만들어져도 목록을 다시 쌓지 않게 한다
  const fn = useRef(onClose);
  fn.current = onClose;

  useEffect(() => {
    const id = pushBack(() => fn.current());
    return () => releaseBack(id);
  }, []);
}

/** 테스트·디버깅용 — 지금 몇 겹이 덮여 있는가 */
export function backDepth(): number {
  return stack.length;
}
