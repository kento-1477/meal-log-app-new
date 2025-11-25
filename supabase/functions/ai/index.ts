import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { requireAuth } from '../_shared/auth.ts';

const app = createApp();

app.get('/health', (c) => c.json({ ok: true, service: 'ai' }));

// プレースホルダー: 簡易エコーのチャットAPI（将来の実装までの暫定）
app.post('/api/chat', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const message = (body as { message?: string }).message ?? '';
  if (!message) {
    throw new HttpError('メッセージを入力してください', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }
  return c.json({
    ok: true,
    reply: `（仮応答）メッセージを受け取りました: ${message}`,
  });
});

export default app;
