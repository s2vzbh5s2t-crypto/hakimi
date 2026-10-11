import { Hono } from 'hono';
import type { AppEnv, SubFilter, SubRow } from '../types';
import { enabledServers, getSubByToken, getUser, getSetting, getSettingInt } from '../db';
import { buildRenderNodes } from '../render/common';
import { contentTypeFor, detectFormat, render } from '../render';

export const subRoutes = new Hono<AppEnv>();

async function serveSub(c: any, token: string): Promise<Response> {
  const sub: SubRow | null = await getSubByToken(c.env.DB, token);
  if (!sub) return c.text('Not Found', 404);

  const user = await getUser(c.env.DB, sub.user_id);
  if (!user || !user.enabled) return c.text('Forbidden', 403);

  let filter: SubFilter = {};
  try {
    filter = JSON.parse(sub.filter_json || '{}');
  } catch {
    filter = {};
  }

  // 查询参数可覆盖订阅自带筛选（对齐 ?types= &filter=）
  const qTypes = (c.req.query('types') ?? '').split(/[|,｜,]+/).filter(Boolean);
  const qKeywords = (c.req.query('filter') ?? '').split(/[|,｜,]+/).filter(Boolean).slice(0, 5);
  const types = qTypes.length ? qTypes : filter.types ?? [];
  const keywords = qKeywords.length ? qKeywords : filter.keywords ?? [];

  let servers = await enabledServers(c.env.DB);
  if (filter.server_ids?.length) {
    servers = servers.filter((s) => filter.server_ids!.includes(s.id));
  }
  if (types.length) {
    servers = servers.filter((s) => types.includes(s.type));
  }
  if (keywords.length) {
    const tags = (s: { tags: string }) => {
      try {
        return JSON.parse(s.tags || '[]') as string[];
      } catch {
        return [];
      }
    };
    servers = servers.filter((s) =>
      keywords.some(
        (k: string) => s.name.toLowerCase().includes(k.toLowerCase()) || tags(s).some((t: string) => t.includes(k)),
      ),
    );
  }

  const nodes = await buildRenderNodes(servers, user);
  const format = detectFormat(c.req.header('User-Agent') ?? '', c.req.query('flag'));
  const body = render(format, nodes);

  return c.body(body, 200, {
    'Content-Type': contentTypeFor(format),
    'Content-Disposition': `attachment; filename="${sub.name || 'subscription'}"`,
    'Profile-Update-Interval': String(await getSettingInt(c.env.DB, 'pull_interval', 60)),
    'Subscription-Userinfo': 'upload=0; download=0; total=0; expire=0',
  });
}

// 标准路径：/s/{token}
subRoutes.get('/s/:token', (c) => serveSub(c, c.req.param('token')));

// 自定义订阅路径（settings.subscribe_path，如 /sub/{token}）
subRoutes.get('/:path/:token', async (c) => {
  const custom = await getSetting(c.env.DB, 'subscribe_path', 's');
  if (c.req.param('path') !== custom) return c.notFound();
  return serveSub(c, c.req.param('token'));
});
