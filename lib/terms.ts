'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { Lang } from '@/lib/i18n';

/**
 * 리니지W 용어 사전 (v11.4) — 국문 · 中文 · English.
 *
 * ★ 왜 시트에 두는가
 *   아이템명은 **사용자 데이터**라 기계가 번역하지 않는다 (CLAUDE.md 규칙 7).
 *   그렇다고 중국 혈맹원에게 한국어만 보여주면 무슨 아이템인지 알 수가 없다.
 *   그래서 **사람이 확인한 표기만** 시트에 모아두고, 앱은 그 표에 있는 말만
 *   병기·자동완성한다. 표에 없는 말은 손대지 않는다.
 *
 * ★ 저장은 언제나 국문
 *   중국 혈맹원이 「龙之心」을 골라도 시트에는 '용의 심장' 이 들어간다.
 *   같은 아이템이 두 이름으로 쌓이면 나중에 개수를 세거나 찾을 수 없다.
 */

export type Term = {
  row: number;
  cat: string;
  ko: string;
  zh: string;
  en: string;
  /** 아이콘 그림 주소 — **관리자가 직접 넣은 것만** 쓴다 (우리가 긁어오지 않는다) */
  img: string;
  note: string;
};

/** 화면을 옮겨 다닐 때마다 시트를 읽지 않게 한다 (용어는 자주 바뀌지 않는다) */
let memo: { at: number; terms: Term[]; cats: string[] } | null = null;
const MEMO_MS = 60_000;

/** 비교용 정규화 — 공백·대소문자를 지운다 (규칙 4 와 같은 이유) */
export function normTerm(v: string): string {
  return String(v ?? '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 세 언어 어느 것으로 쳐도 찾는다.
 *
 * 중국 혈맹원이 `龙之` 만 쳐도, 영어권이 `dragon` 만 쳐도 같은 항목이 나와야
 * 사전을 쓰는 뜻이 있다. 앞부분이 맞는 것을 먼저 보여준다 — 사람이 치는 것은
 * 대개 앞글자다.
 */
export function searchTerms(terms: Term[], q: string, limit = 12): Term[] {
  const needle = normTerm(q);
  if (!needle) return [];
  const hit: { t: Term; score: number }[] = [];
  for (const t of terms) {
    const fields = [t.ko, t.zh, t.en].map(normTerm).filter(Boolean);
    let best = -1;
    for (const f of fields) {
      const at = f.indexOf(needle);
      if (at < 0) continue;
      // 앞에서 맞을수록 점수가 높다
      best = best < 0 ? at : Math.min(best, at);
    }
    if (best >= 0) hit.push({ t, score: best });
  }
  hit.sort((a, b) => a.score - b.score || a.t.ko.localeCompare(b.t.ko, 'ko'));
  return hit.slice(0, limit).map((h) => h.t);
}

/** 화면 언어로 보여줄 표기 — 없으면 국문 그대로 (지어내지 않는다) */
export function termLabel(t: Term, lang: Lang): string {
  const other = lang === 'zh' ? t.zh : lang === 'en' ? t.en : '';
  return other ? `${t.ko} (${other})` : t.ko;
}

/** 이름 하나를 사전에서 찾는다 (정확히 같은 국문일 때만) */
export function findTerm(terms: Term[], name: string): Term | null {
  const key = normTerm(name);
  return terms.find((t) => normTerm(t.ko) === key) ?? null;
}

/** 용어 목록 — 화면 여러 곳에서 쓰므로 훅 하나로 모은다 */
export function useTerms(): { terms: Term[]; cats: string[]; reload: () => void } {
  const fresh0 = memo && Date.now() - memo.at < MEMO_MS ? memo : null;
  const [terms, setTerms] = useState<Term[]>(fresh0?.terms ?? []);
  // ★ 분류 목록도 **시트가** 준다. 앱에 적어두면 시트에서 분류를 하나 늘렸을 때
  //   화면에서는 고를 수가 없어진다 (그리고 화면 코드에 한국어가 박힌다).
  const [cats, setCats] = useState<string[]>(fresh0?.cats ?? []);

  const load = (isFresh = false) => {
    void (async () => {
      const res = await api(isFresh ? '/api/terms?fresh=1' : '/api/terms');
      if (!res.ok) return; // 못 읽으면 자동완성만 안 될 뿐, 입력은 그대로 된다
      const data = (res.data ?? {}) as { terms?: Term[]; cats?: string[] };
      const list = data.terms ?? [];
      const cs = data.cats ?? [];
      memo = { at: Date.now(), terms: list, cats: cs };
      setTerms(list);
      setCats(cs);
    })();
  };

  useEffect(() => {
    if (memo && Date.now() - memo.at < MEMO_MS) return;
    load();
  }, []);

  return { terms, cats, reload: () => load(true) };
}
