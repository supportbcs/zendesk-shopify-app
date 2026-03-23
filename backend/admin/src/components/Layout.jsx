import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navStyle = {
  width: 200, background: '#03363d', color: '#fff', minHeight: '100vh',
  display: 'flex', flexDirection: 'column', padding: '16px 0',
};

const linkStyle = {
  display: 'block', padding: '10px 20px', color: '#d1e8df',
  textDecoration: 'none', fontSize: 14,
};

const activeLinkStyle = {
  ...linkStyle, background: '#0a4f5c', color: '#fff', fontWeight: 600,
};

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'flex' }}>
      <nav style={navStyle}>
        <div style={{ padding: '0 20px 16px', borderBottom: '1px solid #0a4f5c' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Backbone CS</div>
          <div style={{ fontSize: 12, color: '#aecfc6', marginTop: 4 }}>{user?.email}</div>
        </div>
        <NavLink to="/" end style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Stores
        </NavLink>
        <NavLink to="/field-mappings" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Field Mappings
        </NavLink>
        <NavLink to="/webhook-logs" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
          Webhook Logs
        </NavLink>
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #0a4f5c' }}>
          <button onClick={logout} style={{
            background: 'none', border: '1px solid #68737d', color: '#d1e8df',
            padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%',
          }}>
            Sign Out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 24, background: '#f8f9f9', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
