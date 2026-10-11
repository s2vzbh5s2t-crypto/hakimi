/** 加解密与随机工具（全部基于 WebCrypto） */

const enc = new TextEncoder();

export function bytesToHex(buf: ArrayBufferLike): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha1Hex(text: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-1', enc.encode(text)));
}

export async function sha256Hex(text: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newUuidV4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function b64(text: string): string {
  return btoa(text);
}

/* ---------- 口令哈希：PBKDF2-SHA256 ---------- */

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key,
    256,
  );
  return `pbkdf2$100000$${bytesToHex(salt.buffer)}$${bytesToHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const candidate = await hashPassword(password, parts[2]);
  // 恒定时间比较
  const a = candidate.split('$')[3];
  const b = parts[3];
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* ---------- 密码派生（对齐 Xboard 形状，见 PLAN.md §6.3） ----------
 * Xboard: serverKey = base64(substr(md5(created_at), 0, size))
 *         userKey   = base64(substr(uuid, 0, size))
 * 本实现用 SHA-256 替代 MD5（WebCrypto 无 MD5）；因为 config 下发的 server_key
 * 与订阅输出的密码都由本面板生成，两端一致即可互通，不依赖具体哈希算法。
 */

export function ss2022KeySize(cipher: string | null | undefined): number | null {
  if (cipher === '2022-blake3-aes-128-gcm') return 16;
  if (cipher === '2022-blake3-aes-256-gcm') return 32;
  return null;
}

export async function deriveServerKey(createdAt: number, size: number): Promise<string> {
  return b64((await sha256Hex(String(createdAt))).slice(0, size));
}

export function deriveUserKey(uuid: string, size: number): string {
  return b64(uuid.slice(0, size));
}
