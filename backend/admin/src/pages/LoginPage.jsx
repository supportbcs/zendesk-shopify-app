import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { user, loading, error, loginWithGoogle } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Backbone CS</h1>
        <p className="subtitle">Admin Dashboard</p>
        {error && <p className="error">{error}</p>}
        <button onClick={loginWithGoogle} className="btn-google">
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
