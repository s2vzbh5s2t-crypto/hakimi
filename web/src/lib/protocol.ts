/** protocol_settings 的表单模型（照 Xboard 后台的字段组织） */

export type ProtoForm = {
  // vless / vmess / trojan：传输层与 TLS
  network: string; // tcp | ws | grpc | h2
  wsPath: string;
  wsHost: string;
  grpcService: string;
  h2Path: string;
  h2Host: string;
  tlsMode: number; // 0 无 | 1 TLS | 2 Reality
  sni: string;
  allowInsecure: boolean;
  flow: string; // vless：空 / xtls-rprx-vision
  realityServerNames: string; // 逗号分隔
  realityDest: string;
  realityPrivateKey: string;
  realityPublicKey: string;
  realityShortId: string;
  // shadowsocks
  cipher: string;
  ssPlugin: string; // 无 | obfs | v2ray-plugin | shadow-tls | restls
  obfsMode: string;
  obfsHost: string;
  v2Mode: string;
  v2Tls: boolean;
  v2Host: string;
  v2Path: string;
  stHost: string;
  stPassword: string;
  stVersion: string;
  rsHost: string;
  rsPassword: string;
  rsScript: string;
  // hysteria
  hyVersion: number; // 1 | 2
  hySni: string;
  upMbps: string;
  downMbps: string;
  obfsOpen: boolean;
  obfsType: string;
  obfsPassword: string;
  // tuic
  tuicVersion: number;
  tuicSni: string;
  congestion: string;
};

type AnyObj = Record<string, any>;

export function defaultProtoForm(): ProtoForm {
  return {
    network: 'tcp',
    wsPath: '/',
    wsHost: '',
    grpcService: '',
    h2Path: '/',
    h2Host: '',
    tlsMode: 0,
    sni: '',
    allowInsecure: false,
    flow: 'none',
    realityServerNames: '',
    realityDest: '',
    realityPrivateKey: '',
    realityPublicKey: '',
    realityShortId: '',
    cipher: 'aes-128-gcm',
    ssPlugin: 'none',
    obfsMode: 'http',
    obfsHost: '',
    v2Mode: 'websocket',
    v2Tls: false,
    v2Host: '',
    v2Path: '/',
    stHost: '',
    stPassword: '',
    stVersion: '2',
    rsHost: '',
    rsPassword: '',
    rsScript: '123',
    hyVersion: 2,
    hySni: '',
    upMbps: '100',
    downMbps: '100',
    obfsOpen: false,
    obfsType: 'salamander',
    obfsPassword: '',
    tuicVersion: 5,
    tuicSni: '',
    congestion: 'bbr',
  };
}

