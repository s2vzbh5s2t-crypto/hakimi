import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { api, type Server } from '@/lib/api';
import {
  defaultProtoForm,
  formFromSettings,
  settingsFromForm,
  type ProtoForm,
} from '@/lib/protocol';

const TYPES = ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria', 'tuic'] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Text({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ServerDialog({
  editing,
  open,
  onOpenChange,
  onSaved,
}: {
  editing: Server | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [type, setType] = useState<string>(editing?.type ?? 'vless');
  const [host, setHost] = useState(editing?.host ?? '');
  const [port, setPort] = useState(editing?.port ?? '');
  const [serverPort, setServerPort] = useState(editing ? String(editing.server_port) : '');
  const [sort, setSort] = useState(editing ? String(editing.sort) : '0');
  const [tags, setTags] = useState((editing?.tags ?? []).join(','));
  const [proto, setProto] = useState<ProtoForm>(() =>
    editing ? formFromSettings(editing.protocol_settings) : defaultProtoForm(),
  );
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<ProtoForm>) => setProto((p) => ({ ...p, ...patch }));
  const isStreamType = type === 'vless' || type === 'vmess' || type === 'trojan';

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name,
        code: code || null,
        type,
        host,
        port,
        server_port: Number(serverPort || 0),
        sort: Number(sort || 0),
        tags: tags.split(/[,，]+/).map((t) => t.trim()).filter(Boolean),
        protocol_settings: settingsFromForm(type, proto, editing?.protocol_settings ?? {}),
      };
      if (editing) await api(`/api/admin/servers/${editing.id}`, { method: 'PUT', body: payload });
      else await api('/api/admin/servers', { method: 'POST', body: payload });
      toast.success('已保存');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑节点 #${editing.id}` : '新建节点'}</DialogTitle>
        </DialogHeader>

        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="名称">
            <Text value={name} onChange={setName} placeholder="香港-01" />
          </Field>
          <Field label="Code（可选别名，后端 NodeID 可填它）">
            <Text value={code} onChange={setCode} placeholder="hk01" />
          </Field>
          <Field label="类型">
            <SelectField
              value={type}
              onChange={setType}
              options={TYPES.map((t) => [t, t] as [string, string])}
            />
          </Field>
          <Field label="地址 host">
            <Text value={host} onChange={setHost} placeholder="hk.example.com" />
          </Field>
          <Field label="客户端端口 port（可填 1000-2000 动态）">
            <Text value={port} onChange={setPort} placeholder="443" />
          </Field>
          <Field label="服务端口 server_port">
            <Text value={serverPort} onChange={setServerPort} placeholder="8443" type="number" />
          </Field>
          <Field label="排序">
            <Text value={sort} onChange={setSort} type="number" />
          </Field>
          <Field label="标签（逗号分隔）">
            <Text value={tags} onChange={setTags} placeholder="香港,IEPL" />
          </Field>
        </div>

        <Separator />

        {/* 传输层 + TLS（vless / vmess / trojan） */}
        {isStreamType && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="传输协议">
                <SelectField
                  value={proto.network}
                  onChange={(v) => set({ network: v })}
                  options={[
                    ['tcp', 'TCP'],
                    ['ws', 'WebSocket'],
                    ['grpc', 'gRPC'],
                    ['h2', 'HTTP/2'],
                  ]}
                />
              </Field>
              {type === 'vless' && (
                <Field label="Flow（XTLS-Vision 才填）">
                  <SelectField
                    value={proto.flow}
                    onChange={(v) => set({ flow: v })}
                    options={[
                      ['none', '无'],
                      ['xtls-rprx-vision', 'xtls-rprx-vision'],
                    ]}
                  />
                </Field>
              )}
            </div>

            {proto.network === 'ws' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="WS path">
                  <Text value={proto.wsPath} onChange={(v) => set({ wsPath: v })} placeholder="/ws" />
                </Field>
                <Field label="WS Host（伪装域名）">
                  <Text value={proto.wsHost} onChange={(v) => set({ wsHost: v })} placeholder="example.com" />
                </Field>
              </div>
            )}
            {proto.network === 'grpc' && (
              <Field label="gRPC serviceName">
                <Text value={proto.grpcService} onChange={(v) => set({ grpcService: v })} placeholder="grpc" />
              </Field>
            )}
            {proto.network === 'h2' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="H2 path">
                  <Text value={proto.h2Path} onChange={(v) => set({ h2Path: v })} placeholder="/" />
                </Field>
                <Field label="H2 Host">
                  <Text value={proto.h2Host} onChange={(v) => set({ h2Host: v })} placeholder="example.com" />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="TLS 模式">
                <SelectField
                  value={String(proto.tlsMode)}
                  onChange={(v) => set({ tlsMode: Number(v) })}
                  options={[
                    ['0', '无'],
                    ['1', 'TLS'],
                    ['2', 'Reality'],
                  ]}
                />
              </Field>
              <Field label="SNI / server_name">
                <Text value={proto.sni} onChange={(v) => set({ sni: v })} placeholder="example.com" />
              </Field>
            </div>

            {proto.tlsMode === 1 && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={proto.allowInsecure}
                  onCheckedChange={(v) => set({ allowInsecure: v === true })}
                />
                允许不安全证书（allow_insecure）
              </label>
            )}

            {proto.tlsMode === 2 && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Reality serverNames（逗号分隔）">
                  <Text value={proto.realityServerNames} onChange={(v) => set({ realityServerNames: v })} placeholder="example.com" />
                </Field>
                <Field label="Reality dest（目标:端口）">
                  <Text value={proto.realityDest} onChange={(v) => set({ realityDest: v })} placeholder="example.com:443" />
                </Field>
                <Field label="PrivateKey">
                  <Text value={proto.realityPrivateKey} onChange={(v) => set({ realityPrivateKey: v })} />
                </Field>
                <Field label="PublicKey">
                  <Text value={proto.realityPublicKey} onChange={(v) => set({ realityPublicKey: v })} />
                </Field>
                <Field label="ShortId">
                  <Text value={proto.realityShortId} onChange={(v) => set({ realityShortId: v })} />
                </Field>
              </div>
            )}
          </div>
        )}

        {/* Shadowsocks */}
        {type === 'shadowsocks' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="加密方式">
                <SelectField
                  value={proto.cipher}
                  onChange={(v) => set({ cipher: v })}
                  options={[
                    ['aes-128-gcm', 'aes-128-gcm'],
                    ['aes-256-gcm', 'aes-256-gcm'],
                    ['chacha20-ietf-poly1305', 'chacha20-ietf-poly1305'],
                    ['2022-blake3-aes-128-gcm', '2022-blake3-aes-128-gcm'],
                    ['2022-blake3-aes-256-gcm', '2022-blake3-aes-256-gcm'],
                  ]}
                />
              </Field>
              <Field label="插件">
                <SelectField
                  value={proto.ssPlugin}
                  onChange={(v) => set({ ssPlugin: v })}
                  options={[
                    ['none', '无'],
                    ['obfs', 'Simple Obfs（obfs）'],
                    ['v2ray-plugin', 'v2ray-plugin'],
                    ['shadow-tls', 'shadow-tls'],
                    ['restls', 'restls'],
                  ]}
                />
              </Field>
            </div>

            {proto.ssPlugin === 'obfs' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="混淆模式">
                  <SelectField
                    value={proto.obfsMode}
                    onChange={(v) => set({ obfsMode: v })}
                    options={[
                      ['http', 'http'],
                      ['tls', 'tls'],
                    ]}
                  />
                </Field>
                <Field label="混淆主机 obfs-host">
                  <Text value={proto.obfsHost} onChange={(v) => set({ obfsHost: v })} placeholder="www.example.com" />
                </Field>
              </div>
            )}
            {proto.ssPlugin === 'v2ray-plugin' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="模式">
                  <SelectField
                    value={proto.v2Mode}
                    onChange={(v) => set({ v2Mode: v })}
                    options={[['websocket', 'websocket']]}
                  />
                </Field>
                <Field label="Host">
                  <Text value={proto.v2Host} onChange={(v) => set({ v2Host: v })} placeholder="example.com" />
                </Field>
                <Field label="Path">
                  <Text value={proto.v2Path} onChange={(v) => set({ v2Path: v })} placeholder="/" />
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Switch checked={proto.v2Tls} onCheckedChange={(v) => set({ v2Tls: v })} /> TLS
                </label>
              </div>
            )}
            {proto.ssPlugin === 'shadow-tls' && (
              <div className="grid grid-cols-3 gap-4">
                <Field label="Host">
                  <Text value={proto.stHost} onChange={(v) => set({ stHost: v })} />
                </Field>
                <Field label="Password">
                  <Text value={proto.stPassword} onChange={(v) => set({ stPassword: v })} />
                </Field>
                <Field label="Version">
                  <Text value={proto.stVersion} onChange={(v) => set({ stVersion: v })} />
                </Field>
              </div>
            )}
            {proto.ssPlugin === 'restls' && (
              <div className="grid grid-cols-3 gap-4">
                <Field label="Host">
                  <Text value={proto.rsHost} onChange={(v) => set({ rsHost: v })} />
                </Field>
                <Field label="Password">
                  <Text value={proto.rsPassword} onChange={(v) => set({ rsPassword: v })} />
                </Field>
                <Field label="restls-script">
                  <Text value={proto.rsScript} onChange={(v) => set({ rsScript: v })} />
                </Field>
              </div>
            )}
          </div>
        )}

        {/* Hysteria */}
        {type === 'hysteria' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <Field label="版本">
                <SelectField
                  value={String(proto.hyVersion)}
                  onChange={(v) => set({ hyVersion: Number(v) })}
                  options={[
                    ['2', 'Hysteria 2'],
                    ['1', 'Hysteria 1'],
                  ]}
                />
              </Field>
              <Field label="SNI / server_name">
                <Text value={proto.hySni} onChange={(v) => set({ hySni: v })} placeholder="example.com" />
              </Field>
              <Field label="混淆类型">
                <SelectField
                  value={proto.obfsType}
                  onChange={(v) => set({ obfsType: v })}
                  options={[['salamander', 'salamander']]}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="上行带宽（Mbps）">
                <Text value={proto.upMbps} onChange={(v) => set({ upMbps: v })} type="number" />
              </Field>
              <Field label="下行带宽（Mbps）">
                <Text value={proto.downMbps} onChange={(v) => set({ downMbps: v })} type="number" />
              </Field>
              <Field label="混淆密码 obfs-password">
                <Text value={proto.obfsPassword} onChange={(v) => set({ obfsPassword: v })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={proto.obfsOpen} onCheckedChange={(v) => set({ obfsOpen: v })} /> 启用混淆（obfs）
            </label>
          </div>
        )}

        {/* TUIC */}
        {type === 'tuic' && (
          <div className="grid grid-cols-3 gap-4">
            <Field label="版本">
              <SelectField
                value={String(proto.tuicVersion)}
                onChange={(v) => set({ tuicVersion: Number(v) })}
                options={[['5', 'TUIC v5']]}
              />
            </Field>
            <Field label="SNI / server_name">
              <Text value={proto.tuicSni} onChange={(v) => set({ tuicSni: v })} placeholder="example.com" />
            </Field>
            <Field label="拥塞控制">
              <SelectField
                value={proto.congestion}
                onChange={(v) => set({ congestion: v })}
                options={[
                  ['bbr', 'bbr'],
                  ['cubic', 'cubic'],
                ]}
              />
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button className="cursor-pointer" disabled={busy} onClick={save}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
