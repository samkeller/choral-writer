import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';

import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth, SessionBoundary } from './auth/AuthRoutes';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ChatPage } from './pages/ChatPage';
import { AgentsPage } from './pages/AgentsPage';

export function App() {
  return (
    <AuthProvider>
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
