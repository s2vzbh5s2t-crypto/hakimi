import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../types';
import { VALID_TYPES, normalizeType } from '../types';
import {
  createSession,
  deleteSession,
  getServer,
  getSetting,
  getSettingInt,
  listServers,
  listSubs,
  listUsers,
  setSetting,
  validSession,
} from '../db';
import { hashPassword, newUuidV4, randomHex, sha256Hex, verifyPassword } from '../util';
import { DEFAULT_CLASH_TEMPLATE } from '../render/clash';
import { parse as parseYaml } from 'yaml';

export const adminApi = new Hono<AppEnv>();

const SESSION_TTL = 30 * 24 * 3600;

function parseJson(text: string | null, def: unknown): unknown {
  if (!text) return def;
  try {
    return JSON.parse(text);
  } catch {
    return def;
  }
}

/* ---------- 管理鉴权 ---------- */

async function adminAuth(c: any, next: () => Promise<void>) {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : getCookie(c, 'session') ?? '';
  if (!token || !(await validSession(c.env.DB, await sha256Hex(token)))) {
    return c.json({ message: 'unauthorized' }, 401);
  }
  await next();
}

/* ---------- 初始化与登录 ---------- */

adminApi.get('/api/admin/me', async (c) => {
  const configured = !!(await getSetting(c.env.DB, 'password_hash'));
  const token = getCookie(c, 'session') ?? '';
  const authed = token ? await validSession(c.env.DB, await sha256Hex(token)) : false;
  return c.json({ data: { configured, authed } });
});

// 首次初始化：设置管理密码 + 生成通信密钥
adminApi.post('/api/admin/setup', async (c) => {
  if (await getSetting(c.env.DB, 'password_hash')) return c.json({ message: 'already configured' }, 400);
  const { password } = await c.req.json();
  if (!password || String(password).length < 8) return c.json({ message: '密码至少 8 位' }, 422);
  await setSetting(c.env.DB, 'password_hash', await hashPassword(String(password)));
  await setSetting(c.env.DB, 'server_token', randomHex(24));
  await setSetting(c.env.DB, 'subscribe_path', 's');
  await setSetting(c.env.DB, 'push_interval', '60');
  await setSetting(c.env.DB, 'pull_interval', '60');
  return c.json({ data: true });
});

adminApi.post('/api/admin/login', async (c) => {
  const { password } = await c.req.json();
  const stored = await getSetting(c.env.DB, 'password_hash');
  if (!stored || !(await verifyPassword(String(password ?? ''), stored))) {
    return c.json({ message: '密码错误' }, 401);
  }
  const token = randomHex(32);
  await createSession(c.env.DB, await sha256Hex(token), SESSION_TTL);
  setCookie(c, 'session', token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSION_TTL });
  return c.json({ data: { token } });
});

adminApi.post('/api/admin/logout', adminAuth, async (c) => {
  const token = getCookie(c, 'session') ?? '';
  if (token) await deleteSession(c.env.DB, await sha256Hex(token));
  setCookie(c, 'session', '', { httpOnly: true, secure: true, path: '/', maxAge: 0 });
  return c.json({ data: true });
});

/* ---------- 节点 CRUD ---------- */

function serverPayload(body: any) {
  const type = normalizeType(body.type);
  if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
    throw new Error('不支持的节点类型');
  }
  return {
    code: body.code ? String(body.code) : null,
    name: String(body.name ?? '').trim() || 'unnamed',
    type,
    group_ids: JSON.stringify(body.group_ids ?? []),
    tags: JSON.stringify(body.tags ?? []),
    sort: Number(body.sort ?? 0),
    host: String(body.host ?? ''),
    port: String(body.port ?? ''),
    server_port: Number(body.server_port ?? 0),
    protocol_settings: JSON.stringify(body.protocol_settings ?? {}),
  };
}

adminApi.get('/api/admin/servers', adminAuth, async (c) => {
  const rows = await listServers(c.env.DB);
  return c.json({
    data: rows.map((r) => ({
      ...r,
      group_ids: parseJson(r.group_ids, []),
      tags: parseJson(r.tags, []),
      protocol_settings: parseJson(r.protocol_settings, {}),
    })),
  });
});

adminApi.post('/api/admin/servers', adminAuth, async (c) => {
  try {
    const p = serverPayload(await c.req.json());
    const now = Math.floor(Date.now() / 1000);
    const res = await c.env.DB
      .prepare(
        `INSERT INTO servers (code, name, type, group_ids, tags, sort, host, port, server_port,
                              protocol_settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(p.code, p.name, p.type, p.group_ids, p.tags, p.sort, p.host, p.port, p.server_port,
        p.protocol_settings, now, now)
      .run();
    return c.json({ data: { id: res.meta.last_row_id } }, 201);
  } catch (e) {
    return c.json({ message: String((e as Error).message ?? e) }, 422);
  }
});

adminApi.put('/api/admin/servers/:id', adminAuth, async (c) => {
  try {
    const p = serverPayload(await c.req.json());
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB
      .prepare(
        `UPDATE servers SET code=?, name=?, type=?, group_ids=?, tags=?, sort=?, host=?, port=?,
                            server_port=?, protocol_settings=?, updated_at=? WHERE id=?`,
      )
      .bind(p.code, p.name, p.type, p.group_ids, p.tags, p.sort, p.host, p.port, p.server_port,
        p.protocol_settings, now, Number(c.req.param('id')))
      .run();
    return c.json({ data: true });
  } catch (e) {
    return c.json({ message: String((e as Error).message ?? e) }, 422);
  }
});

// 复制节点（code 不复制——它有唯一约束，副本别名由用户自己填）
adminApi.post('/api/admin/servers/:id/duplicate', adminAuth, async (c) => {
  const src = await getServer(c.env.DB, Number(c.req.param('id')));
  if (!src) return c.json({ message: '节点不存在' }, 404);
  const now = Math.floor(Date.now() / 1000);
  const res = await c.env.DB
    .prepare(
      `INSERT INTO servers (code, name, type, group_ids, tags, sort, host, port, server_port,
                            protocol_settings, created_at, updated_at)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `${src.name} 副本`,
      src.type,
      src.group_ids,
      src.tags,
      src.sort,
      src.host,
      src.port,
      src.server_port,
      src.protocol_settings,
      now,
      now,
    )
    .run();
  return c.json({ data: { id: res.meta.last_row_id } }, 201);
});

adminApi.delete('/api/admin/servers/:id', adminAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ data: true });
});

