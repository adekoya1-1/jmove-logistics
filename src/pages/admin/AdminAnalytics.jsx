import { useState, useEffect } from 'react';
import { paymentsAPI, ordersAPI } from '../../api/client.js';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './AdminAnalytics.css';

const PERIODS = ['7d','30d','90d','1y'];
const COLORS   = ['#F4A012','#10b981','#60a5fa','#a78bfa','#f87171'];
const fmt = n => Number(n||0).toLocaleString('en-NG');

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#FFFFFF', border:'1px solid #DDE3EC', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#0D1B2A' }}>
      <p style={{ color:'#5A6A7E', marginBottom:6 }}>{label}</p>
      {payload.map(p => <p key={p.dataKey} style={{ color:p.color, fontWeight:700 }}>{p.name}: {p.dataKey==='revenue' ? `₦${fmt(p.value)}` : p.value}</p>)}
    </div>
  );
};

export default function AdminAnalytics() {
  const [period,  setPeriod]  = useState('30d');
  const [revenue, setRevenue] = useState(null);
  const [orders,  setOrders]  = useState(null);

  useEffect(() => {
    Promise.all([paymentsAPI.stats(period), ordersAPI.stats()])
      .then(([r, o]) => { setRevenue(r.data); setOrders(o.data); })
      .catch(console.error);
  }, [period]);

  const chartData = revenue?.daily?.map(d => ({
    date: new Date(d._id).toLocaleDateString('en-NG', { month:'short', day:'numeric' }),
    revenue: d.revenue || 0, transactions: d.count || 0,
  })) || [];

  const orderChart = orders?.dailyRevenue?.map(d => ({
    date: new Date(d._id).toLocaleDateString('en-NG', { month:'short', day:'numeric' }),
    orders: d.orders || 0,
  })) || [];

  const pieData = [
    { name:'Delivered',  value: +orders?.summary?.delivered  || 0 },
    { name:'In Transit', value: +orders?.summary?.inTransit  || 0 },
    { name:'Pending',    value: +orders?.summary?.pending    || 0 },
    { name:'Cancelled',  value: +orders?.summary?.cancelled  || 0 },
  ].filter(d => d.value > 0);

  const stats = [
    { label:'Total Revenue',    value:`₦${fmt(revenue?.summary?.totalRevenue)}`,      color:'var(--green)' },
    { label:'Transactions',     value:fmt(revenue?.summary?.successfulPayments),       color:'var(--brand)' },
    { label:'Avg. Order Value', value:`₦${fmt(Math.round(revenue?.summary?.avgPayment||0))}`, color:'var(--blue)'  },
    { label:'Total Orders',     value:fmt(orders?.summary?.total),                    color:'var(--purple)'},
  ];

  return (
    <div className="admin-analytics">
      <div className="page-header">
        <div><h1 className="page-title">Analytics</h1><p className="page-subtitle">Revenue and operations overview</p></div>
        <div className="period-tabs">
          {PERIODS.map(p => <button key={p} className={`period-btn ${period===p?'active':''}`} onClick={() => setPeriod(p)}>{p}</button>)}
        </div>
      </div>

      <div className="analytics-stats">
        {stats.map(s => (
          <div key={s.label} className="stat-card fade-in">
            <p className="stat-label">{s.label}</p>
            <p className="stat-value" style={{ color:s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="analytics-charts">
        <div className="card analytics-chart">
          <p className="chart-title" style={{ marginBottom:20 }}>Revenue Trend</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F4A012" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#F4A012" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
              <XAxis dataKey="date" tick={{ fontSize:11, fill:'#9AABBD' }} stroke="transparent" />
              <YAxis tick={{ fontSize:11, fill:'#9AABBD' }} stroke="transparent" tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<TT />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#F4A012" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card analytics-pie">
          <p className="chart-title" style={{ marginBottom:16 }}>Order Status</p>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {pieData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie></PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {pieData.map((d,i) => (
                  <div key={d.name} className="pie-legend-item">
                    <span className="pie-dot" style={{ background:COLORS[i%COLORS.length] }} />
                    <span>{d.name}</span>
                    <span className="pie-val">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-muted" style={{ textAlign:'center', padding:'40px 0', fontSize:13 }}>No data</p>}
        </div>
      </div>

      <div className="card" style={{ padding:20 }}>
        <p className="chart-title" style={{ marginBottom:20 }}>Daily Orders</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={orderChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" />
            <XAxis dataKey="date" tick={{ fontSize:11, fill:'#9AABBD' }} stroke="transparent" />
            <YAxis tick={{ fontSize:11, fill:'#9AABBD' }} stroke="transparent" />
            <Tooltip content={<TT />} />
            <Bar dataKey="orders" name="Orders" fill="#F4A012" radius={[4,4,0,0]} fillOpacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
