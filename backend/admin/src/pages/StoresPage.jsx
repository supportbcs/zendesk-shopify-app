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
    <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 16, borderRadius: 4, border: '1px solid #d8dcde', marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Store Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required disabled={!!initial}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #d8dcde', borderRadius: 4, boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Shopify Domain</label>
        <input value={domain} onChange={e => setDomain(e.target.value)} required placeholder="store.myshopify.com"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #d8dcde', borderRadius: 4, boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          API Token {initial && '(leave blank to keep current)'}
        </label>
        <input value={token} onChange={e => setToken(e.target.value)} required={!initial} type="password"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #d8dcde', borderRadius: 4, boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={{ padding: '6px 16px', background: '#1f73b7', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {initial ? 'Update' : 'Add Store'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '6px 16px', background: '#fff', border: '1px solid #d8dcde', borderRadius: 4, cursor: 'pointer' }}>
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
    await authFetch('/api/admin/stores', { method: 'POST', body: JSON.stringify(data) });
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

  if (loading) return <p>Loading stores...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Stores ({stores.length})</h1>
        <button onClick={() => { setShowForm(true); setEditing(null); }}
          style={{ padding: '6px 16px', background: '#1f73b7', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Add Store
        </button>
      </div>

      {showForm && <StoreForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />}
      {editing && <StoreForm initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 4, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f8f9f9', textAlign: 'left', fontSize: 12, color: '#68737d' }}>
            <th style={{ padding: '8px 12px' }}>Health</th>
            <th style={{ padding: '8px 12px' }}>Store Name</th>
            <th style={{ padding: '8px 12px' }}>Domain</th>
            <th style={{ padding: '8px 12px' }}>Last Sync</th>
            <th style={{ padding: '8px 12px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map(store => (
            <tr key={store.id} style={{ borderTop: '1px solid #e9ebed' }}>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: healthColor(store) }} />
              </td>
              <td style={{ padding: '8px 12px', fontWeight: 500 }}>{store.store_name}</td>
              <td style={{ padding: '8px 12px', fontSize: 13, color: '#68737d' }}>{store.shopify_domain}</td>
              <td style={{ padding: '8px 12px', fontSize: 12, color: '#87929d' }}>
                {store.last_successful_sync ? new Date(store.last_successful_sync).toLocaleString() : 'Never'}
                {store.last_error && <div style={{ color: '#cc3340', fontSize: 11 }}>{store.last_error}</div>}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => handleTest(store.id)} style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: '#fff', border: '1px solid #d8dcde', borderRadius: 3 }}>Test</button>
                  <button onClick={() => { setEditing(store); setShowForm(false); }} style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: '#fff', border: '1px solid #d8dcde', borderRadius: 3 }}>Edit</button>
                  <button onClick={() => handleDelete(store.id)} style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer', background: '#fff', border: '1px solid #cc3340', color: '#cc3340', borderRadius: 3 }}>Delete</button>
                </div>
                {testResult[store.id] && <div style={{ fontSize: 11, marginTop: 4, color: testResult[store.id].startsWith('Connected') ? '#038153' : '#cc3340' }}>{testResult[store.id]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
