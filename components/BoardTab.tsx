'use client';

import { useCallback, useEffect, useState } from 'react';
import Glyph from './Glyph';
import IconText from './IconText';
import Sheet from './Sheet';
import type { BoardPost } from '@/lib/types';
import { api, getStoredEmail, getStoredName } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 게시판 — 혈맹원 누구나 글을 쓸 수 있다 (PIN 불필요).
 * 공지는 관리자·마스터만 올릴 수 있고, 목록 맨 위에 고정된다.
 * 삭제도 관리자·마스터만.
 */
export default function BoardTab({
  admin,
  focusPostId,
  onFocusHandled,
  toast,
  onChanged,
}: {
  admin: boolean;
  /** 상단 공지 띠를 눌러 들어왔을 때 바로 펼칠 글 */
  focusPostId?: number | null;
  onFocusHandled?: () => void;
  toast: (msg: string, isError?: boolean) => void;
  onChanged: (res?: ApiResult) => void;
}) {
  const { t, srv } = useT();
  const [posts, setPosts] = useState<BoardPost[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<BoardPost | null>(null);
  const [writing, setWriting] = useState(false);

  // fresh=true 는 내가 방금 쓴 직후에만 — 서버 캐시를 건너뛴다 (lib/fresh.ts)
  const load = useCallback(async (fresh = false) => {
    const res = await api(fresh ? '/api/board?fresh=1' : '/api/board');
    if (res.ok) {
      setError('');
      setPosts(res.data as BoardPost[]);
      return;
    }
    // 글이 없는 것과 불러오지 못한 것은 다르다 — 빈 목록으로 얼버무리지 않는다
    setError(srv(res) || ' ');
    setPosts([]);
  }, [srv]);

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
    toast(srv(res, res.ok ? 'r.deleted' : 'r.deleteFailed'), !res.ok);
    if (res.ok) {
      setOpen(null);
      void load(true);
      onChanged(res);
    }
  }

  return (
    <div className="page">
      <div className="sect">📋 {t('board.title')}</div>

      <button className="btn block" onClick={() => setWriting(true)}>
        <Glyph name="edit" size={16} /> {t('c.write')}
      </button>

      <div className="card" style={{ marginTop: 12 }}>
        {!posts ? (
          <div className="field">
            {[70, 90, 60].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}%`, marginBottom: 10 }} />
            ))}
          </div>
        ) : error ? (
          <div className="field">
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>
              ⚠️ {error.trim()}
              {'\n\n'}
              {t('board.needSheet')}
            </div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => void load()}>
              {t('c.retry')}
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty">{t('board.empty')}</div>
        ) : (
          posts.map((p) => (
            <div className="row" key={p.id}>
              <div className="row-main">
                <div className="row-name">
                  {p.kind === 'notice' ? <span className="chip">📌 {t('board.notice')}</span> : null} {p.title}
                </div>
                <div className="row-sub">
                  {p.author} · {p.at}
                </div>
              </div>
              <button className="btn ghost" onClick={() => setOpen(p)}>
                {t('c.view')}
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
            {open.body || t('board.noBody')}
          </div>
          <div className="sheet-actions">
            {admin ? (
              <button className="btn danger" onClick={() => void remove(open)}>
                {t('c.delete')}
              </button>
            ) : null}
            <button className="btn ghost" onClick={() => setOpen(null)}>
              {t('c.close')}
            </button>
          </div>
        </Sheet>
      ) : null}

      {writing ? (
        <WriteSheet
          admin={admin}
          onClose={() => setWriting(false)}
          onDone={(res) => {
            setWriting(false);
            void load(true);
            onChanged(res);
          }}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

function WriteSheet({
  admin,
  onClose,
  onDone,
  toast,
}: {
  admin: boolean;
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
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
    toast(srv(res, res.ok ? 'r.posted' : 'r.postFailed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet title={`✏️ ${t('c.write')}`} onClose={onClose}>
      <label className="fl" htmlFor="pt">
        <IconText text={t('board.newTitle')} />
      </label>
      <input id="pt" type="text" maxLength={60} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />

      <label className="fl" htmlFor="pb" style={{ marginTop: 10 }}>
        <IconText text={t('board.newBody')} />
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
        <IconText text={t('board.author')} />
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
            <IconText text={t('c.cancel')} />
          </button>
        <button className="btn" disabled={!title.trim() || busy} onClick={() => void submit()}>
          {busy ? t('board.posting') : t('c.write')}
        </button>
      </div>
    </Sheet>
  );
}
