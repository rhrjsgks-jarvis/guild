import { endAdminSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  await endAdminSession();
  return Response.json({ ok: true, msg: '🔒 관리자 모드를 껐습니다.' });
}
