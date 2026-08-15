'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import ShareBtn from './ShareBtn';
import { api, getStoredEmail } from '@/lib/client';
import { useT } from '@/lib/i18n';
import { photoView } from '@/lib/client';
import { searchTerms, useTerms, type Term } from '@/lib/terms';

/**
 * 📚 용어 (v11.4) — 리니지W 고유명사를 세 언어로 찾아본다.
 *
 * ★ 왜 필요한가
 *   중국 혈맹원과 아이템 이야기를 할 때 서로 다른 이름을 부르면 말이 안 통한다.
 *   여기서 어느 언어로든 찾아 **눌러서 복사**하면 그대로 채팅에 붙여넣을 수 있다.
 *
 * ★ 中文·English 가 빈 항목은 "아직 확인 못 했다"는 뜻이다. 앱이 지어내지 않는다 (규칙 7).
 *   관리자가 게임 화면을 보고 채워 넣으면 그때부터 모두에게 보인다.
 */
export default function TermsTab({
  admin,
  toast,
  setBusy,
}: {
  admin: boolean;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const { terms, cats: sheetCats, reload } = useTerms();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<Term | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);

  // 실제로 쓰이는 분류를 먼저, 시트가 정해둔 분류를 뒤에 (둘 다 시트에서 온다)
  const cats = Array.from(new Set([...terms.map((x) => x.cat), ...sheetCats])).filter(Boolean);
  const list = q.trim()
    ? searchTerms(terms, q, 100)
    : terms.filter((x) => (cat ? x.cat === cat : true)).slice(0, 200);

  async function remove(row: number, ko: string) {
    if (!window.confirm(t('term.delAsk', { item: ko }))) return;
    setBusy(true);
    const res = await api('/api/admin/terms', { row, email: getStoredEmail() }, 'DELETE');
    setBusy(false);
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) reload();
  }

  /** 채팅에 붙여넣기 좋게 세 언어를 한 줄로 */
  const line = (x: Term) => [x.ko, x.zh, x.en].filter(Boolean).join(' / ');

  return (
    <div className="page">
      <div className="sect-row">
        <div className="sect">📚 {t('term.sect', { n: terms.length })}</div>
        <ShareBtn
          title={t('term.title')}
          build={() => list.map(line).join('\n')}
          toast={toast}
        />
      </div>

      <div className="card">
        <div className="field">
          <input
            type="text"
            inputMode="search"
            placeholder={t('term.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('term.search')}
          />
          <p className="hint">{t('term.searchHint')}</p>
        </div>
        {cats.length > 0 && !q.trim() ? (
          <div className="field" style={{ paddingTop: 0 }}>
            <div className="svpick">
              <button
                type="button"
                className={'svchip' + (cat === '' ? ' on' : '')}
                onClick={() => setCat('')}
              >
                {t('term.catAll')}
                <em>{terms.length}</em>
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={'svchip' + (cat === c ? ' on' : '')}
                  onClick={() => setCat(cat === c ? '' : c)}
                >
                  {c}
                  <em>{terms.filter((x) => x.cat === c).length}</em>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {admin ? (
        <div className="row-acts" style={{ marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => setEditing('new')}>
            ➕ {t('term.add')}
          </button>
          {/* 홈페이지 표를 복사해 한 번에 넣는 길 — 수백 개를 손으로 칠 수는 없다 */}
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => setBulk(true)}>
            📋 {t('term.bulk')}
          </button>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        {terms.length === 0 ? (
          <div className="empty">{t('term.empty')}</div>
        ) : list.length === 0 ? (
          <div className="empty">{t('term.noMatch')}</div>
        ) : (
          list.map((x) => (
            <div className={'row' + (admin ? ' stack' : '')} key={x.row}>
              <div className="row-top">
                {/* 그림은 관리자가 넣어둔 주소가 있을 때만 — 없으면 이름만 보여준다 */}
                {x.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="term-img" src={photoView(x.img, 120)} alt="" loading="lazy" />
                ) : null}
                <div className="row-main">
                  <div className="row-name">
                    <span className="svr">{x.cat}</span>
                    {x.ko}
                  </div>
                  <div className="row-sub">
                    {/* 빈 칸은 "아직 확인 못 했다" — 지어내지 않고 그대로 비워 보여준다 */}
                    {x.zh || x.en ? (
                      [x.zh, x.en].filter(Boolean).join(' · ')
                    ) : (
                      <span className="warnish">{t('term.needCheck')}</span>
                    )}
                  </div>
                </div>
                <ShareBtn title={x.ko} build={() => line(x)} toast={toast} />
              </div>
              {admin ? (
                <div className="row-acts">
                  <button className="btn ghost" onClick={() => setEditing(x)}>
                    {t('c.edit')}
                  </button>
                  <button className="btn ghost" onClick={() => void remove(x.row, x.ko)}>
                    {t('c.delete')}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {bulk ? (
        <BulkSheet
          onClose={() => setBulk(false)}
          onDone={() => {
            setBulk(false);
            reload();
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}

      {editing ? (
        <TermSheet
          entry={editing === 'new' ? null : editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
          toast={toast}
          setBusy={setBusy}
        />
      ) : null}
    </div>
  );
}

/** 용어 한 줄 편집 — 추가와 수정이 같은 화면을 쓴다 (두 벌이면 한쪽만 낡는다) */
function TermSheet({
  entry,
  cats,
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  entry: Term | null;
  cats: string[];
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  // 분류 기본값도 시트가 준 목록의 마지막(기타)을 쓴다 — 앱이 이름을 정하지 않는다
  const [cat, setCat] = useState(entry?.cat ?? cats[cats.length - 1] ?? '');
  const [ko, setKo] = useState(entry?.ko ?? '');
  const [zh, setZh] = useState(entry?.zh ?? '');
  const [en, setEn] = useState(entry?.en ?? '');
  const [img, setImg] = useState(entry?.img ?? '');

  const pick = cats;

  async function submit() {
    if (!ko.trim()) return;
    setBusy(true);
    const res = await api('/api/admin/terms', {
      row: entry?.row ?? 0,
      cat,
      ko: ko.trim(),
      zh: zh.trim(),
      en: en.trim(),
      img: img.trim(),
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.done' : 'r.failed'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title={`📚 ${entry ? t('c.edit') : t('term.add')}`} subtitle={t('term.editSub')} onClose={onClose}>
      <label className="fl">{t('term.cat')}</label>
      <div className="svpick">
        {pick.map((c) => (
          <button
            key={c}
            type="button"
            className={'svchip' + (cat === c ? ' on' : '')}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <label className="fl" htmlFor="tko" style={{ marginTop: 12 }}>
        {t('term.ko')}
      </label>
      <input id="tko" type="text" maxLength={40} value={ko} onChange={(e) => setKo(e.target.value)} />

      <label className="fl" htmlFor="tzh" style={{ marginTop: 12 }}>
        中文
      </label>
      <input id="tzh" type="text" maxLength={40} value={zh} onChange={(e) => setZh(e.target.value)} />

      <label className="fl" htmlFor="ten" style={{ marginTop: 12 }}>
        English
      </label>
      <input id="ten" type="text" maxLength={60} value={en} onChange={(e) => setEn(e.target.value)} />

      <label className="fl" htmlFor="tim" style={{ marginTop: 12 }}>
        {t('term.img')}
      </label>
      <input id="tim" type="text" inputMode="url" value={img} onChange={(e) => setImg(e.target.value)} />

      <p className="hint">{t('term.blankOk')}</p>
      <p className="hint">{t('term.imgHint')}</p>

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={!ko.trim()} onClick={() => void submit()}>
          {t('c.save')}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * 📋 붙여넣기로 여러 개 등록 (v11.4).
 *
 * 공식 홈페이지의 표를 드래그해 복사하면 대개 **탭으로 나뉜 줄**이 된다.
 * 그래서 탭·쉼표·슬래시를 모두 구분자로 받는다 — 사람이 형식을 맞추게 하면
 * 그 단계에서 대부분 포기한다.
 *
 * 한 줄에 이름 하나만 있어도 된다 (국문만 넣고 中文·English 는 나중에).
 */
function BulkSheet({
  onClose,
  onDone,
  toast,
  setBusy,
}: {
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
}) {
  const { t, srv } = useT();
  const [text, setText] = useState('');
  const [cat, setCat] = useState('');
  const { cats } = useTerms();

  /** 한 줄 → { ko, zh, en } — 구분자는 탭·쉼표·슬래시 아무거나 */
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|\s*[|/,]\s*/).map((x) => x.trim()).filter(Boolean);
      return { cat: cat || (cats[cats.length - 1] ?? ''), ko: parts[0] ?? '', zh: parts[1] ?? '', en: parts[2] ?? '' };
    })
    .filter((r) => r.ko);

  async function submit() {
    if (rows.length === 0) return;
    setBusy(true);
    // 한 번에 너무 많으면 시트 실행 시간이 넘는다 — 200개씩 나눠 보낸다
    let added = 0;
    let skipped = 0;
    let failed = '';
    for (let i = 0; i < rows.length; i += 200) {
      const res = await api('/api/admin/terms', { rows: rows.slice(i, i + 200), email: getStoredEmail() }, 'PATCH');
      if (!res.ok) {
        failed = srv(res, 'r.failed');
        break;
      }
      added += Number(res.added ?? 0);
      skipped += Number(res.skipped ?? 0);
    }
    setBusy(false);
    if (failed) {
      toast(failed, true);
      return;
    }
    toast(t('term.bulkDone', { n: added, k: skipped }));
    onDone();
  }

  return (
    <Sheet title={`📋 ${t('term.bulk')}`} subtitle={t('term.bulkSub')} onClose={onClose}>
      <label className="fl">{t('term.cat')}</label>
      <div className="svpick">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            className={'svchip' + (cat === c ? ' on' : '')}
            onClick={() => setCat(cat === c ? '' : c)}
          >
            {c}
          </button>
        ))}
      </div>

      <label className="fl" htmlFor="tbulk" style={{ marginTop: 12 }}>
        {t('term.bulkLabel')}
      </label>
      <textarea
        id="tbulk"
        rows={9}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('term.bulkPh')}
      />
      <p className="hint">{t('term.bulkHint')}</p>
      {rows.length > 0 ? <p className="hint">{t('term.bulkCount', { n: rows.length })}</p> : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" disabled={rows.length === 0} onClick={() => void submit()}>
          {t('c.save')}
        </button>
      </div>
    </Sheet>
  );
}
