import type { ProtocolSettings, ServerRow } from '../types';
import { deriveServerKey, ss2022KeySize } from '../util';

/** 动态端口："1000-2000" → 随机取一个（对齐 Helper::randomPort） */
export function resolvePort(port: string): number {
  const [minStr, maxStr] = String(port).split('-', 2);
  let min = parseInt(minStr, 10) || 0;
  let max = parseInt(maxStr ?? minStr, 10) || min;
  if (min > max) [min, max] = [max, min];
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function parseSettings(row: ServerRow): ProtocolSettings {
  try {
    return JSON.parse(row.protocol_settings || '{}');
  } catch {
    return {};
  }
}

/** protocol_settings 里可能是对象的字段 → Record（tls 之类字段是多态的） */
function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** SS2022 的 server_key（对齐 Xboard buildNodeConfig；哈希换 SHA-256，两端一致即可） */
export async function ss2022ServerKey(row: ServerRow, cipher: string | null | undefined): Promise<string | null> {
  const size = ss2022KeySize(cipher ?? null);
  return size ? deriveServerKey(row.created_at, size) : null;
}

/**
 * 后端拉取的节点配置。
 * 结构照抄 Xboard `ServerService::buildNodeConfig`（PLAN.md §6.3）。
 * 另附 base_config（push_interval / pull_interval，后端轮询节奏）。
 */
export async function buildNodeConfig(row: ServerRow): Promise<Record<string, unknown>> {
  const ps = parseSettings(row);
  const tls = Number(ps.tls ?? 0);

  const base: Record<string, unknown> = {
    protocol: row.type,
    listen_ip: '0.0.0.0',
    server_port: Number(row.server_port),
    network: ps.network ?? null,
    networkSettings: ps.network_settings ?? null,
  };

  switch (row.type) {
    case 'shadowsocks':
      base.cipher = ps.cipher ?? null;
      base.plugin = ps.plugin ?? null;
      base.plugin_opts = ps.plugin_opts ?? null;
      base.server_key = await ss2022ServerKey(row, ps.cipher);
      break;
    case 'vmess':
      base.tls = tls;
      base.tls_settings = ps.tls_settings ?? null;
      base.multiplex = ps.multiplex ?? null;
      break;
    case 'trojan':
      base.host = row.host || null;
      base.server_name = rec(ps.tls_settings)?.server_name ?? null;
      base.multiplex = ps.multiplex ?? null;
      base.tls = tls;
      base.tls_settings = tls === 2 ? ps.reality_settings ?? null : ps.tls_settings ?? null;
      break;
    case 'vless':
      base.tls = tls;
      base.flow = ps.flow ?? null;
      base.decryption = ps.encryption?.enabled ? ps.encryption?.decryption ?? null : null;
      base.tls_settings = tls === 2 ? ps.reality_settings ?? null : ps.tls_settings ?? null;
      base.multiplex = ps.multiplex ?? null;
      break;
    case 'hysteria': {
      const version = Number(ps.version ?? 2);
      base.version = version;
      base.host = row.host || null;
      base.server_name = rec(ps.tls)?.server_name ?? null;
      base.tls_settings = ps.tls ?? null;
      base.up_mbps = Number(ps.bandwidth?.up ?? 100);
      base.down_mbps = Number(ps.bandwidth?.down ?? 100);
      if (version === 1) {
        base.obfs = ps.obfs?.password ?? null;
      } else {
        base.obfs = ps.obfs?.open ? ps.obfs?.type ?? null : null;
        base['obfs-password'] = ps.obfs?.password ?? null;
      }
      break;
    }
    case 'tuic':
      base.version = Number(ps.version ?? 5);
      base.server_name = rec(ps.tls)?.server_name ?? null;
      base.congestion_control = ps.congestion_control ?? 'bbr';
      base.tls_settings = ps.tls ?? null;
      base.auth_timeout = '3s';
      base.zero_rtt_handshake = false;
      base.heartbeat = '3s';
      break;
    default:
      break;
  }

  return base;
}
