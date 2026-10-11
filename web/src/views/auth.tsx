import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

export function AuthView({ configured, onAuthed }: { configured: boolean; onAuthed: () => void }) {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!configured) {
        if (password.length < 8) throw new Error('密码至少 8 位');
        if (password !== password2) throw new Error('两次密码不一致');
        await api('/api/admin/setup', { method: 'POST', body: { password } });
      }
      await api('/api/admin/login', { method: 'POST', body: { password } });
      onAuthed();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">Hakimi</CardTitle>
          <CardDescription>单人节点中枢</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {!configured && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p1">设置管理密码（至少 8 位）</Label>
                  <Input id="p1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="p2">确认密码</Label>
                  <Input id="p2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
                </div>
              </>
            )}
            {configured && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="p">管理密码</Label>
                <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              </div>
            )}
            <Button type="submit" disabled={busy} className="cursor-pointer">
              {configured ? '登录' : '创建并登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
