import { createApp, HTTP_STATUS } from '../_shared/http.ts';
import { getAuthSession, requireAuth } from '../_shared/auth.ts';
import { supabaseAdmin } from '../_shared/supabase.ts';

const app = createApp();

app.get('/health', (c) => c.json({ ok: true, service: 'referral' }));

// 招待リンク生成（ダミー実装: 固定コードとリンクを返す）
app.post('/api/referral/invite-link', requireAuth, async (c) => {
  const user = c.get('user');
  const code = `INV-${(user?.id ?? 0).toString().padStart(6, '0')}`;
  const base = c.req.url.split('/referral')[0];
  const inviteLink = `${base}/invite?code=${code}`;
  const webLink = `https://meal-log.app/invite?code=${code}`;
  return c.json({ inviteLink, webLink, code, message: '招待リンクを作成しました' });
});

// 自分の招待状況（ダミー実装）
app.get('/api/referral/my-status', requireAuth, async (c) => {
  const user = c.get('user');
  const code = `INV-${(user?.id ?? 0).toString().padStart(6, '0')}`;
  const base = c.req.url.split('/referral')[0];
  const inviteLink = `${base}/invite?code=${code}`;
  const webLink = `https://meal-log.app/invite?code=${code}`;
  return c.json({
    inviteCode: code,
    inviteLink,
    webLink,
    stats: {
      totalReferred: 0,
      completedReferred: 0,
      pendingReferred: 0,
      totalPremiumDaysEarned: 0,
    },
    recentReferrals: [],
  });
});

// 招待コード適用（ダミー実装: 成功を返し、PremiumGrantを付与しようと試みる）
app.post('/api/referral/claim', async (c) => {
  const session = await getAuthSession(c);
  const body = await c.req.json().catch(() => ({}));
  const code = String((body as { code?: string }).code ?? '').trim();
  if (!code) {
    return c.json({ error: '招待コードを入力してください' }, HTTP_STATUS.BAD_REQUEST);
  }

  const premiumDays = 14;
  const now = new Date();
  const end = new Date(now.getTime() + premiumDays * 24 * 60 * 60 * 1000);
  if (session?.user?.id) {
    const { error } = await supabaseAdmin.from('PremiumGrant').insert({
      userId: session.user.id,
      source: 'REFERRAL_FRIEND',
      startDate: now.toISOString(),
      endDate: end.toISOString(),
      days: premiumDays,
    });
    if (error) {
      console.error('referral claim: grant insert failed', error);
    }
  }

  return c.json({
    success: true,
    premiumDays,
    premiumUntil: end.toISOString(),
    referrerUsername: 'friend',
    message: '招待コードを適用しました',
  });
});

export default app;
