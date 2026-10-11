import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { RenderNode } from './common';
import { classifySsPlugin, parsePluginOpts } from './common';

/**
 * mihomo（Clash.Meta）下发模板——普通 YAML，Xboard 同款注入语义：
 *   1. 生成的节点自动合并进 `proxies`
 *   2. 节点名自动追加进每个策略组的 `proxies`
 *   3. 策略组里写 `/正则/` 条目（带斜杠定界符）= 节点筛选器：
 *      该条目会被移除，替换为名称匹配的节点；含筛选器的组不再追加全部节点
 *   4. 注入后为空的策略组会被移除
 *   5. 规则最前插入 `DOMAIN,<订阅域名>,DIRECT`（防更新订阅走代理成环）
 * 旧版 `{{PROXIES}}` / `{{PROXY_NAMES}}` 占位符写法仍兼容。
 */
export const DEFAULT_CLASH_TEMPLATE = `# Hakimi mihomo 下发模板（Xboard 注入语义，无需占位符）
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info

proxies: []

proxy-groups:
  - name: "Proxies"
    type: select
    proxies:
      - "Auto"
  - name: "Auto"
    type: fallback
    proxies: []
    interval: 300

rules:
  - GEOSITE,private,DIRECT
  - GEOIP,private,DIRECT
  - MATCH,Proxies
`;

/** Clash / ClashMeta（mihomo）配置输出 */
export function renderClash(nodes: RenderNode[], template = DEFAULT_CLASH_TEMPLATE, panelHost = ''): string {
  const built = nodes.map(buildProxy);
  const names = nodes.map((n) => n.name);

  // 旧版占位符写法兼容
  if (template.includes('{{PROXIES}}') || template.includes('{{PROXY_NAMES}}')) {
    const proxiesBlock = nodes.length ? toYamlLegacy(built, 2) : '  []';
    const out = template
      .replaceAll('{{PROXIES}}', proxiesBlock)
      .replaceAll('{{PROXY_NAMES}}', names.map((n) => JSON.stringify(n)).join(', '));
    return out.endsWith('\n') ? out : out + '\n';
  }

  let config: any;
  try {
    config = parseYaml(template) ?? {};
  } catch {
    config = {};
  }
  if (typeof config !== 'object' || Array.isArray(config)) config = {};

  // 1. 节点合并进 proxies
  config.proxies = [...(Array.isArray(config.proxies) ? config.proxies : []), ...built];

  // 2~4. 策略组注入 / 正则筛选 / 空组移除
  const groups: any[] = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : [];
  for (const group of groups) {
    if (!group || typeof group !== 'object') continue;
    const list: string[] = Array.isArray(group.proxies) ? group.proxies.map((v: unknown) => String(v)) : [];
    const filters = list.filter((s) => isRegexLike(s));
    if (filters.length > 0) {
      const kept = list.filter((s) => !isRegexLike(s));
      const matched = names.filter((n) => filters.some((f) => safeMatch(f, n)));
      group.proxies = [...kept, ...matched];
    } else {
      group.proxies = [...list, ...names];
    }
  }
  config['proxy-groups'] = groups.filter((g) => Array.isArray(g?.proxies) && g.proxies.length > 0);

  // 5. 订阅域名直连（对齐 Xboard buildRules）
  if (panelHost && Array.isArray(config.rules)) {
    config.rules = [`DOMAIN,${panelHost},DIRECT`, ...config.rules];
  }

  const out = stringifyYaml(config, { indent: 2, lineWidth: 0 });
  return out.replaceAll('$app_name', 'Hakimi');
}

/** `/pattern/flags` 形式视为正则筛选条目（对齐 Xboard isRegex 的斜杠定界符约定） */
function isRegexLike(s: string): boolean {
  return /^\/[\s\S]+\/[a-z]*$/.test(s);
}

function safeMatch(pattern: string, name: string): boolean {
  const m = pattern.match(/^\/([\s\S]*)\/([a-z]*)$/);
  if (!m) return false;
  try {
    return new RegExp(m[1], m[2]).test(name);
  } catch {
    return false;
  }
}

