import type { RenderNode } from './common';
import { classifySsPlugin } from './common';

/** URL-safe base64（SIP002 / v2rayN 标准：`+/` → `-_`，去 `=`） */
function b64url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 通用 URI 列表输出（v2rayN / Shadowrocket / Surge 等都能吃） */
export function renderUris(nodes: RenderNode[], base64Wrap: boolean): string {
  const lines = nodes.map(buildUri).join('\n');
  return base64Wrap ? btoa(unescape(encodeURIComponent(lines))) : lines;
}

function name(n: RenderNode): string {
  return encodeURIComponent(n.name);
}

function buildUri(n: RenderNode): string {
  switch (n.type) {
    case 'vless': {
      const q = new URLSearchParams({ encryption: 'none', type: n.network });
      if (n.flow) q.set('flow', n.flow);
      if (n.tls) {
        q.set('security', n.reality ? 'reality' : 'tls');
        q.set('sni', n.serverName);
        if (n.insecure) q.set('allowInsecure', '1');
        if (n.reality) {
          q.set('pbk', n.realityPublicKey);
          q.set('sid', n.realityShortId);
          q.set('fp', 'chrome');
        }
      } else {
        q.set('security', 'none');
      }
      applyStream(q, n);
      return `vless://${n.uuid}@${n.host}:${n.port}?${q}#${name(n)}`;
    }
    case 'vmess': {
      const conf = {
        v: '2',
        ps: n.name,
        add: n.host,
        port: String(n.port),
        id: n.uuid,
        aid: '0',
        scy: 'auto',
        net: n.network,
        type: 'none',
        host: n.network === 'ws' ? n.wsHost : n.network === 'h2' ? n.h2Host : '',
        path: n.network === 'ws' ? n.wsPath : n.network === 'h2' ? n.h2Path : n.network === 'grpc' ? n.grpcService : '',
        tls: n.tls ? 'tls' : '',
        sni: n.tls ? n.serverName : '',
      };
      return `vmess://${b64url(JSON.stringify(conf))}`;
    }
    case 'trojan': {
      const q = new URLSearchParams({
        security: n.reality ? 'reality' : 'tls',
        sni: n.serverName,
        type: n.network,
      });
      if (n.insecure) q.set('allowInsecure', '1');
      if (n.reality) {
        q.set('pbk', n.realityPublicKey);
        q.set('sid', n.realityShortId);
        q.set('fp', 'chrome');
      }
      applyStream(q, n);
      return `trojan://${encodeURIComponent(n.password)}@${n.host}:${n.port}?${q}#${name(n)}`;
    }
    case 'shadowsocks': {
      const userinfo = b64url(`${n.ssCipher}:${n.password}`);
      let uri = `ss://${userinfo}@${n.host}:${n.port}`;
      if (n.ssPlugin && n.ssPluginOpts) {
        // SIP002 插件参数：obfs 别名归一为标准本地插件名 obfs-local
        const pluginName = classifySsPlugin(n.ssPlugin) === 'obfs' ? 'obfs-local' : n.ssPlugin;
        uri += `/?plugin=${encodeURIComponent(`${pluginName};${n.ssPluginOpts}`)}`;
      }
      return `${uri}#${name(n)}`;
    }
    case 'hysteria': {
      const scheme = n.hysteriaVersion === 1 ? 'hysteria' : 'hysteria2';
      const q = new URLSearchParams({ sni: n.serverName, insecure: n.insecure ? '1' : '0' });
      if (n.obfsType) {
        q.set('obfs', n.obfsType);
        q.set('obfs-password', n.obfsPassword);
      }
      return `${scheme}://${encodeURIComponent(n.password)}@${n.host}:${n.port}?${q}#${name(n)}`;
    }
    case 'tuic': {
      const q = new URLSearchParams({
        sni: n.serverName,
        congestion_control: n.tuicCongestion,
        alpn: 'h3',
        udp_relay_mode: 'native',
      });
      return `tuic://${n.uuid}:${encodeURIComponent(n.password)}@${n.host}:${n.port}?${q}#${name(n)}`;
    }
    default:
      return `ss://${btoa(`${n.ssCipher}:${n.password}`)}@${n.host}:${n.port}#${name(n)}`;
  }
}

function applyStream(q: URLSearchParams, n: RenderNode): void {
  if (n.network === 'ws') {
    q.set('path', n.wsPath);
    q.set('host', n.wsHost);
  } else if (n.network === 'grpc') {
    q.set('serviceName', n.grpcService);
  } else if (n.network === 'h2') {
    q.set('path', n.h2Path);
    q.set('host', n.h2Host);
  }
}
