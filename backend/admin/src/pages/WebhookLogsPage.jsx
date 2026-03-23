import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '../hooks/useAuthFetch';

const statusClass = {
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
};

export function WebhookLogsPage() {
  const authFetch = useAuthFetch();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/webhook-logs');
      const data = await res.json();
      setLogs(data.logs || []);
      setSummary(data.summary || {});
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (loading) return <div className="loading">Loading webhook logs...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Webhook Logs</h1>
        <button onClick={loadLogs} className="btn btn-secondary">Refresh</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{summary.total || 0}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#038153' }}>{summary.success || 0}</div>
          <div className="stat-label">Success</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#cc3340' }}>{summary.error || 0}</div>
          <div className="stat-label">Errors</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#ad5e18' }}>{summary.warning || 0}</div>
          <div className="stat-label">Warnings</div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Status</th>
              <th>Ticket</th>
              <th>Store</th>
              <th>Orders</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td className="text-muted text-sm">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td>
                  <span className={`badge ${statusClass[log.status] || ''}`}>
                    {log.status}
                  </span>
                </td>
                <td>{log.ticket_id}</td>
                <td>{log.store_name || '—'}</td>
                <td>{log.orders_found}</td>
                <td className="text-muted text-sm">{log.duration_ms}ms</td>
                <td className="error-text">{log.error || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