function buildProxy(n: RenderNode): Record<string, unknown> {
  const common: Record<string, unknown> = { name: n.name, udp: true };
  const stream = streamFields(n);

  switch (n.type) {
    case 'vless':
      return {
        ...common,
        type: 'vless',
        server: n.host,
        port: n.port,
        uuid: n.uuid,
        ...(n.flow ? { flow: n.flow } : {}),
        ...(n.tls
          ? {
              tls: true,
              'skip-cert-verify': n.insecure,
              servername: n.serverName,
              ...(n.reality
                ? {
                    'client-fingerprint': 'chrome',
                    'reality-opts': { 'public-key': n.realityPublicKey, 'short-id': n.realityShortId },
                  }
                : {}),
            }
          : {}),
        ...stream,
      };
    case 'vmess':
      return {
        ...common,
        type: 'vmess',
        server: n.host,
        port: n.port,
        uuid: n.uuid,
        alterId: 0,
        cipher: 'auto',
        ...(n.tls ? { tls: true, 'skip-cert-verify': n.insecure, servername: n.serverName } : {}),
        ...stream,
      };
    case 'trojan':
      return {
        ...common,
        type: 'trojan',
        server: n.host,
        port: n.port,
        password: n.password,
        sni: n.serverName,
        'skip-cert-verify': n.insecure,
        ...(n.reality
          ? {
              'client-fingerprint': 'chrome',
              'reality-opts': { 'public-key': n.realityPublicKey, 'short-id': n.realityShortId },
            }
          : {}),
        ...stream,
      };
    case 'shadowsocks':
      return {
        ...common,
        type: 'ss',
        server: n.host,
        port: n.port,
        cipher: n.ssCipher,
        password: n.password,
        ...ssPluginFields(n),
      };
    case 'hysteria':
      if (n.hysteriaVersion === 1) {
        return {
          ...common,
          type: 'hysteria',
          server: n.host,
          port: n.port,
          auth_str: n.password,
          sni: n.serverName,
          up: n.upMbps,
          down: n.downMbps,
          'skip-cert-verify': n.insecure,
          protocol: 'udp',
          'fast-open': true,
          'disable_mtu_discovery': true,
          ...(n.obfsType ? { obfs: n.obfsPassword } : {}),
        };
      }
      return {
        ...common,
        type: 'hysteria2',
        server: n.host,
        port: n.port,
        password: n.password,
        sni: n.serverName,
        'skip-cert-verify': n.insecure,
        ...(n.obfsType ? { obfs: n.obfsType, 'obfs-password': n.obfsPassword } : {}),
      };
    case 'tuic':
      return {
        ...common,
        type: 'tuic',
        server: n.host,
        port: n.port,
        uuid: n.uuid,
        password: n.password,
        sni: n.serverName,
        'skip-cert-verify': n.insecure,
        'congestion-controller': n.tuicCongestion,
        'udp-relay-mode': 'native',
      };
    default:
      return { ...common, type: 'ss', server: n.host, port: n.port, cipher: n.ssCipher, password: n.password };
  }
}

function streamFields(n: RenderNode): Record<string, unknown> {
  if (n.network === 'ws') {
    return { network: 'ws', 'ws-opts': { path: n.wsPath, headers: { Host: n.wsHost } } };
  }
  if (n.network === 'grpc') {
    return { network: 'grpc', 'grpc-opts': { 'grpc-service-name': n.grpcService } };
  }
  if (n.network === 'h2') {
    return { network: 'h2', 'h2-opts': { path: n.h2Path, host: [n.h2Host] } };
  }
  return {};
}

/** SS 插件 → Clash plugin / plugin-opts（对齐 Xboard ClashMeta::buildShadowsocks 的字段映射） */
function ssPluginFields(n: RenderNode): Record<string, unknown> {
  if (!n.ssPlugin || !n.ssPluginOpts) return {};
  const parsed = parsePluginOpts(n.ssPluginOpts);
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = parsed[k];
      if (typeof v === 'string') return v;
    }
    return undefined;
  };

  switch (classifySsPlugin(n.ssPlugin)) {
    case 'obfs':
      return {
        plugin: 'obfs',
        'plugin-opts': {
          mode: pick('obfs', 'mode') ?? 'http',
          host: pick('obfs-host', 'host') ?? 'www.bing.com',
        },
      };
    case 'v2ray-plugin':
      return {
        plugin: 'v2ray-plugin',
        'plugin-opts': {
          mode: pick('mode') ?? 'websocket',
          tls: 'tls' in parsed || 'server' in parsed,
          ...(pick('host') ? { host: pick('host') } : {}),
          path: pick('path') ?? '/',
          ...('mux' in parsed ? { mux: true } : {}),
          ...(pick('host') ? { headers: { Host: pick('host') } } : {}),
        },
      };
    case 'shadow-tls':
      return {
        plugin: 'shadow-tls',
        'plugin-opts': {
          ...(pick('host') ? { host: pick('host') } : {}),
          ...(pick('password') ? { password: pick('password') } : {}),
          version: parsed.version ? Number(parsed.version) : 2,
        },
      };
    case 'restls':
      return {
        plugin: 'restls',
        'plugin-opts': {
          ...(pick('host') ? { host: pick('host') } : {}),
          ...(pick('password') ? { password: pick('password') } : {}),
          'restls-script': pick('restls-script') ?? '123',
        },
      };
    default:
      return { plugin: n.ssPlugin, 'plugin-opts': parsed };
  }
}

/* ---------- 旧版占位符写法的简易 YAML 输出 ---------- */

function toYamlLegacy(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const body = toYamlLegacy(item, indent + 2);
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
          return `${pad}${k}:\n${toYamlLegacy(v, indent + 2)}`;
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
