import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, RefreshCw } from 'lucide-react';
import { api, type Settings } from '@/lib/api';

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [subscribePath, setSubscribePath] = useState('');
  const [pullInterval, setPullInterval] = useState('60');
  const [pushInterval, setPushInterval] = useState('60');

  async function load() {
    try {
      const s = await api<Settings>('/api/admin/settings');
      setSettings(s);
      setSubscribePath(s.subscribe_path);
      setPullInterval(String(s.pull_interval));
      setPushInterval(String(s.push_interval));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function rotateToken() {
    if (!window.confirm('轮换后所有节点后端需同步更新 ApiKey，确认？')) return;
    try {
      const d = await api<{ server_token: string }>('/api/admin/settings/server-token/rotate', { method: 'POST' });
      setSettings((s) => (s ? { ...s, server_token: d.server_token } : s));
      toast.success('已轮换');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveGeneral() {
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: { subscribe_path: subscribePath, pull_interval: pullInterval, push_interval: pushInterval },
      });
      toast.success('已保存');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">设置</h2>

      <Card>
        <CardHeader>
          <CardTitle>通信密钥（后端 ApiKey）</CardTitle>
          <CardDescription>节点后端（XrayR / soga 等）配置里的 ApiKey 填这个值</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-xs break-all">
              {settings?.server_token ?? '…'}
            </code>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() =>
                navigator.clipboard.writeText(settings?.server_token ?? '').then(() => toast.success('已复制'))
              }
            >
              <Copy /> 复制
            </Button>
            <Button variant="destructive" className="cursor-pointer" onClick={rotateToken}>
              <RefreshCw /> 轮换
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>订阅路径</CardTitle>
          <CardDescription>订阅链接形如 https://面板域名/&lt;订阅路径&gt;/&lt;token&gt;</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">/</span>
            <Input className="max-w-40" value={subscribePath} onChange={(e) => setSubscribePath(e.target.value)} />
            <span className="text-muted-foreground">/&lt;token&gt;</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>后端轮询节奏（下发 base_config）</CardTitle>
          <CardDescription>秒。调大可降低 Cloudflare 免费档请求消耗</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label>pull_interval</Label>
              <Input
                type="number"
                min={30}
                className="max-w-32"
                value={pullInterval}
                onChange={(e) => setPullInterval(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>push_interval</Label>
              <Input
                type="number"
                min={30}
                className="max-w-32"
                value={pushInterval}
                onChange={(e) => setPushInterval(e.target.value)}
              />
            </div>
            <Button className="cursor-pointer" onClick={saveGeneral}>
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
