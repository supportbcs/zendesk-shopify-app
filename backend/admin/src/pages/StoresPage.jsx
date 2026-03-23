import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '../hooks/useAuthFetch';

function healthColor(store) {
  if (store.last_error) return '#cc3340';
  if (!store.last_successful_sync) return '#87929d';
  const hours = (Date.now() - new Date(store.last_successful_sync).getTime()) / 3600000;
  if (hours < 24) return '#038153';
  if (hours < 72) return '#ad5e18';
  return '#cc3340';
}

function StoreForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.store_name || '');
  const [domain, setDomain] = useState(initial?.shopify_domain || '');
  const [token, setToken] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { store_name: name, shopify_domain: domain };
    if (token) data.api_token = token;
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="form-card">
      <div className="form-group">
        <label>Store Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required disabled={!!initial}
          className="form-input" />
      </div>
      <div className="form-group">
        <label>Shopify Domain</label>
        <input value={domain} onChange={e => setDomain(e.target.value)} required placeholder="store.myshopify.com"
          className="form-input" />
      </div>
      <div className="form-group">
        <label>
          API Token {initial && <span className="hint">(leave blank to keep current)</span>}
        </label>
        <input value={token} onChange={e => setToken(e.target.value)} required={!initial} type="password"
          className="form-input" />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {initial ? 'Update' : 'Add Store'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function StoresPage() {
  const authFetch = useAuthFetch();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testResult, setTestResult] = useState({});
  const [actionError, setActionError] = useState(null);

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/stores');
      const data = await res.json();
      setStores(data.stores || []);
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { loadStores(); }, [loadStores]);

  const handleAdd = async (data) => {
    setActionError(null);
    const res = await authFetch('/api/admin/stores', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setActionError(err.error || 'Failed to add store');
      return;
    }
    setShowForm(false);
    loadStores();
  };

  const handleEdit = async (data) => {
    await authFetch('/api/admin/stores/' + editing.id, { method: 'PUT', body: JSON.stringify(data) });
    setEditing(null);
    loadStores();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this store? This cannot be undone.')) return;
    await authFetch('/api/admin/stores/' + id, { method: 'DELETE' });
    loadStores();
  };

  const handleTest = async (id) => {
    setTestResult(prev => ({ ...prev, [id]: 'testing...' }));
    try {
      const res = await authFetch('/api/admin/stores/' + id + '/test', { method: 'POST' });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [id]: data.success ? 'Connected' : 'Failed: ' + data.message }));
    } catch {
      setTestResult(prev => ({ ...prev, [id]: 'Test failed' }));
    }
  };

  if (loading) return <div className="loading">Loading stores...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Stores ({stores.length})</h1>
        <button onClick={() => { setShowForm(true); setEditing(null); }} className="btn btn-primary">
          Add Store
        </button>
      </div>

      {actionError && <div className="error-text" style={{ padding: '8px 12px', marginBottom: 12 }}>{actionError}</div>}
      {showForm && <StoreForm onSubmit={handleAdd} onCancel={() => { setShowForm(false); setActionError(null); }} />}
      {editing && <StoreForm initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 50 }}></th>
              <th>Store Name</th>
              <th>Domain</th>
              <th>Last Sync</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.map(store => (
              <tr key={store.id}>
                <td>
                  <span className="health-dot" style={{ background: healthColor(store) }} />
                </td>
                <td style={{ fontWeight: 500 }}>{store.store_name}</td>
                <td className="text-muted text-sm">{store.shopify_domain}</td>
                <td className="text-muted text-sm">
                  {store.last_successful_sync ? new Date(store.last_successful_sync).toLocaleString() : 'Never'}
                  {store.last_error && <div className="error-text">{typeof store.last_error === 'object' ? store.last_error.message : store.last_error}</div>}
                </td>
                <td>
                  <div className="action-buttons">
                    <button onClick={() => handleTest(store.id)} className="btn btn-secondary btn-sm">Test</button>
                    <button onClick={() => { setEditing(store); setShowForm(false); }} className="btn btn-secondary btn-sm">Edit</button>
                    <button onClick={() => handleDelete(store.id)} className="btn btn-danger btn-sm">Delete</button>
                  </div>
                  {testResult[store.id] && (
                    <div className={`test-result ${testResult[store.id].startsWith('Connected') ? 'success' : 'error'}`}>
                      {testResult[store.id]}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
