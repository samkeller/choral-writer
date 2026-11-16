import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Center,
  Loader,
  PasswordInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconBook2,
  IconBrain,
  IconFeather,
  IconHome2,
  IconRoute,
  IconUsers,
} from '@tabler/icons-react';

import { loginRequestSchema } from '@choral-writer/shared';

type PageId = 'home' | 'projects' | 'agents' | 'memories' | 'traces';

const navigation: { id: PageId; label: string; icon: typeof IconHome2 }[] = [
  { id: 'home', label: 'Accueil', icon: IconHome2 },
  { id: 'projects', label: 'Projets', icon: IconBook2 },
  { id: 'agents', label: 'Agents', icon: IconUsers },
  { id: 'memories', label: 'Mémoires', icon: IconBrain },
  { id: 'traces', label: 'Traces', icon: IconRoute },
];

type SessionState = 'loading' | 'authenticated' | 'anonymous' | 'error';

export function App() {
  const [session, setSession] = useState<SessionState>('loading');
  const [page, setPage] = useState<PageId>('home');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginPending, setLoginPending] = useState(false);

  async function checkSession() {
    try {
      const response = await fetch('/api/session', { credentials: 'include' });
      if (response.status === 401) {
        setSession('anonymous');
        return;
      }
      if (!response.ok) {
        throw new Error(`Le serveur a répondu avec le code ${response.status}.`);
      }
      setSession('authenticated');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Le serveur est inaccessible.');
      setSession('error');
    }
  }

  useEffect(() => {
    void checkSession();
  }, []);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError('');
    const result = loginRequestSchema.safeParse({ password });
    if (!result.success) {
      setLoginError('Saisissez le mot de passe pour continuer.');
      return;
    }

    setLoginPending(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result.data),
      });
      if (!response.ok) {
        const body: { error?: { message?: string } } = await response.json();
        throw new Error(body.error?.message ?? 'La connexion a échoué.');
      }
      setPassword('');
      setSession('authenticated');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'La connexion a échoué.');
    } finally {
      setLoginPending(false);
    }
  }

  async function logout() {
    const response = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    if (!response.ok) {
      setLoginError('Impossible de fermer la session.');
      return;
    }
    setSession('anonymous');
    setPage('home');
  }

  if (session === 'loading') {
    return <Center className="screen-center"><Loader color="teal" /></Center>;
  }

  if (session === 'error') {
    return (
      <Center className="screen-center">
        <Paper className="login-card" p="xl" radius="lg" withBorder>
          <Stack>
            <Brand />
            <Alert color="red" title="Connexion au serveur impossible">{loginError}</Alert>
            <Button onClick={() => { setSession('loading'); void checkSession(); }}>Réessayer</Button>
          </Stack>
        </Paper>
      </Center>
    );
  }

  if (session === 'anonymous') {
    return (
      <Center className="screen-center">
        <Paper className="login-card" p="xl" radius="lg" withBorder>
          <form onSubmit={submitLogin}>
            <Stack>
              <Brand />
              <Text c="dimmed" size="sm">Connectez-vous pour retrouver votre atelier.</Text>
              <PasswordInput
                label="Mot de passe"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                autoComplete="current-password"
                autoFocus
              />
              {loginError && <Alert color="red">{loginError}</Alert>}
              <Button type="submit" loading={loginPending} fullWidth>Se connecter</Button>
            </Stack>
          </form>
        </Paper>
      </Center>
    );
  }

  const activePage = navigation.find((item) => item.id === page) ?? navigation[0];
  const ActiveIcon = activePage.icon;

  return (
    <div className="workspace">
      <aside className="desktop-sidebar">
        <Brand />
        <nav className="desktop-navigation" aria-label="Navigation principale">
          {navigation.map((item) => (
            <NavButton key={item.id} item={item} active={page === item.id} onSelect={setPage} />
          ))}
        </nav>
        <Button className="sidebar-logout" variant="subtle" color="gray" onClick={() => void logout()}>
          Se déconnecter
        </Button>
      </aside>

      <main className="workspace-main">
        <header className="topbar">
          <div className="topbar-brand"><Brand /></div>
          <Text size="sm" c="dimmed" className="desktop-greeting">Votre espace de création</Text>
          <Button className="mobile-logout" variant="subtle" color="gray" size="xs" onClick={() => void logout()}>
            Déconnexion
          </Button>
        </header>

        <div className="page-content">
          {page === 'home' ? (
            <section className="welcome-panel">
              <div className="welcome-icon"><IconFeather size={26} stroke={1.6} /></div>
              <Text c="teal.3" size="sm" fw={600} tt="uppercase" className="tracking-wide">
                Atelier de narration
              </Text>
              <Title order={1} size="h2" mt="xs">Votre prochaine histoire commence ici.</Title>
              <Text c="dimmed" maw={480} mt="sm" lh={1.7}>
                Créez un projet pour donner vie à un monde, ses personnages et leurs histoires.
              </Text>
              <Paper className="empty-project" p="lg" radius="md" withBorder mt="xl">
                <Text fw={500}>Aucun projet pour le moment</Text>
                <Text size="sm" c="dimmed" mt={4}>La création de projets arrive à l’étape suivante.</Text>
              </Paper>
            </section>
          ) : (
            <section className="welcome-panel">
              <div className="welcome-icon"><ActiveIcon size={26} stroke={1.6} /></div>
              <Text c="teal.3" size="sm" fw={600} tt="uppercase">{activePage.label}</Text>
              <Title order={1} size="h2" mt="xs">{activePage.label}</Title>
              <Text c="dimmed" mt="sm">Cet espace sera disponible dans une prochaine étape du MVP.</Text>
            </section>
          )}
        </div>
      </main>

      <nav className="mobile-navigation" aria-label="Navigation principale">
        {navigation.map((item) => (
          <NavButton key={item.id} item={item} active={page === item.id} onSelect={setPage} compact />
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><IconFeather size={20} stroke={1.8} /></div>
      <div>
        <Text fw={700} size="sm" lh={1.2}>Choral Writer</Text>
        <Text size="xs" c="dimmed">Histoires en devenir</Text>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  onSelect,
  compact = false,
}: {
  item: (typeof navigation)[number];
  active: boolean;
  onSelect: (page: PageId) => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Button
      variant={active ? 'light' : 'subtle'}
      color={active ? 'teal' : 'gray'}
      className={compact ? 'mobile-nav-button' : 'desktop-nav-button'}
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={19} stroke={1.7} />
      {!compact && <span>{item.label}</span>}
      {compact && <span>{item.label}</span>}
    </Button>
  );
}
