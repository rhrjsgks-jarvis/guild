'use client';

import { useEffect, useState } from 'react';
import { api, getStoredEmail } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 🔐 최초 설정 — 길드가 직접 마스터·관리자 PIN 을 정하는 화면 (v10.9).
 *
 * 언제 보이나:
 *   · 아직 PIN 을 한 번도 정하지 않았을 때 (설치 코드 필요)
 *   · 구글시트 메뉴에서 재설정 창을 열었을 때 (10분, 설치 코드 불필요)
 * 판정은 전부 서버가 한다 — 이 컴포넌트는 `/api/setup` 이 알려준 대로만 그린다.
 *
 * ★ 여기서 정한 PIN 은 평문으로 어디에도 저장되지 않는다. 그래서 잊으면
 *   되찾을 방법이 없고, 구글시트에서 재설정 창을 여는 것만이 유일한 복구
 *   경로다. 그 사실을 화면에서 분명히 말해준다 — 나중에 알게 되면 늦는다.
 */
type SetupState = { needsSetup: boolean; resetOpen: boolean; codeRequired: boolean; codeMissing: boolean };

export default function SetupCard({
  onDone,
  toast,
}: {
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [info, setInfo] = useState<SetupState | null>(null);
  const [code, setCode] = useState('');
  const [master, setMaster] = useState('');
  const [master2, setMaster2] = useState('');
  const [admin, setAdmin] = useState('');
  const [admin2, setAdmin2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await api('/api/setup');
      if (!alive) return;
      setInfo({
        needsSetup: res.needsSetup === true,
        resetOpen: res.resetOpen === true,
        codeRequired: res.codeRequired === true,
        codeMissing: res.codeMissing === true,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!info?.needsSetup) return null;

  async function submit() {
    if (master !== master2 || admin !== admin2) {
      toast(t('stp.mismatch'), true);
      return;
    }
    if (master.trim() === admin.trim()) {
      toast(t('stp.same'), true);
      return;
    }
    setBusy(true);
    const res = await api('/api/setup', {
      code: code.trim(),
      masterPin: master.trim(),
      adminPin: admin.trim(),
      email: getStoredEmail(),
    });
    setBusy(false);
    toast(srv(res, res.ok ? 'stp.done' : 'stp.failed'), !res.ok);
    if (res.ok) {
      setCode('');
      setMaster('');
      setMaster2('');
      setAdmin('');
      setAdmin2('');
      setInfo({ needsSetup: false, resetOpen: false, codeRequired: false, codeMissing: false });
      onDone(res);
    }
  }

  const filled = master && master2 && admin && admin2 && (!info.codeRequired || code.trim());

  return (
    <>
      <div className="sect">{info.resetOpen ? t('stp.sectReset') : t('stp.sect')}</div>
      <div className="card">
        <div className="field">
          <p style={{ fontSize: 14, lineHeight: 1.7 }}>
            {info.resetOpen ? t('stp.introReset') : t('stp.intro')}
          </p>
          <p className="hint">{t('stp.privacy')}</p>
        </div>

        {info.codeMissing ? (
          <div className="field" style={{ borderTop: '1px solid var(--line)' }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.7 }}>{t('stp.noCode')}</p>
          </div>
        ) : null}

        {info.codeRequired ? (
          <div className="field" style={{ borderTop: '1px solid var(--line)' }}>
            <label className="fl" htmlFor="setupCode">
              {t('stp.code')}
            </label>
            {/* 설치 코드는 문자가 섞인다 — 숫자 키패드로 고정하면 폰에서 입력할 수 없다 */}
            <input
              id="setupCode"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('stp.codePh')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="hint">{t('stp.codeHint')}</p>
          </div>
        ) : null}

        <div className="field" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="fl" htmlFor="setupMaster">
            {t('stp.master')}
          </label>
          <input
            id="setupMaster"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('stp.pinPh')}
            value={master}
            onChange={(e) => setMaster(e.target.value)}
          />
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('stp.again')}
            style={{ marginTop: 8 }}
            value={master2}
            onChange={(e) => setMaster2(e.target.value)}
          />
          <p className="hint">{t('stp.masterHint')}</p>
        </div>

        <div className="field" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="fl" htmlFor="setupAdmin">
            {t('stp.admin')}
          </label>
          <input
            id="setupAdmin"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('stp.pinPh')}
            value={admin}
            onChange={(e) => setAdmin(e.target.value)}
          />
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('stp.again')}
            style={{ marginTop: 8 }}
            value={admin2}
            onChange={(e) => setAdmin2(e.target.value)}
          />
          <p className="hint">{t('stp.adminHint')}</p>
        </div>

        <div className="field" style={{ borderTop: '1px solid var(--line)' }}>
          {/* 무엇을 입력했는지 볼 수 없으면, 두 번 똑같이 틀려도 알 수가 없다 */}
          <button className="btn ghost block" onClick={() => setShow((v) => !v)}>
            {t(show ? 'stp.hide' : 'stp.show')}
          </button>
          <button className="btn block" style={{ marginTop: 10 }} disabled={busy || !filled} onClick={submit}>
            {busy ? t('c.processing') : t('stp.submit')}
          </button>
          <p className="hint">{t('stp.warnLost')}</p>
        </div>
      </div>
    </>
  );
}
