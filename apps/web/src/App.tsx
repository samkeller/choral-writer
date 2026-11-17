import { Route, Routes } from 'react-router-dom';
import { IconBrain, IconRoute } from '@tabler/icons-react';

import { AuthProvider } from './auth/AuthProvider.js';
import { RequireAuth, SessionBoundary } from './auth/AuthRoutes.js';
import { WorkspaceLayout } from './components/WorkspaceLayout.js';
import { ComingSoonPage } from './pages/ComingSoonPage.js';
import { HomePage } from './pages/HomePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { ChatPage } from './pages/ChatPage.js';
import { AgentsPage } from './pages/AgentsPage.js';

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
              <Route path="traces" element={<ComingSoonPage title="Traces" icon={IconRoute} />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
