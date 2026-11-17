import { Route, Routes } from 'react-router-dom';
import { IconBrain } from '@tabler/icons-react';

import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth, SessionBoundary } from './auth/AuthRoutes';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { ComingSoonPage } from './pages/ComingSoonPage';
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
              <Route path="memories" element={<ComingSoonPage title="Mémoires" icon={IconBrain} />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
