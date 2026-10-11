import type { RenderNode } from './common';
import { toYaml } from './common';

/** Clash / ClashMeta（mihomo）配置输出 */
export function renderClash(nodes: RenderNode[]): string {
  const proxies = nodes.map(buildProxy);
  const names = nodes.map((n) => n.name);

  const doc = {
    'mixed-port': 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    ipv6: false,
    proxies,
    'proxy-groups': [
      { name: 'PROXY', type: 'select', proxies: ['auto', ...names] },
      {
        name: 'auto',
        type: 'url-test',
        proxies: names,
        url: 'https://www.gstatic.com/generate_204',
        interval: 300,
      },
    ],
    rules: ['MATCH,PROXY'],
  };
  return toYaml(doc) + '\n';
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
        ...(n.tls ? { tls: true, servername: n.serverName } : {}),
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
      };
    case 'hysteria':
      if (n.hysteriaVersion === 1) {
        return {
          ...common,
          type: 'hysteria',
          server: n.host,
          port: n.port,
          'auth-str': n.password,
          sni: n.serverName,
          up: n.upMbps,
          down: n.downMbps,
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
