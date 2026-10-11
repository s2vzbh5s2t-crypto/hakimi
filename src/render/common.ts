import type { ProtocolSettings, ServerRow, UserRow } from '../types';
import { deriveUserSecret } from '../services/users';
import { parseSettings, resolvePort } from '../services/node';

/** 订阅渲染的归一化节点 */
export type RenderNode = {
  name: string;
  type: string;
  host: string;
  port: number;
  uuid: string; // vless/vmess/tuic 用 uuid；trojan 密码 = uuid；ss 密码 = 派生
  password: string; // trojan/ss 实际密码
  ps: ProtocolSettings;
  network: string; // tcp | ws | grpc | h2
  tls: boolean;
  reality: boolean;
  serverName: string;
  insecure: boolean;
  wsPath: string;
  wsHost: string;
  grpcService: string;
  h2Path: string;
  h2Host: string;
  flow: string;
  realityPublicKey: string;
  realityShortId: string;
  ssCipher: string;
  ssPlugin: string;
  ssPluginOpts: string;
  hysteriaVersion: number;
  upMbps: number;
  downMbps: number;
  obfsType: string;
  obfsPassword: string;
  tuicCongestion: string;
};

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/** 多态字段（如 tls 有时是数字有时是对象）→ Record */
function rec(v: unknown): Record<string, any> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null;
}

export async function buildRenderNodes(servers: ServerRow[], user: UserRow): Promise<RenderNode[]> {
  const out: RenderNode[] = [];
  for (const row of servers) {
    const ps = parseSettings(row);
    const ns = (ps.network_settings ?? {}) as Record<string, any>;
    const tlsNum = Number(ps.tls ?? 0);
    const isWs = ps.network === 'ws';
    const isGrpc = ps.network === 'grpc';
    const isH2 = ps.network === 'h2' || ps.network === 'http';
    const reality = tlsNum === 2;
    const tlsSettings = (reality ? ps.reality_settings : ps.tls_settings) as Record<string, any> | null;
    const hyTls = (ps.tls ?? {}) as Record<string, any>;

    const secret = await deriveUserSecret(row, user);

    // insecure：vless/vmess/trojan 从 tls_settings/reality_settings 读；hysteria/tuic 从 tls.allow_insecure 读
    const hyTuicTls = rec(ps.tls);
    const insecure =
      row.type === 'hysteria' || row.type === 'tuic'
        ? !!hyTuicTls?.allow_insecure
        : !!tlsSettings?.allow_insecure;

    out.push({
      name: row.name,
      type: row.type,
      host: row.host,
      port: resolvePort(row.port || String(row.server_port)),
      uuid: user.uuid,
      password: secret,
      ps,
      network: isWs ? 'ws' : isGrpc ? 'grpc' : isH2 ? 'h2' : 'tcp',
      tls: row.type === 'trojan' ? true : tlsNum >= 1,
      reality,
      serverName: str(tlsSettings?.server_name ?? hyTls?.server_name ?? ps.server_name) || row.host,
      insecure,
      wsPath: str(ns.path) || '/',
      wsHost: str(ns.headers?.Host ?? ns.host) || row.host,
      grpcService: str(ns.serviceName ?? ns.service_name),
      h2Path: str(ns.path) || '/',
      h2Host: str(ns.host) || row.host,
      flow: str(ps.flow),
      realityPublicKey: str(ps.reality_settings?.public_key),
      realityShortId: str(ps.reality_settings?.short_id),
      ssCipher: str(ps.cipher) || 'aes-128-gcm',
      ssPlugin: str(ps.plugin),
      ssPluginOpts: str(ps.plugin_opts),
      hysteriaVersion: Number(ps.version ?? 2),
      upMbps: Number(ps.bandwidth?.up ?? 100),
      downMbps: Number(ps.bandwidth?.down ?? 100),
      obfsType: ps.obfs?.open ? str(ps.obfs?.type) || 'salamander' : '',
      obfsPassword: str(ps.obfs?.password),
      tuicCongestion: str(ps.congestion_control) || 'cubic',
    });
  }
  return out;
}

/* ---------- SS 插件工具（对齐 Xboard ClashMeta::buildShadowsocks） ---------- */

/** 插件名归一：Simple Obfs / obfs-local 等别名 → obfs */
export function classifySsPlugin(raw: string): 'obfs' | 'v2ray-plugin' | 'shadow-tls' | 'restls' | 'other' {
  const p = raw.toLowerCase().trim();
  if (['obfs', 'obfs-local', 'simple-obfs', 'simpleobfs', 'simple obfs'].includes(p)) return 'obfs';
  if (p === 'v2ray-plugin') return 'v2ray-plugin';
  if (p === 'shadow-tls' || p === 'shadowtls') return 'shadow-tls';
  if (p === 'restls') return 'restls';
  return 'other';
}

/** `obfs=http;obfs-host=xxx;path=/` → {obfs:"http", "obfs-host":"xxx", path:"/"} */
export function parsePluginOpts(opts: string): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const pair of opts.split(';')) {
    if (!pair.trim()) continue;
    const idx = pair.indexOf('=');
    if (idx === -1) out[pair.trim()] = true;
    else out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

/* ---------- 极简 YAML 输出（字符串一律双引号，合法 YAML） ---------- */

export function toYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const body = toYaml(item, indent + 2);
          return `${pad}- ${body.slice(indent + 2)}`;
        }
        return `${pad}- ${scalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        if (v !== null && typeof v === 'object') {
          const nested = toYaml(v, indent + 2);
          return `${pad}${k}:\n${nested}`;
        }
        return `${pad}${k}: ${scalar(v)}`;
      })
      .join('\n');
  }
  return `${pad}${scalar(value)}`;
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v));
}
