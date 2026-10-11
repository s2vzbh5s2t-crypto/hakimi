import type { RenderNode } from './common';
import { classifySsPlugin } from './common';

/** sing-box 配置输出 */
export function renderSingBox(nodes: RenderNode[]): string {
  const outbounds = nodes.map(buildOutbound);
  const tags = nodes.map((n) => n.name);
  const doc = {
    log: { level: 'info' },
    outbounds: [
      ...outbounds,
      { type: 'selector', tag: 'proxy', outbounds: ['auto', ...tags] },
      {
        type: 'urltest',
        tag: 'auto',
        outbounds: tags,
        url: 'https://www.gstatic.com/generate_204',
        interval: '5m',
      },
      { type: 'direct', tag: 'direct' },
    ],
    route: { final: 'proxy' },
  };
  return JSON.stringify(doc, null, 2);
}

function transport(n: RenderNode): Record<string, unknown> | undefined {
  if (n.network === 'ws') {
    return { type: 'ws', path: n.wsPath, headers: { Host: n.wsHost } };
  }
  if (n.network === 'grpc') {
    return { type: 'grpc', service_name: n.grpcService };
  }
  if (n.network === 'h2') {
    return { type: 'http', path: n.h2Path, host: [n.h2Host] };
  }
  return undefined;
}

function tlsBlock(n: RenderNode): Record<string, unknown> {
  return {
    enabled: true,
    server_name: n.serverName,
    insecure: n.insecure,
    ...(n.reality
      ? { reality: { enabled: true, public_key: n.realityPublicKey, short_id: n.realityShortId } }
      : {}),
  };
}

function buildOutbound(n: RenderNode): Record<string, unknown> {
  const base: Record<string, unknown> = { tag: n.name, server: n.host, server_port: n.port };

  switch (n.type) {
    case 'vless': {
      const t = transport(n);
      return {
        ...base,
        type: 'vless',
        uuid: n.uuid,
        ...(n.flow ? { flow: n.flow } : {}),
        ...(n.tls ? { tls: tlsBlock(n) } : {}),
        ...(t ? { transport: t } : {}),
      };
    }
    case 'vmess': {
      const t = transport(n);
      return {
        ...base,
        type: 'vmess',
        uuid: n.uuid,
        security: 'auto',
        alter_id: 0,
        ...(n.tls ? { tls: tlsBlock(n) } : {}),
        ...(t ? { transport: t } : {}),
      };
    }
    case 'trojan': {
      const t = transport(n);
      return {
        ...base,
        type: 'trojan',
        password: n.password,
        tls: tlsBlock(n),
        ...(t ? { transport: t } : {}),
      };
    }
    case 'shadowsocks':
      return {
        ...base,
        type: 'shadowsocks',
        method: n.ssCipher,
        password: n.password,
        ...(n.ssPlugin && n.ssPluginOpts
          ? {
              plugin: classifySsPlugin(n.ssPlugin) === 'obfs' ? 'obfs' : n.ssPlugin,
              plugin_opts: n.ssPluginOpts,
            }
          : {}),
      };
    case 'hysteria':
      return {
        ...base,
        type: 'hysteria2',
        password: n.password,
        up_mbps: n.upMbps,
        down_mbps: n.downMbps,
        ...(n.obfsType ? { obfs: { type: 'salamander', password: n.obfsPassword } } : {}),
        tls: tlsBlock(n),
      };
    case 'tuic':
      return {
        ...base,
        type: 'tuic',
        uuid: n.uuid,
        password: n.password,
        congestion_control: n.tuicCongestion,
        tls: tlsBlock(n),
      };
    default:
      return { ...base, type: 'shadowsocks', method: n.ssCipher, password: n.password };
  }
}
