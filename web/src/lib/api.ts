/** 管理 API 客户端 */

export type Server = {
  id: number;
  code: string | null;
  name: string;
  type: string;
  group_ids: string[];
  tags: string[];
  sort: number;
  host: string;
  port: string;
  server_port: number;
  protocol_settings: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};

export type User = {
  id: number;
  email: string;
  uuid: string;
  enabled: number;
  created_at: number;
};

export type SubFilter = { types?: string[]; keywords?: string[]; server_ids?: number[] };

export type Subscription = {
  id: number;
  name: string;
  token: string;
  user_id: number;
  filter_json: SubFilter;
  created_at: number;
};

export type Settings = {
  server_token: string;
  subscribe_path: string;
  push_interval: number;
  pull_interval: number;
};

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (res.status === 401 && !path.includes('/login')) {
    window.dispatchEvent(new Event('hakimi:logout'));
    throw new Error('登录已过期');
  }
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  return (json?.data ?? json) as T;
}
