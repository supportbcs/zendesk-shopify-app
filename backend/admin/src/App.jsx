import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { StoresPage } from './pages/StoresPage';
import { FieldMappingsPage } from './pages/FieldMappingsPage';
import { WebhookLogsPage } from './pages/WebhookLogsPage';

function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<StoresPage />} />
            <Route path="/field-mappings" element={<FieldMappingsPage />} />
            <Route path="/webhook-logs" element={<WebhookLogsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
