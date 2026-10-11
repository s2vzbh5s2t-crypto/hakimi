import type { ServerRow, UserRow, SubRow } from './types';

/* ---------- settings ---------- */

export async function getSetting(db: D1Database, key: string, def = ''): Promise<string> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? def;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

export async function getSettingInt(db: D1Database, key: string, def: number): Promise<number> {
  const v = await getSetting(db, key, String(def));
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/* ---------- sessions ---------- */

export async function createSession(db: D1Database, tokenHash: string, ttlSeconds: number): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO sessions (token_hash, expires_at) VALUES (?, ?)')
    .bind(tokenHash, Math.floor(Date.now() / 1000) + ttlSeconds)
    .run();
}

export async function validSession(db: D1Database, tokenHash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT expires_at FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Math.floor(Date.now() / 1000);
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

/* ---------- servers ---------- */

export async function listServers(db: D1Database): Promise<ServerRow[]> {
  const res = await db.prepare('SELECT * FROM servers ORDER BY sort ASC, id ASC').all<ServerRow>();
  return res.results ?? [];
}

/** 后端拉取的节点查找：code 优先于 id 匹配 */
export async function getServer(db: D1Database, idOrCode: string | number): Promise<ServerRow | null> {
  return db
    .prepare(
      `SELECT * FROM servers WHERE code = ? OR id = ?
       ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END LIMIT 1`,
    )
    .bind(String(idOrCode), Number(idOrCode) || -1, String(idOrCode))
    .first<ServerRow>();
}

/* ---------- users ---------- */

export async function listUsers(db: D1Database): Promise<UserRow[]> {
  const res = await db.prepare('SELECT * FROM users ORDER BY id ASC').all<UserRow>();
  return res.results ?? [];
}

export async function getUser(db: D1Database, id: number): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

/** 对齐 Xboard ServerService::getAvailableUsers 的可用性口径（单人版：启用即可用） */
export async function getAvailableUsers(db: D1Database): Promise<UserRow[]> {
  const res = await db.prepare('SELECT * FROM users WHERE enabled = 1 ORDER BY id ASC').all<UserRow>();
  return res.results ?? [];
}

/* ---------- subscriptions ---------- */

export async function listSubs(db: D1Database): Promise<SubRow[]> {
  const res = await db.prepare('SELECT * FROM subscriptions ORDER BY id ASC').all<SubRow>();
  return res.results ?? [];
}

export async function getSubByToken(db: D1Database, token: string): Promise<SubRow | null> {
  return db.prepare('SELECT * FROM subscriptions WHERE token = ?').bind(token).first<SubRow>();
}