/* ---------- 用户（凭据）CRUD ---------- */

adminApi.get('/api/admin/users', adminAuth, async (c) => {
  return c.json({ data: await listUsers(c.env.DB) });
});

adminApi.post('/api/admin/users', adminAuth, async (c) => {
  const body = await c.req.json();
  const email = String(body.email ?? '').trim();
  if (!email) return c.json({ message: 'email 不能为空' }, 422);
  const uuid = String(body.uuid ?? '').trim() || newUuidV4();
  const now = Math.floor(Date.now() / 1000);
  const res = await c.env.DB
    .prepare('INSERT INTO users (email, uuid, enabled, created_at) VALUES (?, ?, ?, ?)')
    .bind(email, uuid, body.enabled === false ? 0 : 1, now)
    .run();
  return c.json({ data: { id: res.meta.last_row_id, uuid } }, 201);
});

adminApi.put('/api/admin/users/:id', adminAuth, async (c) => {
  const body = await c.req.json();
  await c.env.DB
    .prepare('UPDATE users SET email=?, uuid=?, enabled=? WHERE id=?')
    .bind(String(body.email), String(body.uuid), body.enabled === false ? 0 : 1, Number(c.req.param('id')))
    .run();
  return c.json({ data: true });
});

adminApi.delete('/api/admin/users/:id', adminAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ data: true });
});

/* ---------- 订阅 CRUD ---------- */

adminApi.get('/api/admin/subscriptions', adminAuth, async (c) => {
  const rows = await listSubs(c.env.DB);
  return c.json({
    data: rows.map((r) => ({ ...r, filter_json: parseJson(r.filter_json, {}) })),
  });
});

adminApi.post('/api/admin/subscriptions', adminAuth, async (c) => {
  const body = await c.req.json();
  const token = randomHex(24);
  const now = Math.floor(Date.now() / 1000);
  const res = await c.env.DB
    .prepare('INSERT INTO subscriptions (name, token, user_id, filter_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(String(body.name ?? 'sub'), token, Number(body.user_id ?? 0), JSON.stringify(body.filter ?? {}), now)
    .run();
  return c.json({ data: { id: res.meta.last_row_id, token } }, 201);
});

adminApi.put('/api/admin/subscriptions/:id', adminAuth, async (c) => {
  const body = await c.req.json();
  await c.env.DB
    .prepare('UPDATE subscriptions SET name=?, user_id=?, filter_json=? WHERE id=?')
    .bind(String(body.name), Number(body.user_id), JSON.stringify(body.filter ?? {}), Number(c.req.param('id')))
    .run();
  return c.json({ data: true });
});

// 轮换订阅 token
adminApi.post('/api/admin/subscriptions/:id/rotate', adminAuth, async (c) => {
  const token = randomHex(24);
  await c.env.DB
    .prepare('UPDATE subscriptions SET token=? WHERE id=?')
    .bind(token, Number(c.req.param('id')))
    .run();
  return c.json({ data: { token } });
});

adminApi.delete('/api/admin/subscriptions/:id', adminAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ data: true });
});

/* ---------- 设置 ---------- */

adminApi.get('/api/admin/settings', adminAuth, async (c) => {
  return c.json({
    data: {
      server_token: await getSetting(c.env.DB, 'server_token'),
      subscribe_path: await getSetting(c.env.DB, 'subscribe_path', 's'),
      push_interval: await getSettingInt(c.env.DB, 'push_interval', 60),
      pull_interval: await getSettingInt(c.env.DB, 'pull_interval', 60),
      clash_template: await getSetting(c.env.DB, 'clash_template', DEFAULT_CLASH_TEMPLATE),
      clash_template_default: DEFAULT_CLASH_TEMPLATE,
    },
  });
});

adminApi.put('/api/admin/settings', adminAuth, async (c) => {
  const body = await c.req.json();
  if (body.subscribe_path) await setSetting(c.env.DB, 'subscribe_path', String(body.subscribe_path).replace(/^\/+|\/+$/g, '') || 's');
  if (body.push_interval) await setSetting(c.env.DB, 'push_interval', String(Math.max(30, Number(body.push_interval) || 60)));
  if (body.pull_interval) await setSetting(c.env.DB, 'pull_interval', String(Math.max(30, Number(body.pull_interval) || 60)));
  if (typeof body.clash_template === 'string') {
    // Xboard 注入语义：模板是普通 YAML，渲染时自动注入节点；这里只校验 YAML 合法性
    try {
      const parsed = parseYaml(body.clash_template);
      if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('not a mapping');
    } catch {
      return c.json({ message: '模板不是合法的 YAML 配置' }, 422);
    }
    await setSetting(c.env.DB, 'clash_template', body.clash_template);
  }
  return c.json({ data: true });
});

// 轮换通信密钥（后端需同步更新 ApiKey）
adminApi.post('/api/admin/settings/server-token/rotate', adminAuth, async (c) => {
  const token = randomHex(24);
  await setSetting(c.env.DB, 'server_token', token);
  return c.json({ data: { server_token: token } });
});
