import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type Server } from '@/lib/api';
import { ServerDialog } from '@/components/server-dialog';

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

  async function duplicate(s: Server) {
    try {
      await api(`/api/admin/servers/${s.id}/duplicate`, { method: 'POST' });
      toast.success('已复制为「' + s.name + ' 副本」');
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
              <TableHead>排序</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
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
                <TableCell className="text-muted-foreground">{s.sort}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="复制此节点"
                    className="cursor-pointer"
                    onClick={() => duplicate(s)}
                  >
                    <Copy />
                  </Button>
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
