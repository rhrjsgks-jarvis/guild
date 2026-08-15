'use client';

import { useState } from 'react';
import { api, getStoredEmail } from '@/lib/client';
import type { ApiResult } from '@/lib/client';
import { useT } from '@/lib/i18n';
import LootFields, { type Loot } from './LootFields';
import Sheet from './Sheet';

/**
 * 레이드일·보스·루팅 정보 고치기 (v11.6) — 연합·아이템이 같은 창을 쓴다.
 *
 * ★ **관리자 이상**이면 정산이 끝난 건도 고칠 수 있다. 이 창이 부르는 시트 함수는
 *   새 4칸 말고는 손댈 길이 없어서 금액·인원·상태가 바뀌지 않기 때문이다.
 *   권한을 "누구인가"가 아니라 "무엇을 만질 수 있는가"로 가른다.
 *
 * ★ 아이템명에 몰아 적어둔 것을 **자동으로 쪼개지 않는다.**
 *   `8/14 수룡 / 불변의 목걸이 / 차무식루팅` 에서 '수룡'이 보스인지 아이템인지는
 *   규칙으로 정할 수 없다 — 실제로 3·4번 기록은 같은 자리에 티어가 들어가 있다.
 *   대신 **원문을 그대로 보여주고** 사람이 보고 채우게 한다 (규칙 7).
 */
export default function LootEditSheet({
  title,
  /** 지금 아이템명 — 여기에 몰아 적어둔 내용을 보고 칸을 채운다 */
  source,
  initial,
  servers,
  members,
  onClose,
  onDone,
  toast,
  setBusy,
  /** 연합은 묶음, 아이템은 줄 번호로 찾는다 */
  target,
}: {
  title: string;
  source: string;
  initial: Loot;
  servers: string[];
  members: string[];
  onClose: () => void;
  onDone: (res?: ApiResult) => void;
  toast: (msg: string, isError?: boolean) => void;
  setBusy: (on: boolean) => void;
  target: { kind: 'alliance'; group: string } | { kind: 'item'; row: number };
}) {
  const { t, srv } = useT();
  const [loot, setLoot] = useState<Loot>(initial);

  async function save() {
    setBusy(true);
    const res =
      target.kind === 'alliance'
        ? await api('/api/admin/alliance', { op: 'setMeta', group: target.group, meta: loot, email: getStoredEmail() })
        : await api('/api/admin/item-meta', { row: target.row, meta: loot, email: getStoredEmail() });
    setBusy(false);
    toast(srv(res, res.ok ? 'meta.saveOk' : 'r.failed'), !res.ok);
    if (res.ok) onDone(res);
  }

  return (
    <Sheet title={`🏷️ ${title}`} subtitle={t('loot.editSub')} onClose={onClose}>
      {/* 원문을 그대로 띄운다 — 여기서 보고 아래 칸에 옮겨 적는 것이 이 창의 일이다 */}
      <div className="fl">{t('c.itemName')}</div>
      <div className="note" style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}>
        {source}
      </div>

      <LootFields value={loot} onChange={setLoot} servers={servers} members={members} idPrefix="lootedit" />

      <div className="sheet-actions" style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={onClose}>
          {t('c.cancel')}
        </button>
        <button className="btn" onClick={() => void save()}>
          {t('c.save')}
        </button>
      </div>
    </Sheet>
  );
}
