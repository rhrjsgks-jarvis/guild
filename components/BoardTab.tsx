'use client';

import { useCallback, useEffect, useState } from 'react';
import Sheet from './Sheet';
import type { BoardPost } from '@/lib/types';
import { api, getStoredEmail, getStoredName } from '@/lib/client';
import { makeT, type Lang } from '@/lib/i18n';

/**
 * 게시판 — 혈맹원 누구나 글을 쓸 수 있다 (PIN 불필요).
 * 공지는 관리자·마스터만 올릴 수 있고, 목록 맨 위에 고정된다.
 * 삭제도 관리자·마스터만.
 */
export default function BoardTab({
  admin,
  lang,
  focusPostId,
  onFocusHandled,
  toast,
  onChanged,
}: {
  admin: boolean;
  lang: Lang;
  /** 상단 공지 띠를 눌러 들어왔을 때 바로 펼칠 글 */
  focusPostId?: number | null;
  onFocusHandled?: () => void;
  toast: (msg: string, isError?: boolean) => void;
  onChanged: () => void;
}) {
  const t = makeT(lang);
  const [posts, setPosts] = useState<BoardPost[] | null>(null);
  const [open, setOpen] = useState<BoardPost | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/board');
    if (res.ok) setPosts(res.data as BoardPost[]);
    else setPosts([]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 공지 띠로 들어왔으면 그 글을 자동으로 펼친다
  useEffect(() => {
    if (!focusPostId || !posts) return;
    const hit = posts.find((p) => p.id === focusPostId);
    if (hit) setOpen(hit);
    onFocusHandled?.();
  }, [focusPostId, posts, onFocusHandled]);

  async function remove(post: BoardPost) {
    const res = await api('/api/admin/board', { id: post.id, email: getStoredEmail() }, 'DELETE');
    toast(res.msg ?? (res.ok ? '삭제했습니다.' : '삭제하지 못했습니다.'), !res.ok);
    if (res.ok) {
      setOpen(null);
      void load();
      onChanged();
    }
  }

  return (
    <div className="page">
      <div className="sect">📋 {t('board.title')}</div>

      <button className="btn block" onClick={() => setWriting(true)}>
        ✏️ {t('common.write')}
      </button>

      <div className="card" style={{ marginTop: 12 }}>
        {!posts ? (
          <div className="field">
            {[70, 90, 60].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="empty">{t('board.empty')}</div>
        ) : (
          posts.map((p) => (
            <div className="row" key={p.id}>
              <div className="row-main">
                <div className="row-name">
                  {p.kind === 'notice' ? <span className="chip">📌 {t('board.notice')}</span> : null}{' '}
                  {p.title}
                </div>
                <div className="row-sub">
                  {p.author} · {p.at}
                </div>
              </div>
              <button className="btn ghost" onClick={() => setOpen(p)}>
                보기
              </button>
            </div>
          ))
        )}
      </div>

      {open ? (
        <Sheet
          title={(open.kind === 'notice' ? '📌 ' : '') + open.title}
          subtitle={`${open.author} · ${open.at}`}
          onClose={() => setOpen(null)}
        >
          <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
            {open.body || '(내용 없음)'}
          </div>
          <div className="sheet-actions">
            {admin ? (
              <button className="btn danger" onClick={() => void remove(open)}>
                {t('common.delete')}
              </button>
            ) : null}
            <button className="btn ghost" onClick={() => setOpen(null)}>
              {t('common.close')}
            </button>
          </div>
        </Sheet>
      ) : null}

      {writing ? (
        <WriteSheet
          admin={admin}
          lang={lang}
          onClose={() => setWriting(false)}
          onDone={() => {
            setWriting(false);
            void load();
            onChanged();
          }}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

function WriteSheet({
  admin,
  lang,
  onClose,
  onDone,
  toast,
}: {
  admin: boolean;
  lang: Lang;
  onClose: () => void;
  onDone: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const t = makeT(lang);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState(getStoredName());
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    const res = await api('/api/board', { title, body, author, notice: admin && notice });
    setBusy(false);
    toast(res.msg ?? (res.ok ? '등록했습니다.' : '등록하지 못했습니다.'), !res.ok);
    if (res.ok) onDone();
  }

  return (
    <Sheet title={`✏️ ${t('common.write')}`} onClose={onClose}>
      <label className="fl" htmlFor="pt">
        {t('board.newTitle')}
      </label>
      <input id="pt" type="text" maxLength={60} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />

      <label className="fl" htmlFor="pb" style={{ marginTop: 10 }}>
        {t('board.newBody')}
      </label>
      <textarea
        id="pb"
        rows={6}
        maxLength={1500}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{ width: '100%', resize: 'vertical' }}
      />

      <label className="fl" htmlFor="pa" style={{ marginTop: 10 }}>
        {t('board.author')}
      </label>
      <input id="pa" type="text" maxLength={30} value={author} onChange={(e) => setAuthor(e.target.value)} />

      {admin ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} />
          <span>📌 {t('board.asNotice')}</span>
        </label>
      ) : null}

      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn" disabled={!title.trim() || busy} onClick={() => void submit()}>
          {busy ? '등록 중…' : t('common.write')}
        </button>
      </div>
    </Sheet>
  );
}
