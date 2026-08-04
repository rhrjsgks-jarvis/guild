'use client';

import { useEffect, useState } from 'react';
import { api, getStoredEmail, setStoredEmail } from '@/lib/client';
import ShareCard from './ShareCard';
import RosterCard from './RosterCard';
import ToolsCard from './ToolsCard';

export default function AdminTab({
  admin,
  unit,
  onAuthChange,
  toast,
}: {
  admin: boolean;
  unit: string;
  onAuthChange: () => void;
  toast: (msg: string, isError?: boolean) => void;
}) {
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
    toast(res.msg ?? (res.ok ? '로그인되었습니다.' : '로그인에 실패했습니다.'), !res.ok);
    if (res.ok) onAuthChange();
  }

  async function logout() {
    setBusy(true);
    const res = await api('/api/admin/logout', {});
    setBusy(false);
    toast(res.msg ?? '로그아웃했습니다.');
    onAuthChange();
  }

  return (
    <div className="page">
      <div className="sect">{admin ? '🔓 관리자 모드' : '🔒 관리자 인증'}</div>

      <div className="card">
        {admin ? (
          <div className="field">
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>
              관리자 모드가 켜져 있습니다. [잔액] 탭에서 <strong>지급</strong>, [아이템] 탭에서{' '}
              <strong>등록 · 분배</strong>를 할 수 있습니다.
            </p>
            <p className="hint">이 기기에서 30일간 유지됩니다. 공용 기기라면 쓰고 나서 꼭 잠가주세요.</p>
            <button className="btn danger block" style={{ marginTop: 14 }} disabled={busy} onClick={logout}>
              🔒 관리자 모드 잠그기
            </button>
          </div>
        ) : (
          <div className="field">
            <label className="fl" htmlFor="pin">
              관리자 PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="PIN 입력"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void login();
              }}
            />
            <button className="btn block" style={{ marginTop: 12 }} disabled={busy || !pin} onClick={login}>
              {busy ? '확인 중…' : '🔓 잠금 해제'}
            </button>
            <p className="hint">
              PIN 없이도 잔액·아이템 현황은 자유롭게 볼 수 있습니다. 등록·분배·지급만 관리자 전용입니다.
            </p>
          </div>
        )}
      </div>

      <ShareCard toast={toast} />

      {/* 아이디 관리와 기록용 이메일은 쓰기 작업을 하는 관리자에게만 의미가 있다 */}
      {admin ? (
        <>
          <RosterCard unit={unit} onChanged={onAuthChange} toast={toast} />

          <ToolsCard unit={unit} onChanged={onAuthChange} toast={toast} />

          <div className="sect">📧 기록용 이메일</div>
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
                  toast(email.trim() ? `저장했습니다: ${email.trim()}` : '이메일을 지웠습니다.');
                }}
              >
                저장
              </button>
              <p className="hint">
                누가 등록·분배·지급했는지 시트 [작업기록]에 남기기 위한 값입니다. 이 기기에만 저장되고 다른
                사람에게 보이지 않습니다.
              </p>
            </div>
          </div>
        </>
      ) : null}

      <div className="sect">📲 앱처럼 쓰기</div>
      <div className="card">
        <div className="field">
          {standalone ? (
            <p style={{ fontSize: 14 }}>✅ 홈 화면 앱으로 실행 중입니다.</p>
          ) : (
            <p style={{ fontSize: 13.5, lineHeight: 1.7 }}>
              <strong>iPhone</strong> — 사파리 하단 공유(⬆️) → &ldquo;홈 화면에 추가&rdquo;
              <br />
              <strong>Android</strong> — 크롬 우측 상단 ⋮ → &ldquo;앱 설치&rdquo; 또는 &ldquo;홈 화면에 추가&rdquo;
            </p>
          )}
          <p className="hint">홈 화면에서 열면 주소창 없이 전체화면으로 뜹니다.</p>
        </div>
      </div>

      <div className="sect">🩺 설정 점검</div>
      <div className="card">
        <div className="field">
          <a className="btn ghost block" href="/api/health" target="_blank" rel="noreferrer">
            연결 상태 확인하기
          </a>
          <p className="hint">
            화면이 계속 안 뜬다면 여기서 어떤 환경변수가 비었는지, 구글시트 연결이 되는지 바로 볼 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
