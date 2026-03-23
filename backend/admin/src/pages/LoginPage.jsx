import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { user, loading, error, loginWithGoogle } = useAuth();

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (user) return <Navigate to="/" replace />;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f9f9' }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: 400 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Backbone CS</h1>
        <p style={{ color: '#68737d', margin: '0 0 24px' }}>Admin Dashboard</p>
        {error && <p style={{ color: '#cc3340', margin: '0 0 16px', fontSize: 14 }}>{error}</p>}
        <button
          onClick={loginWithGoogle}
          style={{
            padding: '10px 24px', fontSize: 14, cursor: 'pointer',
            background: '#1f73b7', color: '#fff', border: 'none',
            borderRadius: 4, fontWeight: 500,
          }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
