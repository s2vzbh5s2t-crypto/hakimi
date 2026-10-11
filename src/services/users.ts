import type { ServerRow, UserRow } from '../types';
import { deriveUserKey, ss2022KeySize } from '../util';
import { parseSettings, ss2022ServerKey } from './node';

/** 对齐 Xboard ServerService::getAvailableUsers 的出参字段 */
export type BackendUser = {
  id: number;
  uuid: string;
  speed_limit: number;
  device_limit: number;
};

export function toBackendUser(user: UserRow): BackendUser {
  return { id: user.id, uuid: user.uuid, speed_limit: 0, device_limit: 0 };
}

/**
 * 派生用户的实际接入密码（对齐 Xboard Server::generateServerPassword）：
 * - 非 SS：直接 uuid（trojan 密码 = uuid）
 * - SS 经典加密：uuid
 * - SS2022：serverKey:userKey（两端由本面板生成，保持一致）
 */
export async function deriveUserSecret(row: ServerRow, user: UserRow): Promise<string> {
  if (row.type !== 'shadowsocks') return user.uuid;
  const cipher = parseSettings(row).cipher ?? null;
  const size = ss2022KeySize(cipher);
  if (!size) return user.uuid;
  const serverKey = await ss2022ServerKey(row, cipher);
  return `${serverKey}:${deriveUserKey(user.uuid, size)}`;
}
