import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'flex' }}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Backbone CS</h2>
          <div className="email">{user?.email}</div>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            Stores
          </NavLink>
          <NavLink to="/field-mappings" className={({ isActive }) => isActive ? 'active' : ''}>
            Field Mappings
          </NavLink>
          <NavLink to="/webhook-logs" className={({ isActive }) => isActive ? 'active' : ''}>
            Webhook Logs
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button onClick={logout} className="btn-signout">
            Sign Out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