/** `obfs=http;obfs-host=x` → {obfs:"http","obfs-host":"x"} */
export function parseOptsString(opts: string): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const pair of opts.split(';')) {
    if (!pair.trim()) continue;
    const idx = pair.indexOf('=');
    if (idx === -1) out[pair.trim()] = true;
    else out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

function classifyPlugin(raw: string): string {
  const p = raw.toLowerCase().trim();
  if (['obfs', 'obfs-local', 'simple-obfs', 'simpleobfs', 'simple obfs'].includes(p)) return 'obfs';
  if (p === 'v2ray-plugin') return 'v2ray-plugin';
  if (p === 'shadow-tls' || p === 'shadowtls') return 'shadow-tls';
  if (p === 'restls') return 'restls';
  return raw ? 'obfs' : 'none';
}

/** protocol_settings JSON → 表单 */
export function formFromSettings(ps: AnyObj): ProtoForm {
  const f = defaultProtoForm();
  const ns = (ps.network_settings ?? {}) as AnyObj;
  const tlsNum = Number(ps.tls ?? 0);
  const reality = (ps.reality_settings ?? {}) as AnyObj;
  const tlsSettings = (ps.tls_settings ?? {}) as AnyObj;

  f.network = typeof ps.network === 'string' ? ps.network : 'tcp';
  f.wsPath = String(ns.path ?? '/');
  f.wsHost = String(ns.headers?.Host ?? ns.host ?? '');
  f.grpcService = String(ns.serviceName ?? ns.service_name ?? '');
  f.h2Path = String(ns.path ?? '/');
  f.h2Host = String(ns.host ?? '');

  if (['vless', 'vmess', 'trojan'].includes(String(ps.__type ?? '')) || true) {
    f.tlsMode = Number.isFinite(tlsNum) ? tlsNum : 0;
    f.sni = String(tlsSettings.server_name ?? '');
    f.allowInsecure = !!tlsSettings.allow_insecure || !!reality.allow_insecure;
    f.flow = String(ps.flow ?? '') || 'none';
    f.realityServerNames = Array.isArray(reality.server_names) ? reality.server_names.join(', ') : '';
    f.realityDest = String(reality.dest ?? '');
    f.realityPrivateKey = String(reality.private_key ?? '');
    f.realityPublicKey = String(reality.public_key ?? '');
    f.realityShortId = String(reality.short_id ?? '');
  }

  f.cipher = String(ps.cipher ?? 'aes-128-gcm');
  f.ssPlugin = 'none';
  if (ps.plugin) {
    const kind = classifyPlugin(String(ps.plugin));
    const opts = parseOptsString(String(ps.plugin_opts ?? ''));
    f.ssPlugin = kind === 'none' ? 'none' : kind;
    if (kind === 'obfs') {
      f.obfsMode = String((opts.obfs ?? opts.mode) || 'http');
      f.obfsHost = String(opts['obfs-host'] ?? opts.host ?? '');
    } else if (kind === 'v2ray-plugin') {
      f.v2Mode = String(opts.mode ?? 'websocket');
      f.v2Tls = 'tls' in opts || 'server' in opts;
      f.v2Host = String(opts.host ?? '');
      f.v2Path = String(opts.path ?? '/');
    } else if (kind === 'shadow-tls') {
      f.stHost = String(opts.host ?? '');
      f.stPassword = String(opts.password ?? '');
      f.stVersion = String(opts.version ?? '2');
    } else if (kind === 'restls') {
      f.rsHost = String(opts.host ?? '');
      f.rsPassword = String(opts.password ?? '');
      f.rsScript = String(opts['restls-script'] ?? '123');
    }
  }

  f.hyVersion = Number(ps.version ?? 2) === 1 ? 1 : 2;
  const hyTls = (ps.tls ?? {}) as AnyObj;
  f.hySni = String(hyTls.server_name ?? '');
  f.upMbps = String((ps.bandwidth as AnyObj)?.up ?? 100);
  f.downMbps = String((ps.bandwidth as AnyObj)?.down ?? 100);
  const obfs = (ps.obfs ?? {}) as AnyObj;
  f.obfsOpen = !!obfs.open;
  f.obfsType = String(obfs.type ?? 'salamander');
  f.obfsPassword = String(obfs.password ?? '');

  f.tuicVersion = Number(ps.version ?? 5) === 4 ? 4 : 5;
  const tuicTls = (ps.tls ?? {}) as AnyObj;
  f.tuicSni = String(tuicTls.server_name ?? '');
  f.congestion = String(ps.congestion_control ?? 'bbr');

  return f;
}

/** 表单 → protocol_settings JSON（表单未管理的高级字段原样保留） */
export function settingsFromForm(type: string, f: ProtoForm, original: AnyObj = {}): AnyObj {
  const managed = new Set([
    'network', 'network_settings', 'tls', 'tls_settings', 'reality_settings', 'flow',
    'cipher', 'plugin', 'plugin_opts', 'version', 'bandwidth', 'obfs', 'congestion_control',
  ]);
  const out: AnyObj = {};
  for (const [k, v] of Object.entries(original)) {
    if (!managed.has(k)) out[k] = v;
  }

  const networkSettings = (): AnyObj | null => {
    if (f.network === 'ws') return { path: f.wsPath || '/', headers: { Host: f.wsHost } };
    if (f.network === 'grpc') return { serviceName: f.grpcService };
    if (f.network === 'h2') return { path: f.h2Path || '/', host: f.h2Host };
    return null;
  };

  if (['vless', 'vmess', 'trojan'].includes(type)) {
    out.network = f.network;
    out.network_settings = networkSettings();
    out.tls = f.tlsMode;
    if (f.tlsMode === 2) {
      // Reality：allow_insecure / server_name 写入 reality_settings（对齐 Xboard 语义）
      out.tls_settings = {
        ...((original.tls_settings as AnyObj) ?? {}),
        server_name: f.sni,
        allow_insecure: f.allowInsecure,
      };
      out.reality_settings = {
        ...((original.reality_settings as AnyObj) ?? {}),
        allow_insecure: f.allowInsecure,
        server_name: f.sni,
        server_names: f.realityServerNames.split(/[,，]+/).map((s) => s.trim()).filter(Boolean),
        dest: f.realityDest,
        private_key: f.realityPrivateKey,
        public_key: f.realityPublicKey,
        short_id: f.realityShortId,
      };
    } else {
      out.tls_settings = {
        ...((original.tls_settings as AnyObj) ?? {}),
        server_name: f.sni,
        allow_insecure: f.allowInsecure,
      };
      if (original.reality_settings) out.reality_settings = original.reality_settings;
    }
    if (type === 'vless') out.flow = f.flow === 'none' ? '' : f.flow;
  }

  if (type === 'shadowsocks') {
    out.cipher = f.cipher;
    out.plugin = f.ssPlugin === 'none' ? null : f.ssPlugin;
    out.plugin_opts = buildPluginOpts(f);
  }

  if (type === 'hysteria') {
    out.version = f.hyVersion;
    out.tls = { ...((original.tls as AnyObj) ?? {}), server_name: f.hySni };
    out.bandwidth = { up: Number(f.upMbps || 0), down: Number(f.downMbps || 0) };
    out.obfs = { open: f.obfsOpen, type: f.obfsType, password: f.obfsPassword };
  }

  if (type === 'tuic') {
    out.version = f.tuicVersion;
    out.tls = { ...((original.tls as AnyObj) ?? {}), server_name: f.tuicSni };
    out.congestion_control = f.congestion;
  }

  return out;
}

function buildPluginOpts(f: ProtoForm): string | null {
  switch (f.ssPlugin) {
    case 'obfs':
      return `obfs=${f.obfsMode || 'http'};obfs-host=${f.obfsHost}`;
    case 'v2ray-plugin': {
      const parts = [`mode=${f.v2Mode || 'websocket'}`];
      if (f.v2Tls) parts.push('tls');
      if (f.v2Host) parts.push(`host=${f.v2Host}`);
      parts.push(`path=${f.v2Path || '/'}`);
      return parts.join(';');
    }
    case 'shadow-tls': {
      const parts = [];
      if (f.stHost) parts.push(`host=${f.stHost}`);
      if (f.stPassword) parts.push(`password=${f.stPassword}`);
      parts.push(`version=${f.stVersion || '2'}`);
      return parts.join(';');
    }
    case 'restls': {
      const parts = [];
      if (f.rsHost) parts.push(`host=${f.rsHost}`);
      if (f.rsPassword) parts.push(`password=${f.rsPassword}`);
      parts.push(`restls-script=${f.rsScript || '123'}`);
      return parts.join(';');
    }
    default:
      return null;
  }
}
