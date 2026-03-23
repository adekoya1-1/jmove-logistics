import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import { formatDistanceToNow } from 'date-fns';
import './CustomerDashboard.css';

const BADGE = {
  booked:'badge-pending', assigned:'badge-assigned', picked_up:'badge-picked_up',
  in_transit:'badge-in_transit', out_for_delivery:'badge-in_transit',
  delivered:'badge-delivered', cancelled:'badge-cancelled',
};

export default function CustomerDashboard() {
  const { user }  = useAuth();
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersAPI.list({ limit: 5 }).then(r => setOrders(r.data.orders)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const stats = {
    total:     orders.length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    inTransit: orders.filter(o => ['in_transit','out_for_delivery'].includes(o.status)).length,
    pending:   orders.filter(o => ['booked','assigned'].includes(o.status)).length,
  };

  const fmt = n => Number(n||0).toLocaleString('en-NG');

  return (
    <div className="customer-dash">
      {/* Hero */}
      <div className="cust-hero card">
        <div className="hero-glow-inner" />
        <div className="cust-hero-content">
          <div>
            <p className="hero-greeting">Welcome back,</p>
            <h1 className="hero-name">{user?.firstName} {user?.lastName}</h1>
            <p className="hero-sub">Book haulage services and track your goods</p>
          </div>
          <Link to="/dashboard/new-order" className="btn-primary hero-cta-btn">
            + Book Haulage
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="cust-stats">
        {[
          { label:'Total Shipments', value:stats.total,     icon:'📦', color:'brand'  },
          { label:'Delivered',       value:stats.delivered, icon:'✅', color:'green'  },
          { label:'In Transit',      value:stats.inTransit, icon:'🚚', color:'cyan'   },
          { label:'Awaiting Pickup', value:stats.pending,   icon:'⏳', color:'amber'  },
        ].map(s => (
          <div key={s.label} className={`cust-stat card cust-stat-${s.color}`}>
            <div className="cust-stat-icon-wrap">{s.icon}</div>
            <div>
              <p className="cust-stat-val">{s.value}</p>
              <p className="cust-stat-lbl">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        {[
          { to:'/dashboard/new-order', icon:'📦', label:'Book Haulage', desc:'Send a package anywhere in Nigeria' },
          { to:'/dashboard/orders',    icon:'🔍', label:'Track Orders',  desc:'View waybill and delivery status' },
          { to:'/dashboard/payments',  icon:'💳', label:'Payments',      desc:'View payment history and receipts' },
        ].map(a => (
          <Link key={a.to} to={a.to} className="qa-card card">
            <span className="qa-icon">{a.icon}</span>
            <div>
              <p className="qa-label">{a.label}</p>
              <p className="qa-desc">{a.desc}</p>
            </div>
            <span className="qa-arrow">›</span>
          </Link>
        ))}
      </div>

      {/* Recent shipments */}
      <div className="card">
        <div className="recent-header">
          <p className="chart-title">Recent Shipments</p>
          <Link to="/dashboard/orders" className="btn-ghost">View all →</Link>
        </div>
        {loading ? (
          <div style={{ padding:16 }}>
            {Array(3).fill(0).map((_,i) => <div key={i} className="shimmer" style={{ height:68, margin:'4px 0', borderRadius:10 }} />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No shipments yet</h3>
            <p>Book your first shipment to get started</p>
            <Link to="/dashboard/new-order" className="btn-primary" style={{ marginTop:8 }}>Book Haulage</Link>
          </div>
        ) : (
          <div className="recent-list">
            {orders.map(o => (
              <Link key={o._id} to={`/dashboard/orders/${o._id}`} className="recent-item">
                <div className="ri-icon">📦</div>
                <div className="ri-info">
                  <div className="ri-top">
                    <span className="ri-num">{o.waybillNumber}</span>
                    <span className={`badge ${BADGE[o.status]}`}>{o.status?.replace(/_/g,' ')}</span>
                    {o.paymentMethod === 'online' && o.paymentStatus !== 'paid' && !['cancelled'].includes(o.status) && (
                      <span className="badge badge-pending" style={{ fontSize:10 }}>Unpaid</span>
                    )}
                  </div>
                  <p className="ri-addr">{o.originCity} → {o.destinationCity} · {o.receiverName}</p>
                </div>
                <div className="ri-right">
                  <p className="ri-amount">₦{fmt(o.totalAmount)}</p>
                  <p className="ri-time">{formatDistanceToNow(new Date(o.createdAt), { addSuffix:true })}</p>
                </div>
                <span className="ri-arrow">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
