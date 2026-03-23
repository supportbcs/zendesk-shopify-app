import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '../hooks/useAuthFetch';

const statusColors = {
  success: '#038153',
  warning: '#ad5e18',
  error: '#cc3340',
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

  if (loading) return <p>Loading webhook logs...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Webhook Logs</h1>
        <button onClick={loadLogs}
          style={{ padding: '6px 16px', background: '#fff', border: '1px solid #d8dcde', borderRadius: 4, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.total || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Total</div>
        </div>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#038153' }}>{summary.success || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Success</div>
        </div>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#cc3340' }}>{summary.error || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Errors</div>
        </div>
        <div style={{ background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e9ebed', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#ad5e18' }}>{summary.warning || 0}</div>
          <div style={{ fontSize: 12, color: '#68737d' }}>Warnings</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 4 }}>
        <thead>
          <tr style={{ background: '#f8f9f9', textAlign: 'left', fontSize: 12, color: '#68737d' }}>
            <th style={{ padding: '8px 12px' }}>Time</th>
            <th style={{ padding: '8px 12px' }}>Status</th>
            <th style={{ padding: '8px 12px' }}>Ticket</th>
            <th style={{ padding: '8px 12px' }}>Store</th>
            <th style={{ padding: '8px 12px' }}>Orders</th>
            <th style={{ padding: '8px 12px' }}>Duration</th>
            <th style={{ padding: '8px 12px' }}>Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} style={{ borderTop: '1px solid #e9ebed' }}>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#87929d' }}>
                {new Date(log.timestamp).toLocaleString()}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                  fontSize: 11, fontWeight: 600, color: '#fff',
                  background: statusColors[log.status] || '#87929d',
                }}>
                  {log.status}
                </span>
              </td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{log.ticket_id}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{log.store_name || '—'}</td>
              <td style={{ padding: '8px 12px', fontSize: 13 }}>{log.orders_found}</td>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#87929d' }}>{log.duration_ms}ms</td>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#cc3340' }}>{log.error || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
