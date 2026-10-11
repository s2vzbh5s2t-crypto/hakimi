import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { Copy, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type Subscription, type User } from '@/lib/api';

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
}

function SubDialog({
  editing,
  users,
  open,
  onOpenChange,
  onSaved,
}: {
  editing: Subscription | null;
  users: User[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [userId, setUserId] = useState(String(editing?.user_id ?? users[0]?.id ?? ''));
  const [types, setTypes] = useState((editing?.filter_json?.types ?? []).join(','));
  const [keywords, setKeywords] = useState((editing?.filter_json?.keywords ?? []).join(','));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name,
        user_id: Number(userId),
        filter: {
          types: types.split(/[,，]+/).map((t) => t.trim()).filter(Boolean),
          keywords: keywords.split(/[,，]+/).map((t) => t.trim()).filter(Boolean),
        },
      };
      if (editing) await api(`/api/admin/subscriptions/${editing.id}`, { method: 'PUT', body: payload });
      else await api('/api/admin/subscriptions', { method: 'POST', body: payload });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑订阅 #${editing.id}` : '新建订阅'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>名称</Label>
            <Input value={name} placeholder="我的订阅" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>绑定凭据</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    #{u.id} {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>协议过滤 types（留空=全部，逗号分隔）</Label>
            <Input value={types} placeholder="vless,trojan" onChange={(e) => setTypes(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>关键词过滤（匹配名称/标签）</Label>
            <Input value={keywords} placeholder="香港,IEPL" onChange={(e) => setKeywords(e.target.value)} />
          </div>
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

export function SubsView() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function subUrl(token: string) {
    return `${window.location.origin}/s/${token}`;
  }

  async function load() {
    try {
      const [s, u] = await Promise.all([
        api<Subscription[]>('/api/admin/subscriptions'),
        api<User[]>('/api/admin/users'),
      ]);
      setSubs(s);
      setUsers(u);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function rotate(s: Subscription) {
    if (!window.confirm('轮换后旧链接立即失效，确认？')) return;
    try {
      const d = await api<{ token: string }>(`/api/admin/subscriptions/${s.id}/rotate`, { method: 'POST' });
      copy(subUrl(d.token));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(s: Subscription) {
    if (!window.confirm(`确认删除订阅「${s.name}」？`)) return;
    try {
      await api(`/api/admin/subscriptions/${s.id}`, { method: 'DELETE' });
      toast.success('已删除');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">订阅</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            订阅链接按客户端 UA 自动输出 Clash / sing-box / URI 格式，可加 ?flag= 强制指定。
          </p>
        </div>
        <Button
          className="cursor-pointer"
          onClick={() => {
            if (!users.length) {
              toast.error('请先创建用户凭据');
              return;
            }
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus /> 新建订阅
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>凭据</TableHead>
              <TableHead>订阅链接</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  暂无订阅
                </TableCell>
              </TableRow>
            )}
            {subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.id}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>#{s.user_id}</TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">{subUrl(s.token)}</code>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="复制链接"
                    className="cursor-pointer"
                    onClick={() => copy(subUrl(s.token))}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="轮换 token"
                    className="cursor-pointer"
                    onClick={() => rotate(s)}
                  >
                    <RefreshCw />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="编辑"
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
                    title="删除"
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

      <SubDialog
        key={editing?.id ?? 'new'}
        editing={editing}
        users={users}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </div>
  );
}
