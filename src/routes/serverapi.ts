import { Hono } from 'hono';
import type { AppEnv, ServerRow } from '../types';
import { getServer, getAvailableUsers, getSetting, getSettingInt } from '../db';
import { buildNodeConfig, parseSettings } from '../services/node';
import { deriveUserSecret, toBackendUser } from '../services/users';
import { sha1Hex } from '../util';

/**
 * 后端 API 兼容层：照抄 Xboard（PLAN.md §6.3）。
 * - 拉取类（config/user）实装
 * - 上报类（push/alive/status/submit/report）收单即弃，返回各端点要求的成功体
 */

type ApiEnv = AppEnv & {
  Variables: {
    node: ServerRow | null;
  };
};

export const serverApi = new Hono<ApiEnv>();

/* ---------- 认证（对齐 Middleware/Server.php 与 ServerV2.php） ---------- */

async function authV1(c: any, next: () => Promise<void>) {
  const token = c.req.query('token') ?? '';
  const nodeId = c.req.query('node_id');
  const expected = await getSetting(c.env.DB, 'server_token');
  if (!expected || token !== expected) return c.json({ message: 'Invalid token' }, 401);
  if (!nodeId) return c.json({ message: 'node_id is required' }, 422);
  const node = await getServer(c.env.DB, nodeId);
  if (!node) return c.json({ message: 'Server does not exist' }, 404);
  c.set('node', node);
  await next();
}

/** v2：token + node_id；handshake 允许 node_id 为空 */
async function authV2(c: any, next: () => Promise<void>) {
  const token = c.req.query('token') ?? c.req.header('x-node-token') ?? '';
  const expected = await getSetting(c.env.DB, 'server_token');
  if (!expected || token !== expected) return c.json({ message: 'Invalid token' }, 401);
  const nodeId = c.req.query('node_id');
  const isHandshake = new URL(c.req.url).pathname.endsWith('/handshake');
  if (!nodeId && !isHandshake) return c.json({ message: 'node_id is required' }, 422);
  if (nodeId) {
    const node = await getServer(c.env.DB, nodeId);
    if (!node) return c.json({ message: 'Server does not exist' }, 404);
    c.set('node', node);
  }
  await next();
}

/* ---------- ETag（对齐 sha1(json) + If-None-Match 子串比较） ---------- */

async function etagRespond(c: any, payload: unknown): Promise<Response> {
  const body = JSON.stringify(payload);
  const tag = await sha1Hex(body);
  const inm = c.req.header('If-None-Match') ?? '';
  if (inm && inm.includes(tag)) return c.body(null, 304);
  return c.body(body, 200, {
    'Content-Type': 'application/json',
    ETag: `"${tag}"`,
  });
}

const OK_DATA = { data: true, code: 0, message: 'success' };

/* ---------- UniProxy 族 ---------- */

// GET config —— 节点配置 + base_config
serverApi.get('/api/v1/server/UniProxy/config', authV1, async (c) => {
  const node = c.get('node')!;
  const config = await buildNodeConfig(node);
  config.base_config = {
    push_interval: await getSettingInt(c.env.DB, 'push_interval', 60),
    pull_interval: await getSettingInt(c.env.DB, 'pull_interval', 60),
  };
  return etagRespond(c, config);
});

// GET user —— 凭据表（SS 节点把派生后的密码放进 uuid 字段，见 services/users.ts）
serverApi.get('/api/v1/server/UniProxy/user', authV1, async (c) => {
  const node = c.get('node')!;
  const users = await getAvailableUsers(c.env.DB);
  const out = [];
  for (const u of users) {
    const item = toBackendUser(u);
    if (node.type === 'shadowsocks') item.uuid = await deriveUserSecret(node, u);
    out.push(item);
  }
  return etagRespond(c, { users: out });
});

// POST push —— 流量上报，body: [[uid, bytes], ...]，弃收
serverApi.post('/api/v1/server/UniProxy/push', authV1, async (c) => {
  await c.req.json().catch(() => null);
  return c.json(OK_DATA);
});

// POST alive —— 在线上报，弃收
serverApi.post('/api/v1/server/UniProxy/alive', authV1, async (c) => {
  await c.req.json().catch(() => null);
  return c.json({ data: true });
});

// POST status —— 机器状态，弃收
serverApi.post('/api/v1/server/UniProxy/status', authV1, async (c) => {
  await c.req.json().catch(() => null);
  return c.json(OK_DATA);
});

