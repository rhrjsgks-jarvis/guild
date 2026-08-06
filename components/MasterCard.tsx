'use client';

import { useState } from 'react';
import { api, getStoredEmail } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';

/**
 * 마스터관리자(개발자) 전용 카드.
 *
 * 일반 관리자와 영역이 다르다:
 *  · 관리자 — 정산 업무 (등록·분배·지급·정정·혈맹원 관리)
 *  · 마스터 — 위 전부 + 앱 이름 변경 + 관리자 PIN 교체
 *
 * PIN 을 바꾸면 구글시트에 저장되고, 그때부터 Vercel 의 ADMIN_PIN 환경변수보다
 * 우선한다. 마스터 본인의 PIN(MASTER_PIN)은 여기서 바꿀 수 없다 — 환경변수에서만.
 */
/** 앱 이름 길이 상한 — .gs 의 api_setAppName 과 같은 값이어야 한다 */
const APP_NAME_MAX = 24;

/** 줄바꿈은 최대 한 번(=두 줄)까지만. 그 이상은 공백으로 눕힌다. */
function limitLines(v: string): string {
  const lines = String(v ?? '').split(/\r?\n/);
  if (lines.length <= 2) return lines.join('\n');
  return [lines[0], lines.slice(1).join(' ')].join('\n');
}

export default function MasterCard({
  appName,
  onChanged,
  toast,
}: {
  appName: string;
  onChanged: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t, srv } = useT();
  const [name, setName] = useState(appName);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setBusy(true);
    const res = await api('/api/master', { action: 'appName', value: limitLines(name).trim(), email: getStoredEmail() });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.changed' : 'r.changeFailed'), !res.ok);
    if (res.ok) onChanged(res);
  }

  async function savePin() {
    if (pin !== pin2) {
      toast(t('mst.pinMismatch'), true);
      return;
    }
    setBusy(true);
    const res = await api('/api/master', { action: 'adminPin', value: pin, email: getStoredEmail() });
    setBusy(false);
    toast(srv(res, res.ok ? 'r.changed' : 'r.changeFailed'), !res.ok);
    if (res.ok) {
      setPin('');
      setPin2('');
    }
  }

  return (
    <>
      <div className="sect">{t('mst.sect')}</div>
      <div className="card">
        <div className="field">
          <label className="fl" htmlFor="appName">
            {t('mst.appName')}
          </label>
          {/*
            긴 이름은 헤더에서 저절로 두 줄이 되는데, 어디서 끊길지는 화면 폭이 정한다.
            그래서 **어디서 끊을지 직접 정할 수 있게** 줄바꿈을 받는다 (최대 2줄).
          */}
          <textarea
            id="appName"
            rows={2}
            maxLength={APP_NAME_MAX}
            value={name}
            onChange={(e) => setName(limitLines(e.target.value))}
            style={{ resize: 'none' }}
          />
          <button
            className="btn block"
            style={{ marginTop: 10 }}
            disabled={busy || !name.trim() || limitLines(name).trim() === appName}
            onClick={saveName}
          >
            {t('mst.appNameBtn')}
          </button>
          <p className="hint">{t('mst.appNameHint')}</p>
        </div>

        <div className="field" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="fl" htmlFor="newPin">
            {t('mst.newPin')}
          </label>
          <input
            id="newPin"
            type="password"
            autoComplete="new-password"
            placeholder={t('mst.newPinPh')}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t('mst.newPinAgain')}
            style={{ marginTop: 8 }}
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
          />
          <button className="btn warn block" style={{ marginTop: 10 }} disabled={busy} onClick={savePin}>
            {busy ? t('c.processing') : t('mst.pinBtn')}
          </button>
          <p className="hint">{t('mst.pinHint')}</p>
        </div>
      </div>
    </>
  );
}
