'use client';

import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { searchTerms, useTerms } from '@/lib/terms';

/**
 * 아이템명 입력칸 + 용어 자동완성 (v11.4).
 *
 * ★ 세 언어 어느 것으로 쳐도 찾는다. 중국 혈맹원이 `龙之` 만 쳐도 그 아이템이 뜬다.
 * ★ 고르면 **국문이 들어간다.** 기록이 한 종류로 모여야 나중에 셀 수 있다.
 * ★ 사전에 없는 이름도 **그대로 칠 수 있다.** 자동완성이 입력을 막으면
 *   새 아이템이 나올 때마다 등록 자체가 멈춘다 — 제안일 뿐이다.
 */
export default function ItemNameInput({
  id,
  value,
  onChange,
  maxLength = 40,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
}) {
  const { t, lang } = useT();
  const { terms } = useTerms();
  const [open, setOpen] = useState(true);

  const hits = open ? searchTerms(terms, value, 8) : [];
  // 이미 정확히 고른 이름이면 굳이 목록을 띄우지 않는다
  const exact = hits.length === 1 && hits[0].ko === value;

  return (
    <div className="ac">
      <input
        id={id}
        type="text"
        maxLength={maxLength}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          setOpen(true);
          onChange(e.target.value);
        }}
      />
      {hits.length > 0 && !exact ? (
        <div className="ac-list" role="listbox">
          {hits.map((h) => {
            const other = lang === 'zh' ? h.zh : lang === 'en' ? h.en : h.zh || h.en;
            return (
              <button
                key={h.row}
                type="button"
                className="ac-item"
                onClick={() => {
                  // ★ 어느 언어로 골랐든 저장되는 이름은 국문이다
                  onChange(h.ko);
                  setOpen(false);
                }}
              >
                <span className="cat">{h.cat}</span>
                <span className="nm">{h.ko}</span>
                {other ? <span className="sub">{other}</span> : null}
              </button>
            );
          })}
          <p className="hint" style={{ margin: '6px 8px 2px' }}>
            {t('term.pickHint')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
