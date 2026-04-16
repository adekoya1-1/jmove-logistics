import { useState, useEffect } from 'react';
import { paymentsAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './CustomerPayments.css';

const BADGE = { paid:'badge-paid', pending:'badge-pending', failed:'badge-failed' };

export default function CustomerPayments() {
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    paymentsAPI.history().then(r => setPayments(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s,p) => s + p.amount, 0);
  const fmt = n => Number(n||0).toLocaleString('en-NG');

  return (
    <div className="customer-payments">
      <div className="page-header">
        <h1 className="page-title">Payments</h1>
        <p className="page-subtitle">Your transaction history</p>
      </div>

      <div className="card pay-total-card">
        <div className="ptc-icon">💰</div>
        <div>
          <p className="ptc-label">Total Spent on Shipping</p>
          <p className="ptc-value">₦{fmt(totalPaid)}</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding:16 }}>
            {Array(4).fill(0).map((_,i) => <div key={i} className="shimmer" style={{ height:64, margin:'4px 0', borderRadius:10 }} />)}
          </div>
        ) : !payments.length ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <h3>No payments yet</h3>
            <p>Your payment history will appear here</p>
          </div>
        ) : (
          <div>
            {payments.map(p => (
              <div key={p._id} className="pay-row">
                <div className={`pay-row-icon ${p.status === 'paid' ? 'paid' : 'pending'}`}>
                  {p.status === 'paid' ? '✓' : '⏳'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p className="pay-row-num">{p.orderId?.waybillNumber || '—'}</p>
                  <p className="pay-row-addr">
                    {p.orderId?.originCity} → {p.orderId?.destinationCity}
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p className="pay-row-amt">₦{fmt(p.amount)}</p>
                  <p className="pay-row-date">{format(new Date(p.createdAt), 'MMM d, yyyy')}</p>
                </div>
                <span className={`badge ${BADGE[p.status]||'badge-pending'}`} style={{ marginLeft:10 }}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
