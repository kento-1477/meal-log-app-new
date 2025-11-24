import { createApp, HTTP_STATUS } from '../_shared/http.ts';
import { requireAuth } from '../_shared/auth.ts';

const app = createApp();

app.get('/health', (c) => c.json({ ok: true, service: 'ai' }));

app.all('*', requireAuth, (c) =>
  c.json({ error: 'AI endpoints are migrating to Supabase Edge. Not implemented yet.' }, HTTP_STATUS.NOT_IMPLEMENTED),
);

export default app;