// GET alivelist —— 设备限制用，单人版恒为空
serverApi.get('/api/v1/server/UniProxy/alivelist', authV1, (c) => {
  return c.json({ alive: {} });
});

/* ---------- Tidalab 族（tidalab-trojan / tidalab-ss） ---------- */

// trojan-go 风格配置（对齐 TrojanTidalabController::getTrojanConfig）
serverApi.get('/api/v1/server/TrojanTidalab/config', authV1, async (c) => {
  const node = c.get('node')!;
  if (node.type !== 'trojan') return c.json({ message: '节点不存在' }, 400);
  const ps = parseSettings(node);
  const localPort = parseInt(c.req.query('local_port') ?? '1', 10) || 1;
  return c.json({
    run_type: 'server',
    local_addr: '0.0.0.0',
    local_port: Number(node.server_port),
    remote_addr: 'www.taobao.com',
    remote_port: 80,
    password: [],
    ssl: {
      cert: '/root/.cert/server.crt',
      key: '/root/.cert/server.key',
      sni: ps.server_name ?? node.host ?? null,
    },
    api: { enabled: true, api_addr: '127.0.0.1', api_port: localPort },
  });
});

serverApi.get('/api/v1/server/TrojanTidalab/user', authV1, async (c) => {
  const node = c.get('node')!;
  if (node.type !== 'trojan') return c.json({ message: '节点不存在' }, 400);
  const users = await getAvailableUsers(c.env.DB);
  const data = users.map((u) => {
    const item = toBackendUser(u) as Record<string, unknown>;
    item.trojan_user = { password: u.uuid }; // 对齐 Xboard：trojan 密码 = uuid
    delete item.uuid;
    return item;
  });
  return etagRespond(c, { msg: 'ok', data });
});

serverApi.get('/api/v1/server/ShadowsocksTidalab/user', authV1, async (c) => {
  const node = c.get('node')!;
  const ps = parseSettings(node);
  const users = await getAvailableUsers(c.env.DB);
  const data = [];
  for (const u of users) {
    data.push({
      id: u.id,
      port: Number(node.server_port),
      cipher: ps.cipher ?? null,
      secret: await deriveUserSecret(node, u),
    });
  }
  return etagRespond(c, { data });
});

// submit —— 流量上报，body: [{user_id, u, d}, ...]，弃收
for (const p of ['/api/v1/server/TrojanTidalab/submit', '/api/v1/server/ShadowsocksTidalab/submit']) {
  serverApi.post(p, authV1, async (c) => {
    await c.req.json().catch(() => null);
    return c.json({ ret: 1, msg: 'ok' });
  });
}

/* ---------- v2 族（handshake / report） ---------- */

// handshake —— websocket 恒为关闭（纯中枢不提供长连接通道）
serverApi.on(['GET', 'POST'], '/api/v2/server/handshake', authV2, (c) => {
  return c.json({ websocket: { enabled: false } });
});

// report —— 合并上报（traffic/alive/online/status/metrics），弃收
serverApi.post('/api/v2/server/report', authV2, async (c) => {
  await c.req.json().catch(() => null);
  return c.json({ data: true });
});

// v2 复用 UniProxy 的处理器
serverApi.get('/api/v2/server/config', authV2, async (c) => {
  const node = c.get('node')!;
  const config = await buildNodeConfig(node);
  config.base_config = {
    push_interval: await getSettingInt(c.env.DB, 'push_interval', 60),
    pull_interval: await getSettingInt(c.env.DB, 'pull_interval', 60),
  };
  return etagRespond(c, config);
});

serverApi.get('/api/v2/server/user', authV2, async (c) => {
  const node = c.get('node')!;
  const users = await getAvailableUsers(c.env.DB);
  const out = [];
  for (const u of users) {
    const item = toBackendUser(u);
    if (node.type === 'shadowsocks') item.uuid = await deriveUserSecret(node, u);
    out.push(item);
  }
  return etagRespond(c, { users: out });
});

serverApi.post('/api/v2/server/push', authV2, async (c) => {
  await c.req.json().catch(() => null);
  return c.json(OK_DATA);
});

serverApi.post('/api/v2/server/alive', authV2, async (c) => {
  await c.req.json().catch(() => null);
  return c.json({ data: true });
});

serverApi.post('/api/v2/server/status', authV2, async (c) => {
  await c.req.json().catch(() => null);
  return c.json(OK_DATA);
});

serverApi.get('/api/v2/server/alivelist', authV2, (c) => {
  return c.json({ alive: {} });
});
