import { useState, useEffect } from 'react';
import { ordersAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './DriverHistory.css';

export default function DriverHistory() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersAPI.list({ status:'delivered', limit:30 })
      .then(r => setOrders(r.data.orders))
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const total      = orders.length;
  const totalValue = orders.reduce((s,o) => s + Number(o.totalAmount||0), 0);

  return (
    <div className="driver-history">
      <div className="page-header">
        <div><h1 className="page-title">Delivery History</h1><p className="page-subtitle">All completed deliveries</p></div>
      </div>

      <div className="history-stats">
        <div className="card hs-card">
          <div className="hs-icon deliveries">✅</div>
          <div>
            <p className="hs-val">{total}</p>
            <p className="hs-lbl">Total Deliveries</p>
          </div>
        </div>
        <div className="card hs-card">
          <div className="hs-icon rating">💰</div>
          <div>
            <p className="hs-val">₦{totalValue.toLocaleString('en-NG', { maximumFractionDigits:0 })}</p>
            <p className="hs-lbl">Total Value Delivered</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="history-header">
          <p style={{ fontSize:14, fontWeight:700 }}>Recent Deliveries</p>
          <span className="badge badge-delivered">{total} completed</span>
        </div>
        {loading ? (
          <div style={{ padding:'12px 16px' }}>
            {Array(5).fill(0).map((_,i) => (
              <div key={i} className="shimmer" style={{ height:60, margin:'6px 0', borderRadius:8 }} />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No deliveries yet</h3>
            <p>Completed deliveries will appear here as you fulfil orders</p>
          </div>
        ) : (
          <div className="history-list">
            {orders.map(o => (
              <div key={o._id} className="history-row">
                <div className="hr-icon">✅</div>
                <div className="hr-info">
                  <p className="hr-num">{o.waybillNumber}</p>
                  <p className="hr-addr">{o.destinationCity}</p>
                </div>
                <div className="hr-right">
                  <p className="hr-amount">₦{Number(o.totalAmount).toLocaleString()}</p>
                  <p className="hr-date">
                    {o.deliveredAt ? format(new Date(o.deliveredAt), 'MMM d, yyyy') : '—'}
                  </p>
                  <div className="hr-status">
                    <span className="badge badge-delivered">Delivered</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
