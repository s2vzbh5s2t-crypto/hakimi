import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { AuthView } from '@/views/auth';
import { ServersView } from '@/views/servers';
import { UsersView } from '@/views/users';
import { SubsView } from '@/views/subs';
import { SettingsView } from '@/views/settings';

type Stage = 'loading' | 'auth' | 'main';

function Panel() {
  const [stage, setStage] = useState<Stage>('loading');
  const [configured, setConfigured] = useState(false);
  const [tab, setTab] = useState('servers');

  useEffect(() => {
    api<{ configured: boolean; authed: boolean }>('/api/admin/me')
      .then((me) => {
        setConfigured(me.configured);
        setStage(me.authed ? 'main' : 'auth');
      })
      .catch(() => setStage('auth'));
  }, []);

  useEffect(() => {
    const onLogout = () => setStage('auth');
    window.addEventListener('hakimi:logout', onLogout);
    return () => window.removeEventListener('hakimi:logout', onLogout);
  }, []);

  if (stage === 'loading') return <div className="min-h-svh" />;
  if (stage === 'auth') {
    return <AuthView configured={configured} onAuthed={() => setStage('main')} />;
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 flex items-center gap-6 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <div className="text-base font-semibold">
          Hakimi <span className="text-muted-foreground">· 节点中枢</span>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList className="bg-transparent p-0">
            <TabsTrigger value="servers" className="cursor-pointer px-3">
              节点
            </TabsTrigger>
            <TabsTrigger value="users" className="cursor-pointer px-3">
              用户凭据
            </TabsTrigger>
            <TabsTrigger value="subs" className="cursor-pointer px-3">
              订阅
            </TabsTrigger>
            <TabsTrigger value="settings" className="cursor-pointer px-3">
              设置
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() => {
            api('/api/admin/logout', { method: 'POST' }).catch(() => {});
            setStage('auth');
          }}
        >
          <LogOut /> 退出
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* key 保证切回标签时重新拉取数据 */}
        {tab === 'servers' && <ServersView key="servers" />}
        {tab === 'users' && <UsersView key="users" />}
        {tab === 'subs' && <SubsView key="subs" />}
        {tab === 'settings' && <SettingsView key="settings" />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <Panel />
      <Toaster position="bottom-center" />
    </ThemeProvider>
  );
}

export default App;
