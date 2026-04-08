import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './CustomerOrders.css';

const STATUSES = ['','booked','assigned','picked_up','in_transit','out_for_delivery','delivered','cancelled'];
const BADGE    = {
  booked:'badge-pending', assigned:'badge-assigned', picked_up:'badge-picked_up',
  in_transit:'badge-in_transit', out_for_delivery:'badge-in_transit',
  delivered:'badge-delivered', cancelled:'badge-cancelled',
};

export default function CustomerOrders() {
  const [orders,  setOrders]  = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [status,  setStatus]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    ordersAPI.list({ status, page, limit: 10 })
      .then(r => { setOrders(r.data.orders); setTotal(r.data.pagination.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, page]);

  const pages = Math.ceil(total / 10);
  const fmt   = n => Number(n||0).toLocaleString('en-NG');

  return (
    <div className="customer-orders">
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">My Shipments</h1>
          <p className="page-subtitle">All your JMove haulage bookings</p>
        </div>
        <Link to="/dashboard/new-order" className="btn-primary">+ Book Haulage</Link>
      </div>

      <div className="status-filters">
        {STATUSES.map(s => (
          <button key={s||'all'} className={`filter-btn ${status===s?'active':''}`}
            onClick={() => { setStatus(s); setPage(1); }}
          >
            {s ? s.replace(/_/g,' ') : 'All'}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding:16 }}>
            {Array(5).fill(0).map((_,i) => <div key={i} className="shimmer" style={{ height:68, margin:'4px 0', borderRadius:10 }} />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No shipments found</h3>
            <Link to="/dashboard/new-order" className="btn-primary" style={{ marginTop:8 }}>Book Shipment</Link>
          </div>
        ) : (
          <div>
            {orders.map(o => (
              <Link key={o._id} to={`/dashboard/orders/${o._id}`} className="order-row">
                <div className="or-icon">📦</div>
                <div className="or-info">
                  <div className="or-top">
                    <span className="or-num">{o.waybillNumber}</span>
                    <span className={`badge ${BADGE[o.status]}`}>{o.status?.replace(/_/g,' ')}</span>
                    {o.paymentMethod === 'online' && o.paymentStatus !== 'paid' && o.status !== 'cancelled' && (
                      <span className="badge badge-pending" style={{ fontSize:10 }}>Unpaid</span>
                    )}
                  </div>
                  <p className="or-addr">{o.originCity} → {o.destinationCity} · {o.receiverName}</p>
                </div>
                <div className="or-right">
                  <p className="or-amount">₦{fmt(o.totalAmount)}</p>
                  <p className="or-date">{format(new Date(o.createdAt), 'MMM d')}</p>
                  {o.status === 'delivered' && (
                    <Link to={`/dashboard/new-order?rebook=${o._id}`} className="or-rebook" onClick={e => e.stopPropagation()}>
                      Book Again
                    </Link>
                  )}
                </div>
                <span className="or-arrow">›</span>
              </Link>
            ))}
          </div>
        )}
        {!loading && pages > 1 && (
          <div className="pagination">
            <span>{total} total shipments</span>
            <div className="page-btns">
              <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }}
                onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>Prev</button>
              <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }}
                onClick={() => setPage(p => p+1)} disabled={page>=pages}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
