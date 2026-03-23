import { useState, useEffect } from 'react';
import { paymentsAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminPayments.css';

const BADGE = { paid:'badge-paid', pending:'badge-pending', failed:'badge-failed', refunded:'badge-assigned' };

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    paymentsAPI.history().then(r => setPayments(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const total = payments.filter(p => p.status === 'paid').reduce((s,p) => s + p.amount, 0);

  return (
    <div className="admin-payments">
      <div className="page-header">
        <div><h1 className="page-title">Payments</h1><p className="page-subtitle">All transaction records</p></div>
        <div className="payment-total">
          <p className="pt-label">Total Collected</p>
          <p className="pt-value">₦{total.toLocaleString('en-NG')}</p>
        </div>
      </div>
      <div className="card">
        {loading ? (
          <div style={{ padding:16 }}>{Array(6).fill(0).map((_,i) => <div key={i} className="shimmer" style={{ height:52, margin:'4px 0', borderRadius:8 }} />)}</div>
        ) : payments.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">💳</div><h3>No payments yet</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Customer</th><th>Order</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p._id}>
                    <td><span style={{ fontFamily:'monospace', fontSize:12, color:'var(--brand)' }}>{p.paystackReference || '—'}</span></td>
                    <td>
                      <p style={{ fontSize:14, fontWeight:600 }}>{p.customerId?.firstName} {p.customerId?.lastName}</p>
                      <p style={{ fontSize:12, color:'var(--text-faint)' }}>{p.customerId?.email}</p>
                    </td>
                    <td><span style={{ fontFamily:'monospace', fontSize:13 }}>{p.orderId?.waybillNumber}</span></td>
                    <td><span style={{ fontWeight:700, color:'var(--green)' }}>₦{Number(p.amount).toLocaleString()}</span></td>
                    <td><span className={`badge ${BADGE[p.status]||'badge-pending'}`}>{p.status}</span></td>
                    <td style={{ fontSize:12, color:'var(--text-faint)' }}>{p.paidAt ? format(new Date(p.paidAt),'MMM d, yyyy HH:mm') : format(new Date(p.createdAt),'MMM d, yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
