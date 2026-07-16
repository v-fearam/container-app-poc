import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { DlqManagerPage } from './pages/DlqManagerPage';
import { HealthPage } from './pages/HealthPage';
import { ChangeFeedPage } from './pages/ChangeFeedPage';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="dashboard/dlq/*" element={<DlqManagerPage />} />
        <Route path="changefeed" element={<ChangeFeedPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route
          path="admin"
          element={
            <ProtectedRoute requiredRole="Admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
