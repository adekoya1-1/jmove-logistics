import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { paymentsAPI } from '../api/client.js';
import './PaymentVerify.css';

export default function PaymentVerify() {
  const [params]  = useSearchParams();
  const reference = params.get('reference') || params.get('trxref');
  const [state,   setState]   = useState('loading');
  const [orderId, setOrderId] = useState(null);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!reference) { setState('failed'); setError('No payment reference found.'); return; }
    paymentsAPI.verify(reference)
      .then(r => { setOrderId(r.data.orderId); setState('success'); })
      .catch(e => { setError(e?.response?.data?.message || 'Payment verification failed.'); setState('failed'); });
  }, [reference]);

  return (
    <div className="verify-page">
      <div className="verify-card fade-in">
        {/* Header stripe */}
        <div className="verify-nav">
          <div className="verify-logo">
  <img src="/logo-orange-white.png" alt="JMove Logistics" style={{height:32, width:"auto", objectFit:"contain"}} />
          </div>
        </div>

        <div className="verify-body">
          {state === 'loading' && (
            <>
              <div className="verify-icon loading">
                <span className="spinner spinner-lg" />
              </div>
              <h2>Verifying payment…</h2>
              <p>Please wait while we confirm your transaction with Paystack.</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="verify-icon success">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <path d="M8 18l7 7 13-14" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 style={{ color: 'var(--green)' }}>Payment Successful</h2>
              <p>Your delivery has been confirmed. A driver will be assigned shortly and you'll receive an email notification.</p>
              {reference && (
                <div className="verify-ref">
                  <span className="verify-ref-label">Reference</span>
                  <span className="verify-ref-val">{reference}</span>
                </div>
              )}
              <div className="verify-actions">
                {orderId && (
                  <Link to={`/dashboard/orders/${orderId}`} className="btn-primary verify-btn">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="4.5"/><circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none"/></svg>
                    Track Your Delivery
                  </Link>
                )}
                <Link to="/dashboard" className="btn-secondary verify-btn">Go to Dashboard</Link>
              </div>
            </>
          )}

          {state === 'failed' && (
            <>
              <div className="verify-icon failed">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <path d="M11 11l14 14M25 11L11 25" stroke="var(--red)" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 style={{ color: 'var(--red)' }}>Payment Failed</h2>
              <p>{error || 'Something went wrong with your payment. Your card was not charged.'}</p>
              <div className="verify-actions">
                <Link to="/dashboard/orders" className="btn-primary verify-btn">Back to Orders</Link>
                <Link to="/dashboard" className="btn-secondary verify-btn">Dashboard</Link>
              </div>
            </>
          )}
        </div>

        <div className="verify-footer">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-faint)" strokeWidth="1.5"><rect x="2" y="6" width="10" height="7" rx="1"/><path d="M4.5 6V4a2.5 2.5 0 015 0v2"/></svg>
          Secured by Paystack · JMove Logistics Logistics Ltd
        </div>
      </div>
    </div>
  );
}
