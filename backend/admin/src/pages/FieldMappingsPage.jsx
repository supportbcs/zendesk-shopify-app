import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '../hooks/useAuthFetch';

const DEFAULT_FIELDS = [
  { shopify_field: 'order_name', label: 'Order ID / Name' },
  { shopify_field: 'order_status', label: 'Order Status' },
  { shopify_field: 'financial_status', label: 'Financial Status' },
  { shopify_field: 'fulfillment_status', label: 'Fulfillment Status' },
  { shopify_field: 'total_price', label: 'Order Total' },
  { shopify_field: 'order_date', label: 'Order Date' },
  { shopify_field: 'tracking_numbers', label: 'Tracking Number(s)' },
  { shopify_field: 'tracking_urls', label: 'Tracking URL(s)' },
  { shopify_field: 'payment_method', label: 'Payment Method' },
  { shopify_field: 'tags', label: 'Order Tags' },
  { shopify_field: 'shipping_address', label: 'Shipping Address' },
  { shopify_field: 'customer_note', label: 'Customer Note' },
  { shopify_field: 'line_item_1_title', label: 'Product 1 - Title' },
  { shopify_field: 'line_item_1_sku', label: 'Product 1 - SKU' },
  { shopify_field: 'line_item_1_quantity', label: 'Product 1 - Qty' },
  { shopify_field: 'line_item_2_title', label: 'Product 2 - Title' },
  { shopify_field: 'line_item_2_sku', label: 'Product 2 - SKU' },
  { shopify_field: 'line_item_2_quantity', label: 'Product 2 - Qty' },
  { shopify_field: 'line_item_3_title', label: 'Product 3 - Title' },
  { shopify_field: 'line_item_3_sku', label: 'Product 3 - SKU' },
  { shopify_field: 'line_item_3_quantity', label: 'Product 3 - Qty' },
  { shopify_field: 'line_item_4_title', label: 'Product 4 - Title' },
  { shopify_field: 'line_item_4_sku', label: 'Product 4 - SKU' },
  { shopify_field: 'line_item_4_quantity', label: 'Product 4 - Qty' },
  { shopify_field: 'line_item_5_title', label: 'Product 5 - Title' },
  { shopify_field: 'line_item_5_sku', label: 'Product 5 - SKU' },
  { shopify_field: 'line_item_5_quantity', label: 'Product 5 - Qty' },
];

export function FieldMappingsPage() {
  const authFetch = useAuthFetch();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/field-mappings');
      const data = await res.json();

      const savedMap = {};
      (data.mappings || []).forEach(m => { savedMap[m.shopify_field] = m; });

      const merged = DEFAULT_FIELDS.map(field => ({
        shopify_field: field.shopify_field,
        label: field.label,
        zendesk_field_id: savedMap[field.shopify_field]?.zendesk_field_id || '',
        enabled: savedMap[field.shopify_field]?.enabled ?? false,
      }));

      setMappings(merged);
    } catch (err) {
      console.error('Failed to load mappings:', err);
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const handleToggle = (index) => {
    setMappings(prev => prev.map((m, i) =>
      i === index ? { ...m, enabled: !m.enabled } : m
    ));
    setSaved(false);
  };

  const handleFieldIdChange = (index, value) => {
    setMappings(prev => prev.map((m, i) =>
      i === index ? { ...m, zendesk_field_id: value } : m
    ));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await authFetch('/api/admin/field-mappings', {
        method: 'PUT',
        body: JSON.stringify({ mappings }),
      });
      setSaved(true);
    } catch (err) {
      console.error('Failed to save mappings:', err);
    }
    setSaving(false);
  };

  if (loading) return <div className="loading">Loading field mappings...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Field Mappings</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {saved && <span className="saved-indicator">Saved</span>}
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <p className="page-description">
        Map Shopify fields to Zendesk custom field IDs. Toggle fields on/off to control which data is written to tickets.
      </p>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>On</th>
              <th>Shopify Field</th>
              <th>Zendesk Field ID</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => (
              <tr key={m.shopify_field} className={m.enabled ? '' : 'row-disabled'}>
                <td>
                  <input type="checkbox" checked={m.enabled} onChange={() => handleToggle(i)} />
                </td>
                <td>{m.label}</td>
                <td>
                  <input value={m.zendesk_field_id} onChange={e => handleFieldIdChange(i, e.target.value)}
                    placeholder="e.g. 12345678" disabled={!m.enabled}
                    className="field-input" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
