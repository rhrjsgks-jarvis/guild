'use client';

import { useEffect, useState } from 'react';
import { api, getStoredEmail, setStoredEmail } from '@/lib/client';
import { useT, type Lang } from '@/lib/i18n';
import ShareCard from './ShareCard';
import RosterCard from './RosterCard';
import ToolsCard from './ToolsCard';
import MasterCard from './MasterCard';

export default function AdminTab({
  admin,
  master,
  unit,
  servers,
  appName,
  onAuthChange,
  toast,
}: {
  admin: boolean;
  master: boolean;
  unit: string;
  servers: string[];
  appName: string;
  onAuthChange: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, lang, setLang, unit: unitLabel } = useT();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setEmail(getStoredEmail());
    setStandalone(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  async function login() {
    if (!pin) return;
    setBusy(true);
    const res = await api('/api/admin/login', { pin });
    setBusy(false);
    setPin('');
    toast(res.msg ?? (res.ok ? '' : t('r.loginFailed')), !res.ok);
    if (res.ok) onAuthChange();
  }

  async function logout() {
    setBusy(true);
    const res = await api('/api/admin/logout', {});
    setBusy(false);
    toast(res.msg ?? t('r.loggedOut'));
    onAuthChange();
  }

  return (
    <div className="page">
      <div className="sect">{t('adm.langSect')}</div>
      <div className="card">
        <div className="field" style={{ display: 'flex', gap: 8 }}>
          {(['ko', 'zh'] as Lang[]).map((l) => (
            <button
              key={l}
              className={'btn block' + (lang === l ? '' : ' ghost')}
              onClick={() => setLang(l)}
            >
              {l === 'ko' ? '한국어' : '中文'}
            </button>
          ))}
        </div>
        <div className="field" style={{ paddingTop: 0 }}>
          <p className="hint">{t('adm.langNote')}</p>
        </div>
      </div>

      <div className="sect">{master ? t('adm.masterMode') : admin ? t('adm.adminMode') : t('adm.needAuth')}</div>

      <div className="card">
        {admin ? (
          <div className="field">
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>
              {t('adm.onDesc', { role: master ? t('c.master') : t('c.admin') })}
              {master ? t('adm.masterExtra') : ''}
            </p>
            <p className="hint">{t('adm.keepHint')}</p>
            <button className="btn danger block" style={{ marginTop: 14 }} disabled={busy} onClick={logout}>
              {t('adm.lock')}
            </button>
          </div>
        ) : (
          <div className="field">
            <label className="fl" htmlFor="pin">
              {t('adm.pin')}
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder={t('adm.pinPh')}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void login();
              }}
            />
            <button className="btn block" style={{ marginTop: 12 }} disabled={busy || !pin} onClick={login}>
              {busy ? t('c.checking') : t('adm.unlock')}
            </button>
            <p className="hint">{t('adm.pinHint')}</p>
          </div>
        )}
      </div>

      <ShareCard appName={appName} toast={toast} />

      {/* 아이디 관리와 기록용 이메일은 쓰기 작업을 하는 관리자에게만 의미가 있다 */}
      {admin ? (
        <>
          <RosterCard unit={unitLabel(unit)} servers={servers} onChanged={onAuthChange} toast={toast} />

          <ToolsCard unit={unitLabel(unit)} onChanged={onAuthChange} toast={toast} />

          {master ? <MasterCard appName={appName} onChanged={onAuthChange} toast={toast} /> : null}

          <div className="sect">{t('adm.emailSect')}</div>
          <div className="card">
            <div className="field">
              <input
                type="text"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="btn ghost block"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setStoredEmail(email);
                  toast(email.trim() ? t('adm.emailSaved', { v: email.trim() }) : t('adm.emailCleared'));
                }}
              >
                {t('c.save')}
              </button>
              <p className="hint">{t('adm.emailHint')}</p>
            </div>
          </div>
        </>
      ) : null}

      <div className="sect">{t('adm.installSect')}</div>
      <div className="card">
        <div className="field">
          {standalone ? (
            <p style={{ fontSize: 14 }}>{t('adm.installed')}</p>
          ) : (
            <p style={{ fontSize: 13.5, lineHeight: 1.7 }}>
              {t('adm.installIos')}
              <br />
              {t('adm.installAos')}
            </p>
          )}
          <p className="hint">{t('adm.installHint')}</p>
        </div>
      </div>

      <div className="sect">{t('adm.healthSect')}</div>
      <div className="card">
        <div className="field">
          <a className="btn ghost block" href="/api/health" target="_blank" rel="noreferrer">
            {t('adm.healthBtn')}
          </a>
          <p className="hint">{t('adm.healthHint')}</p>
        </div>
      </div>
    </div>
  );
}
