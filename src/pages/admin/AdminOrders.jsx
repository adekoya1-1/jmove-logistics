import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, driversAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminOrders.css';

const STATUSES = ['','booked','assigned','picked_up','in_transit','out_for_delivery','delivered','returned','cancelled'];
const BADGE = { pending:'badge-pending', assigned:'badge-assigned', picked_up:'badge-picked_up', in_transit:'badge-in_transit', delivered:'badge-delivered', cancelled:'badge-cancelled', paid:'badge-paid', failed:'badge-failed' };

export default function AdminOrders() {
  const [orders,   setOrders]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [status,   setStatus]   = useState('');
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null); // { orderId }
  const [drivers,  setDrivers]  = useState([]);
  const [selDriver,setSelDriver]= useState('');
  const [assigning,setAssigning]= useState(false);

  const load = () => {
    setLoading(true);
    ordersAPI.list({ status, search, page, limit: 15 })
      .then(r => { setOrders(r.data.orders); setTotal(r.data.pagination.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, search, page]);

  const openAssign = (orderId) => {
    setModal({ orderId }); setSelDriver('');
    driversAPI.list({ status: 'available' }).then(r => setDrivers(r.data.drivers)).catch(console.error);
  };

  const doAssign = async () => {
    if (!selDriver) return;
    setAssigning(true);
    try { await ordersAPI.assign(modal.orderId, selDriver); setModal(null); load(); }
    catch (e) { alert(e?.response?.data?.message || 'Assignment failed'); }
    finally { setAssigning(false); }
  };

  const pages = Math.ceil(total / 15);

  return (
    <div className="admin-orders">
      <div className="page-header">
        <div><h1 className="page-title">Orders</h1><p className="page-subtitle">Manage all haulage bookings</p></div>
      </div>

      <div className="orders-toolbar">
        <div className="search-wrap">
          🔍 <input className="input" placeholder="Search waybill, sender, receiver, address…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="status-filters">
          {STATUSES.map(s => (
            <button key={s||'all'} className={`filter-btn ${status===s?'active':''}`} onClick={() => { setStatus(s); setPage(1); }}>
              {s ? s.replace('_',' ') : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="table-loading">{Array(5).fill(0).map((_,i) => <div key={i} className="shimmer" style={{ height:52, margin:'4px 0', borderRadius:8 }} />)}</div>
        ) : orders.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📦</div><h3>No orders found</h3><p>Try adjusting your filters</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waybill</th><th>Sender</th><th>Route</th><th>Amount</th>
                  <th>Status</th><th>Payment</th><th>Date</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o._id}>
                    <td><Link to={`/admin/orders/${o._id}`} className="order-num">{o.waybillNumber}</Link></td>
                    <td>
                      <p className="td-name">{o.senderName}</p>
                      <p className="td-sub">{o.senderPhone}</p>
                    </td>
                    <td className="td-route">
                      <p className="td-addr" style={{fontWeight:600}}>{o.originCity}</p>
                      <p className="td-sub">→ {o.destinationCity}</p>
                      <span style={{fontSize:10,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{o.serviceType}</span>
                    </td>
                    <td>
                      <p className="td-amount">₦{Number(o.totalAmount).toLocaleString()}</p>
                      <p className="td-sub" style={{textTransform:'capitalize'}}>{o.serviceType}</p>
                    </td>
                    <td><span className={`badge ${BADGE[o.status]}`}>{o.status?.replace('_',' ')}</span></td>
                    <td><span className={`badge ${BADGE[o.paymentStatus]||'badge-pending'}`}>{o.paymentStatus}</span></td>
                    <td className="td-sub">{format(new Date(o.createdAt), 'MMM d, HH:mm')}</td>
                    <td>
                      <div className="td-actions">
                        {o.status === 'booked' && (
                          <button className="assign-btn" onClick={() => openAssign(o._id)}>Assign</button>
                        )}
                        <Link to={`/admin/orders/${o._id}`} className="btn-ghost" style={{ padding:'5px 8px', fontSize:13 }}>→</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && pages > 1 && (
          <div className="pagination">
            <span>Showing {Math.min((page-1)*15+1, total)}–{Math.min(page*15, total)} of {total}</span>
            <div className="page-btns">
              <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }} onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>Previous</button>
              <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }} onClick={() => setPage(p => p+1)} disabled={page>=pages}>Next</button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Assign Driver</h2>
              <button className="btn-ghost" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {drivers.length === 0 ? (
                <p className="text-muted" style={{ textAlign:'center', padding:'20px 0' }}>No available drivers</p>
              ) : (
                <div className="driver-options">
                  {drivers.map(d => (
                    <label key={d._id} className={`driver-option ${selDriver===d._id?'selected':''}`}>
                      <input type="radio" name="driver" value={d._id} checked={selDriver===d._id} onChange={() => setSelDriver(d._id)} hidden />
                      <div className="driver-opt-avatar">{d.userId?.firstName?.[0]}{d.userId?.lastName?.[0]}</div>
                      <div className="driver-opt-info">
                        <p className="driver-opt-name">{d.userId?.firstName} {d.userId?.lastName}</p>
                        <p className="driver-opt-sub">{d.vehicleType} · {d.vehiclePlate}</p>
                      </div>
                      <span className="driver-opt-rating">⭐ {Number(d.rating).toFixed(1)}</span>
                    </label>
                  ))}
                </div>
              )}
              <button className="btn-primary" style={{ width:'100%', marginTop:16 }} onClick={doAssign} disabled={!selDriver || assigning}>
                {assigning ? <span className="spinner spinner-sm" /> : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
