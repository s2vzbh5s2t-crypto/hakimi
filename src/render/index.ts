import type { RenderNode } from './common';
import { renderClash } from './clash';
import { renderSingBox } from './singbox';
import { renderUris } from './uri';

export type RenderFormat = 'clash' | 'singbox' | 'uri' | 'uri-b64';

/** UA → 格式识别（对齐 Xboard app/Protocols 的 flag 族，覆盖面从简） */
export function detectFormat(userAgent: string, flag?: string): RenderFormat {
  const f = (flag ?? '').toLowerCase();
  if (f) {
    if (['clash', 'clashmeta', 'meta', 'verge', 'flclash', 'mihomo'].includes(f)) return 'clash';
    if (['sing-box', 'singbox', 'sfm', 'hiddify'].includes(f)) return 'singbox';
    if (['shadowrocket', 'uri', 'surge', 'stash', 'loon', 'quantumultx'].includes(f)) return 'uri';
    return 'uri-b64';
  }
  const ua = userAgent.toLowerCase();
  if (/clash|verge|flclash|mihomo|nekobox|meta/.test(ua)) return 'clash';
  if (/sing-box|singbox|hiddify|sfm|sfi/.test(ua)) return 'singbox';
  if (/shadowrocket|surge|stash|loon|quantumult/.test(ua)) return 'uri';
  return 'uri-b64'; // v2rayN 等默认 base64
}

export function contentTypeFor(format: RenderFormat): string {
  switch (format) {
    case 'clash':
      return 'text/yaml; charset=utf-8';
    case 'singbox':
      return 'application/json; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

export function render(format: RenderFormat, nodes: RenderNode[]): string {
  switch (format) {
    case 'clash':
      return renderClash(nodes);
    case 'singbox':
      return renderSingBox(nodes);
    case 'uri':
      return renderUris(nodes, false);
    case 'uri-b64':
      return renderUris(nodes, true);
  }
}
