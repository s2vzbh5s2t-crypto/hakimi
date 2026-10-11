import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Server } from '@/lib/api';

const TYPES = ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria', 'tuic'] as const;

const TYPE_PRESETS: Record<string, unknown> = {
  vless: {
    network: 'ws',
    network_settings: { path: '/ws', host: 'example.com' },
    tls: 1,
    tls_settings: { server_name: 'example.com' },
    flow: '',
  },
  vmess: {
    network: 'ws',
    network_settings: { path: '/ws', host: 'example.com' },
    tls: 1,
    tls_settings: { server_name: 'example.com' },
  },
  trojan: {
    network: 'tcp',
    tls: 1,
    tls_settings: { server_name: 'example.com' },
  },
  shadowsocks: {
    cipher: 'aes-128-gcm',
    plugin: null,
    plugin_opts: null,
  },
  hysteria: {
    version: 2,
    tls: { server_name: 'example.com' },
    bandwidth: { up: 100, down: 100 },
    obfs: { open: false, type: 'salamander', password: '' },
  },
  tuic: {
    version: 5,
    tls: { server_name: 'example.com' },
    congestion_control: 'bbr',
  },
};

type FormState = {
  name: string;
  code: string;
  type: string;
  host: string;
  port: string;
  server_port: string;
  sort: string;
  tags: string;
  ps: string;
};

function toForm(s?: Server): FormState {
  return {
    name: s?.name ?? '',
    code: s?.code ?? '',
    type: s?.type ?? 'vless',
    host: s?.host ?? '',
    port: s?.port ?? '',
    server_port: s ? String(s.server_port) : '',
    sort: s ? String(s.sort) : '0',
    tags: (s?.tags ?? []).join(','),
    ps: JSON.stringify(s?.protocol_settings ?? TYPE_PRESETS.vless, null, 2),
  };
}

function ServerDialog({
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
  const [form, setForm] = useState<FormState>(() => toForm(editing ?? undefined));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    let protocolSettings: unknown;
    try {
      protocolSettings = JSON.parse(form.ps || '{}');
    } catch {
      toast.error('protocol_settings 不是合法 JSON');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        code: form.code || null,
        type: form.type,
        host: form.host,
        port: form.port,
        server_port: Number(form.server_port || 0),
        sort: Number(form.sort || 0),
        tags: form.tags
          .split(/[,，]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        protocol_settings: protocolSettings,
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
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑节点 #${editing.id}` : '新建节点'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>名称</Label>
            <Input value={form.name} placeholder="香港-01" onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Code（可选别名，后端 NodeID 可填它）</Label>
            <Input value={form.code} placeholder="hk01" onChange={(e) => set({ code: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>类型</Label>
            <Select
              value={form.type}
              onValueChange={(v) => set({ type: v, ps: JSON.stringify(TYPE_PRESETS[v] ?? {}, null, 2) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>地址 host</Label>
            <Input value={form.host} placeholder="hk.example.com" onChange={(e) => set({ host: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>客户端端口 port（可填 1000-2000 动态）</Label>
            <Input value={form.port} placeholder="443" onChange={(e) => set({ port: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>服务端口 server_port</Label>
            <Input
              type="number"
              value={form.server_port}
              placeholder="8443"
              onChange={(e) => set({ server_port: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>排序</Label>
            <Input type="number" value={form.sort} onChange={(e) => set({ sort: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>标签（逗号分隔）</Label>
            <Input value={form.tags} placeholder="香港,IEPL" onChange={(e) => set({ tags: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>协议参数 protocol_settings（JSON）</Label>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => set({ ps: JSON.stringify(TYPE_PRESETS[form.type] ?? {}, null, 2) })}
            >
              填入 {form.type} 预设
            </Button>
          </div>
          <Textarea
            className="min-h-48 font-mono text-xs"
            spellCheck={false}
            value={form.ps}
            onChange={(e) => set({ ps: e.target.value })}
          />
        </div>
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

export function ServersView() {
  const [servers, setServers] = useState<Server[]>([]);
  const [editing, setEditing] = useState<Server | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    try {
      setServers(await api<Server[]>('/api/admin/servers'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(s: Server) {
    if (!window.confirm(`确认删除节点「${s.name}」？`)) return;
    try {
      await api(`/api/admin/servers/${s.id}`, { method: 'DELETE' });
      toast.success('已删除');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">节点</h2>
        <Button
          className="cursor-pointer"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus /> 新建节点
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>端口</TableHead>
              <TableHead>服务端口</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  暂无节点，点右上角新建
                </TableCell>
              </TableRow>
            )}
            {servers.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.id}</TableCell>
                <TableCell className="font-mono text-xs">{s.code ?? '—'}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{s.type}</Badge>
                </TableCell>
                <TableCell>{s.host}</TableCell>
                <TableCell>{s.port}</TableCell>
                <TableCell>{s.server_port}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      setEditing(s);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer text-destructive hover:text-destructive"
                    onClick={() => remove(s)}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ServerDialog
        key={editing?.id ?? 'new'}
        editing={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </div>
  );
}
