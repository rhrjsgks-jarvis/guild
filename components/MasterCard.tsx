'use client';

import { useState } from 'react';
import { api, getStoredEmail } from '@/lib/client';
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
export default function MasterCard({
  appName,
  onChanged,
  toast,
}: {
  appName: string;
  onChanged: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(appName);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setBusy(true);
    const res = await api('/api/master', { action: 'appName', value: name.trim(), email: getStoredEmail() });
    setBusy(false);
    toast(res.msg ?? (res.ok ? t('r.changed') : t('r.changeFailed')), !res.ok);
    if (res.ok) onChanged();
  }

  async function savePin() {
    if (pin !== pin2) {
      toast(t('mst.pinMismatch'), true);
      return;
    }
    setBusy(true);
    const res = await api('/api/master', { action: 'adminPin', value: pin, email: getStoredEmail() });
    setBusy(false);
    toast(res.msg ?? (res.ok ? t('r.changed') : t('r.changeFailed')), !res.ok);
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
          <input id="appName" type="text" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="btn block"
            style={{ marginTop: 10 }}
            disabled={busy || !name.trim() || name.trim() === appName}
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
