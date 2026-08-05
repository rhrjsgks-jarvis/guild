'use client';

import { useState } from 'react';
import { api, getStoredEmail } from '@/lib/client';

/**
 * 마스터관리자(개발자) 전용 카드.
 *
 * 일반 관리자와 영역이 다르다:
 *  · 관리자 — 정산 업무 (등록·분배·지급·정정·혈맹원 관리)
 *  · 마스터 — 위 전부 + 앱 이름 변경 + 관리자 PIN 교체
 *
 * PIN 을 바꾸면 구글시트에 저장되고, 그때부터 Vercel 의 ADMIN_PIN 환경변수보다
 * 우선한다. 관리자가 바뀌어도 재배포 없이 앱에서 바로 교체할 수 있게 하기 위한 것이다.
 * 마스터 본인의 PIN(MASTER_PIN)은 여기서 바꿀 수 없다 — Vercel 환경변수에서만 바꾼다.
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
  const [name, setName] = useState(appName);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setBusy(true);
    const res = await api('/api/master', { action: 'appName', value: name.trim(), email: getStoredEmail() });
    setBusy(false);
    toast(res.msg ?? (res.ok ? '바꿨습니다.' : '바꾸지 못했습니다.'), !res.ok);
    if (res.ok) onChanged();
  }

  async function savePin() {
    if (pin !== pin2) {
      toast('두 번 입력한 PIN이 서로 다릅니다.', true);
      return;
    }
    setBusy(true);
    const res = await api('/api/master', { action: 'adminPin', value: pin, email: getStoredEmail() });
    setBusy(false);
    toast(res.msg ?? (res.ok ? '바꿨습니다.' : '바꾸지 못했습니다.'), !res.ok);
    if (res.ok) {
      setPin('');
      setPin2('');
    }
  }

  return (
    <>
      <div className="sect">👑 마스터관리자 전용</div>
      <div className="card">
        <div className="field">
          <label className="fl" htmlFor="appName">
            앱 이름
          </label>
          <input
            id="appName"
            type="text"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn block"
            style={{ marginTop: 10 }}
            disabled={busy || !name.trim() || name.trim() === appName}
            onClick={saveName}
          >
            앱 이름 바꾸기
          </button>
          <p className="hint">앱 상단에 표시되는 이름입니다. 모든 사람에게 바로 반영됩니다.</p>
        </div>

        <div className="field" style={{ borderTop: '1px solid var(--line)' }}>
          <label className="fl" htmlFor="newPin">
            새 관리자 PIN
          </label>
          <input
            id="newPin"
            type="password"
            autoComplete="new-password"
            placeholder="6~32자 (비우면 환경변수 PIN으로 복귀)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="한 번 더 입력"
            style={{ marginTop: 8 }}
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
          />
          <button className="btn warn block" style={{ marginTop: 10 }} disabled={busy} onClick={savePin}>
            {busy ? '처리 중…' : '관리자 PIN 바꾸기'}
          </button>
          <p className="hint">
            관리자가 바뀔 때 쓰세요. 바꾸는 즉시 기존 관리자는 <strong>다음 로그인부터</strong> 새 PIN이
            필요합니다 (이미 잠금 해제된 기기는 30일 세션이 끝날 때까지 유지되므로, 급하면 그 사람에게
            [관리] 탭에서 잠그도록 알려주세요).
            <br />
            마스터 PIN 자체는 Vercel 환경변수 <code>MASTER_PIN</code> 에서만 바꿉니다.
          </p>
        </div>
      </div>
    </>
  );
}
