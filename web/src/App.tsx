import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth, useAuth } from './lib/auth';
import { ToastProvider } from './components/UI';
import { AnnotatorLayout, AdminLayout } from './components/Layout';
import LoginPage from './pages/LoginPage';
import TaskListPage from './pages/TaskListPage';
import TaskDetailPage from './pages/TaskDetailPage';
import AdminTasksPage from './pages/AdminTasksPage';
import AdminStatsPage from './pages/AdminStatsPage';
import AdminMembersPage from './pages/AdminMembersPage';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/tasks'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/tasks"
              element={
                <RequireAuth>
                  <AnnotatorLayout>
                    <TaskListPage />
                  </AnnotatorLayout>
                </RequireAuth>
              }
            />
            <Route
              path="/tasks/:id"
              element={
                <RequireAuth>
                  <TaskDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth role="admin">
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AdminTasksPage />} />
              <Route path="stats" element={<AdminStatsPage />} />
              <Route path="members" element={<AdminMembersPage />} />
            </Route>
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
