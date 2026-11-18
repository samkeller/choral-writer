import { lazy, Suspense } from 'react';
import { Center, Loader } from '@mantine/core';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';

import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth, SessionBoundary } from './auth/AuthRoutes';
import { WorkspaceLayout } from './components/WorkspaceLayout';
const HomePage = lazy(() => import('./pages/HomePage.js').then(({ HomePage }) => ({ default: HomePage })));
const LoginPage = lazy(() => import('./pages/LoginPage.js').then(({ LoginPage }) => ({ default: LoginPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.js').then(({ NotFoundPage }) => ({ default: NotFoundPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage.js').then(({ ProjectsPage }) => ({ default: ProjectsPage })));
const ChatPage = lazy(() => import('./pages/ChatPage.js').then(({ ChatPage }) => ({ default: ChatPage })));
const AgentsPage = lazy(() => import('./pages/AgentsPage.js').then(({ AgentsPage }) => ({ default: AgentsPage })));

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Center mih="100dvh"><Loader color="choral" aria-label="Chargement de la page" /></Center>}>
        <Routes>
          <Route element={<SessionBoundary />}>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<WorkspaceLayout />}>
                <Route index element={<HomePage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="projects/:projectId" element={<ChatPage />} />
                <Route path="agents" element={<AgentsPage />} />
                <Route path="memories" element={<LegacyMemoriesRedirect />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

function LegacyMemoriesRedirect() {
  const [search] = useSearchParams();
  const project = search.get('project');
  if (!project) return <Navigate to="/projects" replace />;
  const next = new URLSearchParams({ tab: 'config', section: 'memory' });
  const branch = search.get('branch');
  if (branch) next.set('branch', branch);
  return <Navigate to={`/projects/${encodeURIComponent(project)}?${next}`} replace />;
}
