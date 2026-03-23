import { useState, useEffect } from 'react';
import { driversAPI } from '../../api/client.js';
import { formatDistanceToNow } from 'date-fns';
import './DriverJobs.css';

export default function DriverJobs() {
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    driversAPI.jobs().then(r => setJobs(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const fmt = n => Number(n||0).toLocaleString('en-NG');

  return (
    <div className="driver-jobs">
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Available Jobs</h1>
          <p className="page-subtitle">Jobs assigned by JMove dispatch</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {jobs.length > 0 && (
            <span className="jobs-count">{jobs.length} job{jobs.length !== 1 ? 's' : ''} waiting</span>
          )}
          <button className="btn-secondary" style={{ fontSize:13, padding:'8px 16px' }} onClick={load}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>No jobs assigned yet</h3>
          <p>New deliveries assigned by dispatch will appear here. Make sure your status is set to Available.</p>
          <button className="btn-secondary" style={{ marginTop:8, fontSize:13 }} onClick={load}>Refresh now</button>
        </div>
      ) : (
        <div className="jobs-list">
          {jobs.map(job => (
            <div key={job._id} className="card job-card fade-in">
              {/* Top — waybill + service type + amount */}
              <div className="job-card-header">
                <div>
                  <p className="job-num">{job.waybillNumber}</p>
                  <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap' }}>
                    <span className={`badge ${job.serviceType === 'express' ? 'badge-assigned' : job.serviceType === 'sameday' ? 'badge-picked_up' : 'badge-pending'}`}
                      style={{ textTransform:'capitalize' }}>
                      {job.serviceType || 'standard'}
                    </span>
                    <span className="badge" style={{ background:'var(--bg-elevated)', color:'var(--text-muted)' }}>
                      {job.deliveryType}
                    </span>
                  </div>
                </div>
                <div className="job-amount-block">
                  <p className="job-amount">₦{fmt(job.totalAmount)}</p>
                  <p style={{ fontSize:11, color:'var(--text-faint)', textAlign:'right', marginTop:2 }}>
                    {formatDistanceToNow(new Date(job.createdAt), { addSuffix:true })}
                  </p>
                </div>
              </div>

              {/* Route — cities */}
              <div className="job-route">
                <div className="jr-row">
                  <div className="jr-dot brand" />
                  <div>
                    <p className="jr-lbl">Pickup from</p>
                    <p className="jr-city">{job.originCity}</p>
                    {job.senderAddress && <p className="jr-addr">{job.senderAddress}</p>}
                  </div>
                </div>
                <div style={{ width:2, height:12, background:'var(--border)', marginLeft:3 }} />
                <div className="jr-row">
                  <div className="jr-dot green" />
                  <div>
                    <p className="jr-lbl">Deliver to</p>
                    <p className="jr-city">{job.destinationCity}</p>
                    <p className="jr-addr">{job.receiverAddress}</p>
                  </div>
                </div>
              </div>

              {/* Sender / Receiver contact */}
              <div className="job-contacts">
                <div className="jc-item">
                  <p className="jc-label">Sender</p>
                  <p className="jc-name">{job.senderName}</p>
                  <a href={`tel:${job.senderPhone}`} className="jc-phone">{job.senderPhone}</a>
                </div>
                <div className="jc-divider" />
                <div className="jc-item">
                  <p className="jc-label">Receiver</p>
                  <p className="jc-name">{job.receiverName}</p>
                  <a href={`tel:${job.receiverPhone}`} className="jc-phone">{job.receiverPhone}</a>
                </div>
              </div>

              {/* Tags */}
              <div className="job-footer">
                <div className="job-tags">
                  <span className="job-tag weight">{job.weight}kg × {job.quantity || 1}</span>
                  {job.isFragile && <span className="job-tag fragile">⚠ Fragile</span>}
                  {job.category && <span className="job-tag" style={{ background:'var(--bg-elevated)', color:'var(--text-muted)' }}>{job.category}</span>}
                  {job.paymentMethod === 'cod' && (
                    <span className="job-tag" style={{ background:'var(--amber-light)', color:'var(--amber)' }}>
                      COD ₦{fmt(job.codAmount)}
                    </span>
                  )}
                </div>
                {job.estimatedDelivery && (
                  <span style={{ fontSize:11, color:'var(--text-faint)' }}>⏱ {job.estimatedDelivery}</span>
                )}
              </div>

              {job.specialInstructions && (
                <div style={{ background:'var(--amber-light)', border:'1px solid rgba(180,83,9,0.15)', borderRadius:6, padding:'8px 12px', fontSize:12, color:'var(--amber)' }}>
                  📝 {job.specialInstructions}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
