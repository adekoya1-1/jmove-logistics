import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersAPI } from '../../api/client.js';
import { paymentsAPI } from '../../api/client.js';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import './AdminDashboard.css';

const fmt = n => Number(n || 0).toLocaleString('en-NG');

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="stat-card fade-in">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <div className="stat-icon" style={{ background: color + '20' }}>{icon}</div>
      </div>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

const STATUS_BADGE = { pending:'badge-pending', assigned:'badge-assigned', picked_up:'badge-picked_up', in_transit:'badge-in_transit', delivered:'badge-delivered', cancelled:'badge-cancelled' };

export default function AdminDashboard() {
  const [data,    setData]    = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([usersAPI.dashboard(), paymentsAPI.stats('30d')])
      .then(([d, r]) => { setData(d.data); setRevenue(r.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const chartData = revenue?.daily?.map(d => ({
    date: new Date(d._id).toLocaleDateString('en-NG', { month:'short', day:'numeric' }),
    revenue: d.revenue || 0,
    orders:  d.orders  || 0,
  })) || [];

  if (loading) return (
    <div>
      <div className="page-header"><div className="shimmer" style={{ height:28, width:200, borderRadius:8 }} /></div>
      <div className="dash-stats">
        {Array(4).fill(0).map((_,i) => <div key={i} className="stat-card shimmer" style={{ height:110 }} />)}
      </div>
    </div>
  );

  const { orders, users, revenue: rev, recentOrders, availableDrivers } = data || {};

  return (
    <div className="admin-dash">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Operations overview for today</p>
        </div>
        <Link to="/admin/orders" className="btn-primary">View All Orders</Link>
      </div>

      <div className="dash-stats">
        <StatCard icon="📦" label="Total Orders"   value={fmt(orders?.total)}   sub={`${orders?.booked || 0} pending`}           color="var(--brand)"  />
        <StatCard icon="💰" label="Total Revenue"  value={`₦${fmt(rev?.totalRevenue)}`} sub={`₦${fmt(rev?.monthlyRevenue)} this month`} color="var(--green)"  />
        <StatCard icon="👥" label="Active Users"   value={fmt(users?.total)}    sub={`${users?.newThisWeek || 0} new this week`}   color="var(--blue)"   />
        <StatCard icon="🚗" label="Avail. Drivers" value={availableDrivers || 0} sub={`${users?.drivers || 0} total drivers`}      color="var(--purple)" />
      </div>

      <div className="dash-pills">
        {[
          { label:'In Transit', value: orders?.inTransit || 0, cls:'cyan' },
          { label:'Delivered',  value: orders?.delivered || 0, cls:'green' },
          { label:'Pending',    value: orders?.booked   || 0, cls:'amber' },
          { label:'Cancelled',  value: orders?.cancelled || 0, cls:'red' },
        ].map(p => (
          <div key={p.label} className={`dash-pill dash-pill-${p.cls}`}>
            <p className="pill-val">{p.value}</p>
            <p className="pill-lbl">{p.label}</p>
          </div>
        ))}
      </div>

      <div className="dash-bottom">
        <div className="card dash-chart">
          <div className="chart-header">
            <div>
              <p className="chart-title">Revenue (30 days)</p>
              <p className="chart-sub">Daily revenue trend</p>
            </div>
            <p className="chart-total">₦{fmt(rev?.monthlyRevenue)}</p>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top:4, right:4, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#F4A012" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#F4A012" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
                <XAxis dataKey="date" tick={{ fontSize:11, fill:'#9AABBD' }} stroke="transparent" />
                <YAxis tick={{ fontSize:11, fill:'#9AABBD' }} stroke="transparent" tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background:'var(--bg-white)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:13 }} formatter={v => [`₦${fmt(v)}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#F4A012" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding:'40px 0' }}><p className="text-muted">No revenue data yet</p></div>
          )}
        </div>

        <div className="card dash-recent">
          <div className="recent-header">
            <p className="chart-title">Recent Orders</p>
            <Link to="/admin/orders" className="btn-ghost">View all →</Link>
          </div>
          {recentOrders?.length ? (
            <div className="recent-list">
              {recentOrders.map(o => (
                <Link key={o._id} to={`/admin/orders/${o._id}`} className="recent-item">
                  <div className="recent-info">
                    <p className="recent-num">{o.waybillNumber}</p>
                    <p className="recent-name">{o.customerId?.firstName} {o.customerId?.lastName}</p>
                  </div>
                  <div className="recent-right">
                    <span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status?.replace('_',' ')}</span>
                    <p className="recent-time">{formatDistanceToNow(new Date(o.createdAt), { addSuffix:true })}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state"><div className="empty-icon">📦</div><h3>No orders yet</h3></div>
          )}
        </div>
      </div>
    </div>
  );
}
