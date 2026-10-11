import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type User } from '@/lib/api';

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
}

function UserDialog({
  editing,
  open,
  onOpenChange,
  onSaved,
}: {
  editing: User | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(editing?.email ?? '');
  const [uuid, setUuid] = useState(editing?.uuid ?? '');
  const [enabled, setEnabled] = useState(editing ? editing.enabled !== 0 : true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = { email, uuid, enabled };
      if (editing) await api(`/api/admin/users/${editing.id}`, { method: 'PUT', body: payload });
      else await api('/api/admin/users', { method: 'POST', body: payload });
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
          <DialogTitle>{editing ? `编辑凭据 #${editing.id}` : '新建凭据'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>备注</Label>
            <Input value={email} placeholder="我的手机" onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>UUID（留空自动生成）</Label>
            <Input value={uuid} placeholder="自动生成" onChange={(e) => setUuid(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} /> 启用
          </label>
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

export function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    try {
      setUsers(await api<User[]>('/api/admin/users'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(u: User) {
    if (!window.confirm(`确认删除凭据「${u.email}」？使用它的订阅将失效。`)) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
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
          <h2 className="text-xl font-semibold">用户凭据</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            一份凭据 = 一个 UUID，trojan/SS 密码由它派生。按订阅或设备分开创建，丢失单独作废。
          </p>
        </div>
        <Button
          className="cursor-pointer"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus /> 新建凭据
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ID</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>UUID</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  暂无凭据
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.id}</TableCell>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="text-xs">{u.uuid}</code>
                    <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => copy(u.uuid)}>
                      <Copy />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  {u.enabled ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">启用</Badge>
                  ) : (
                    <Badge variant="secondary">停用</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      setEditing(u);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer text-destructive hover:text-destructive"
                    onClick={() => remove(u)}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserDialog
        key={editing?.id ?? 'new'}
        editing={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </div>
  );
}
