'use client';

import { useEffect, useState } from 'react';
import { api, getStoredEmail, setStoredEmail } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { LANGS, useT } from '@/lib/i18n';
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
  onAuthChange: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, lang, setLang, unit: unitLabel, srv } = useT();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
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
    toast(res.ok ? srv(res) : srv(res, 'r.loginFailed'), !res.ok);
    if (res.ok) onAuthChange(res);
  }

  async function logout() {
    setBusy(true);
    const res = await api('/api/admin/logout', {});
    setBusy(false);
    toast(srv(res, 'r.loggedOut'));
    onAuthChange();
  }

  return (
    <div className="page">
      <div className="sect">{t('adm.langSect')}</div>
      <div className="card">
        <div className="field" style={{ display: 'flex', gap: 8 }}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              className={'btn block' + (lang === l.id ? '' : ' ghost')}
              style={{ padding: '11px 4px', fontSize: 13 }}
              onClick={() => setLang(l.id)}
            >
              {l.label}
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
            {/*
              ★ inputMode 를 numeric 으로 두면 폰에서 **숫자 키패드만** 뜬다.
                관리자 PIN 은 숫자였지만 마스터 PIN 은 문자를 섞을 수 있어서,
                그런 PIN 은 폰에서 아예 입력할 방법이 없었다.
              ★ 자동 대문자·자동 수정도 끈다. iOS 는 첫 글자를 대문자로 바꾸는데
                PIN 은 대소문자를 가리므로 그것만으로 로그인이 실패한다.
            */}
            <div className="pin-wrap">
              <input
                id="pin"
                type={showPin ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t('adm.pinPh')}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void login();
                }}
              />
              {/* 무엇을 입력했는지 눈으로 확인할 수 있어야 한다 —
                  안 보이면 오타인지 PIN 이 틀린 건지 구분할 수 없다 */}
              <button
                type="button"
                className="pin-eye"
                aria-label={t(showPin ? 'adm.pinHide' : 'adm.pinShow')}
                aria-pressed={showPin}
                onClick={() => setShowPin((v) => !v)}
              >
                {showPin ? '🙈' : '👁'}
              </button>
            </div>
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
