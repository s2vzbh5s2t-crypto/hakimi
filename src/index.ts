import { Hono } from 'hono';
import type { AppEnv } from './types';
import { serverApi } from './routes/serverapi';
import { adminApi } from './routes/admin';
import { subRoutes } from './routes/sub';

const app = new Hono<AppEnv>();

app.route('/', serverApi);
app.route('/', adminApi);
app.route('/', subRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ message: String(err.message ?? err) }, 500);
});

// 其余请求交给静态资源（web/）
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
