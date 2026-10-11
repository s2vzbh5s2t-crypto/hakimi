export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
};

export type AppEnv = { Bindings: Bindings };

/** Xboard protocol_settings（宽松 JSON，按节点类型取用不同字段） */
export type ProtocolSettings = {
  network?: string | null; // tcp | ws | grpc | h2
  network_settings?: Record<string, unknown> | null;
  tls?: number | string; // 0=无 1=TLS 2=Reality
  tls_settings?: Record<string, unknown> | null;
  reality_settings?: Record<string, unknown> | null;
  flow?: string | null;
  encryption?: { enabled?: boolean; decryption?: string } | null;
  multiplex?: Record<string, unknown> | null;
  cipher?: string | null;
  plugin?: string | null;
  plugin_opts?: string | null;
  version?: number | string; // hysteria: 1|2, tuic: 4|5
  bandwidth?: { up?: number; down?: number } | null;
  obfs?: { open?: boolean; type?: string; password?: string } | null;
  congestion_control?: string | null;
  server_name?: string | null;
} & Record<string, unknown>;

export type ServerRow = {
  id: number;
  code: string | null;
  name: string;
  type: string; // vless | vmess | trojan | shadowsocks | hysteria | tuic
  group_ids: string;
  tags: string;
  sort: number;
  host: string;
  port: string;
  server_port: number;
  protocol_settings: string;
  created_at: number;
  updated_at: number;
};

export type UserRow = {
  id: number;
  email: string;
  uuid: string;
  enabled: number;
  created_at: number;
};

export type SubRow = {
  id: number;
  name: string;
  token: string;
  user_id: number;
  filter_json: string;
  created_at: number;
};

export type SubFilter = {
  types?: string[];
  keywords?: string[];
  server_ids?: number[];
};

export const VALID_TYPES = ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria', 'tuic'] as const;

/** 对齐 Xboard Server::TYPE_ALIASES 的归一化 */
export const TYPE_ALIASES: Record<string, string> = {
  v2ray: 'vmess',
  ss: 'shadowsocks',
  hy2: 'hysteria',
  hysteria2: 'hysteria',
  tuicv5: 'tuic',
};

export function normalizeType(type: string | null | undefined): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  return TYPE_ALIASES[t] ?? t;
}
