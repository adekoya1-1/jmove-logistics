import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';
import PublicNav from '../components/PublicNav.jsx';

function TrackForm() {
  const [waybill, setWaybill] = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const track = async (e) => {
    e.preventDefault();
    if (!waybill.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const r    = await fetch(`/api/orders/track/${waybill.trim()}`);
      const data = await r.json();
      if (!data.success) throw new Error(data.message);
      setResult(data.data);
    } catch (err) {
      setError(err.message || 'Waybill not found. Please check and try again.');
    } finally { setLoading(false); }
  };

  const STATUS_LABEL = {
    booked:'Booked', assigned:'Driver Assigned', picked_up:'Picked Up',
    in_transit:'In Transit', out_for_delivery:'Out for Delivery',
    delivered:'Delivered', returned:'Returned', cancelled:'Cancelled',
  };

  return (
    <div>
      <form className="track-form" onSubmit={track}>
        <input
          className="track-input"
          value={waybill}
          onChange={e => setWaybill(e.target.value)}
          placeholder="Enter waybill number e.g. JMVLAG20240318A1B2"
        />
        <button type="submit" className="btn-primary track-btn" disabled={loading}>
          {loading
            ? <span style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTop:'2px solid white',borderRadius:'50%',display:'inline-block',animation:'spin 0.7s linear infinite'}} />
            : 'Track'}
        </button>
      </form>
      {error && <p style={{color:'#fca5a5', fontSize:13, marginTop:10}}>⚠ {error}</p>}
      {result && (
        <div className="track-result">
          <div className="tr-waybill">{result.waybillNumber}</div>
          <div className="tr-route">{result.originCity} → {result.destinationCity}</div>
          <div className="tr-status">{STATUS_LABEL[result.status] || result.status}</div>
          <div className="tr-eta">Estimated: {result.estimatedDelivery}</div>
          {result.statusHistory?.length > 0 && (
            <div className="tr-last">
              Last update: {result.statusHistory.at(-1)?.location || result.statusHistory.at(-1)?.toStatus}
              &nbsp;· {new Date(result.statusHistory.at(-1)?.changedAt).toLocaleDateString()}
            </div>
          )}
          <Link to={`/track?waybill=${result.waybillNumber}`} style={{ display:'inline-block', marginTop:10, fontSize:12, color:'rgba(255,255,255,0.7)', textDecoration:'underline' }}>
            View full tracking details →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing">

      {/* ── Top bar ── */}
      <div className="top-bar">
        <span>📞 Call us: Available on our contact page</span>
        <span className="top-bar-sep">|</span>
        <span>✉ On Time. Everytime.</span>
      </div>

      {/* ── Nav ── */}
      <PublicNav />

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="eyebrow-dot" />
              Nigerian Haulage & Logistics
            </div>
            <h1 className="hero-h1">
              Moving goods across<br />
              <span className="hero-h1-accent">Nigeria. On Time.</span>
            </h1>
            <p className="hero-desc">
              JMove Logistics is your reliable partner for the safe, timely, and efficient
              movement of goods across local, regional, and national routes. Professional haulage
              solutions tailored to your needs.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="btn-primary hero-cta">
                Book a Shipment
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7.5 1l5.5 6-5.5 6V9H1V5h6.5V1z"/></svg>
              </Link>
              
                <Link to="/track" className="hero-cta-ghost">
                Track a Shipment →
                </Link>
                
              
            </div>
            <div className="hero-trust">
              <div className="trust-item">
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M12 3L5 10 2 7" stroke="#22c55e" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                <span>Licensed & Insured</span>
              </div>
              <div className="trust-sep" />
              <div className="trust-item">
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M12 3L5 10 2 7" stroke="#22c55e" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                <span>Experienced Drivers</span>
              </div>
              <div className="trust-sep" />
              <div className="trust-item">
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M12 3L5 10 2 7" stroke="#22c55e" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                <span>Real-Time Tracking</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-truck-wrap">
              <img src="/truck.jpeg" alt="JMove Logistics Van" className="hero-truck-img" loading="eager" width="480" height="360" />
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI strip ── */}
      <section className="kpi-strip">
        {[
          { val:'100%',  lbl:'Commitment to Delivery' },
          { val:'24/7',  lbl:'Support Available' },
          { val:'✓',     lbl:'Transparent Pricing' },
          { val:'Safe',  lbl:'Handling & Accountability' },
        ].map(k => (
          <div key={k.lbl} className="kpi-item">
            <p className="kpi-val">{k.val}</p>
            <p className="kpi-lbl">{k.lbl}</p>
          </div>
        ))}
      </section>

      {/* ── How It Works ── */}
      <section className="hiw-section">
        <div className="section-inner">
          <div className="section-header">
            <p className="section-eyebrow">Simple Process</p>
            <h2 className="section-title">How It Works</h2>
            <p className="section-sub">Get your goods moving across Nigeria in three simple steps — from booking to safe delivery.</p>
          </div>
          <div className="hiw-grid">

            <div className="hiw-step">
              <div className="hiw-step-num">01</div>
              <div className="hiw-icon-bg">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                  <rect x="7" y="5" width="26" height="32" rx="3" stroke="currentColor" strokeWidth="2"/>
                  <path d="M14 14h16M14 20h16M14 26h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="33" cy="34" r="9" fill="var(--brand)"/>
                  <path d="M29.5 34l2.5 2.5L36 31" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="hiw-title">Book Online</h3>
              <p className="hiw-desc">Create a free account, enter pickup and delivery details, and receive an instant transparent quote — all in under 3 minutes.</p>
            </div>

            <div className="hiw-connector" aria-hidden="true">
              <svg viewBox="0 0 80 24" fill="none" preserveAspectRatio="none">
                <path d="M4 12 Q40 2 76 12" stroke="var(--brand)" strokeWidth="1.5" strokeDasharray="5 4"/>
                <path d="M68 7l8 5-8 5" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="hiw-step">
              <div className="hiw-step-num">02</div>
              <div className="hiw-icon-bg">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                  <path d="M4 28V16l7-9h15v21H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M26 19h10l4 6v3h-14V19z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx="12" cy="32" r="4" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="34" cy="32" r="4" stroke="currentColor" strokeWidth="2"/>
                  <path d="M16 28h14" stroke="currentColor" strokeWidth="2"/>
                  <path d="M8 14h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="hiw-title">We Arrange Pickup</h3>
              <p className="hiw-desc">A professional driver is dispatched to your location. You get real-time updates and can track progress every step of the way.</p>
            </div>

            <div className="hiw-connector" aria-hidden="true">
              <svg viewBox="0 0 80 24" fill="none" preserveAspectRatio="none">
                <path d="M4 12 Q40 2 76 12" stroke="var(--brand)" strokeWidth="1.5" strokeDasharray="5 4"/>
                <path d="M68 7l8 5-8 5" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="hiw-step">
              <div className="hiw-step-num">03</div>
              <div className="hiw-icon-bg">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                  <path d="M10 22l4 4 4-4 8 8 8-14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6 38h32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <rect x="16" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M19 11h6M19 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="hiw-title">Delivered Safely</h3>
              <p className="hiw-desc">Your goods are delivered to the recipient and proof of delivery is captured. You and the receiver are notified immediately on completion.</p>
            </div>

          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="services" id="services">
        <div className="section-inner">
          <div className="section-header">
            <p className="section-eyebrow">Our Core Services</p>
            <h2 className="section-title">What We Move For You</h2>
            <p className="section-sub">
              From a household move to large-scale commercial haulage — JMove Logistics handles it all
              with care, precision, and reliability.
            </p>
          </div>
          <div className="services-grid">

            <div className="service-card">
              <div className="service-visual service-visual-house" aria-hidden="true">
                <svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M60 8L20 32v32h80V32L60 8z" fill="rgba(255,122,0,0.08)" stroke="rgba(255,122,0,0.3)" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M50 64V44h20v20" fill="rgba(255,122,0,0.12)" stroke="rgba(255,122,0,0.4)" strokeWidth="1.5" strokeLinejoin="round"/>
                  <rect x="36" y="42" width="14" height="14" rx="1.5" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.35)" strokeWidth="1.5"/>
                  <rect x="70" y="42" width="14" height="14" rx="1.5" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.35)" strokeWidth="1.5"/>
                  <path d="M36 32h48M20 32L60 8l40 24" stroke="rgba(255,122,0,0.25)" strokeWidth="1"/>
                  <path d="M6 64h108" stroke="rgba(255,122,0,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                  <rect x="84" y="52" width="8" height="12" rx="1" fill="rgba(255,122,0,0.15)" stroke="rgba(255,122,0,0.3)" strokeWidth="1"/>
                  <path d="M28 64V56" stroke="rgba(255,122,0,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M92 64V52" stroke="rgba(255,122,0,0.2)" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="service-tag">Residential</div>
              <h3 className="service-title">House Move</h3>
              <p className="service-desc">Safe and stress-free relocation of household items with careful handling of all your belongings, big or small.</p>
              <Link to="/register" className="service-link">Get a quote →</Link>
            </div>

            <div className="service-card">
              <div className="service-visual service-visual-office" aria-hidden="true">
                <svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="18" y="12" width="84" height="56" rx="2" fill="rgba(255,122,0,0.06)" stroke="rgba(255,122,0,0.25)" strokeWidth="1.5"/>
                  <path d="M18 24h84" stroke="rgba(255,122,0,0.2)" strokeWidth="1"/>
                  <rect x="26" y="32" width="16" height="12" rx="1" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.3)" strokeWidth="1"/>
                  <rect x="52" y="32" width="16" height="12" rx="1" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.3)" strokeWidth="1"/>
                  <rect x="78" y="32" width="16" height="12" rx="1" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.3)" strokeWidth="1"/>
                  <rect x="26" y="52" width="16" height="12" rx="1" fill="rgba(255,122,0,0.08)" stroke="rgba(255,122,0,0.25)" strokeWidth="1"/>
                  <rect x="52" y="52" width="16" height="12" rx="1" fill="rgba(255,122,0,0.08)" stroke="rgba(255,122,0,0.25)" strokeWidth="1"/>
                  <rect x="78" y="52" width="16" height="12" rx="1" fill="rgba(255,122,0,0.08)" stroke="rgba(255,122,0,0.25)" strokeWidth="1"/>
                  <circle cx="60" cy="18" r="2.5" fill="rgba(255,122,0,0.4)"/>
                  <path d="M30 16h6M84 16h6" stroke="rgba(255,122,0,0.2)" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="service-tag">Commercial</div>
              <h3 className="service-title">Office Move</h3>
              <p className="service-desc">Professional office relocation services minimising downtime and disruption to your business operations.</p>
              <Link to="/register" className="service-link">Get a quote →</Link>
            </div>

            <div className="service-card">
              <div className="service-visual service-visual-bulk" aria-hidden="true">
                <svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="8" y="28" width="34" height="28" rx="2" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.35)" strokeWidth="1.5"/>
                  <rect x="44" y="20" width="34" height="36" rx="2" fill="rgba(255,122,0,0.12)" stroke="rgba(255,122,0,0.4)" strokeWidth="1.5"/>
                  <rect x="80" y="32" width="32" height="24" rx="2" fill="rgba(255,122,0,0.08)" stroke="rgba(255,122,0,0.3)" strokeWidth="1.5"/>
                  <path d="M8 42h34M44 36h34M80 44h32" stroke="rgba(255,122,0,0.2)" strokeWidth="1" strokeDasharray="3 2"/>
                  <path d="M16 28v-6l8-8 8 8v6" stroke="rgba(255,122,0,0.25)" strokeWidth="1" strokeLinejoin="round"/>
                  <path d="M52 20v-8l9-8 9 8v8" stroke="rgba(255,122,0,0.3)" strokeWidth="1" strokeLinejoin="round"/>
                  <path d="M4 64h112" stroke="rgba(255,122,0,0.15)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="service-tag">High Volume</div>
              <h3 className="service-title">Bulk Goods Move</h3>
              <p className="service-desc">Efficient transportation of large quantities of goods across local, regional, and national routes.</p>
              <Link to="/register" className="service-link">Get a quote →</Link>
            </div>

            <div className="service-card">
              <div className="service-visual service-visual-commercial" aria-hidden="true">
                <svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 56V22L30 10h60v46" stroke="rgba(255,122,0,0.3)" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M10 56h100" stroke="rgba(255,122,0,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
                  <rect x="24" y="34" width="14" height="22" rx="1.5" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.3)" strokeWidth="1"/>
                  <rect x="46" y="26" width="14" height="30" rx="1.5" fill="rgba(255,122,0,0.12)" stroke="rgba(255,122,0,0.35)" strokeWidth="1"/>
                  <rect x="68" y="30" width="14" height="26" rx="1.5" fill="rgba(255,122,0,0.1)" stroke="rgba(255,122,0,0.3)" strokeWidth="1"/>
                  <circle cx="90" cy="44" r="4" fill="rgba(255,122,0,0.15)" stroke="rgba(255,122,0,0.4)" strokeWidth="1"/>
                  <path d="M88 44l2 2 4-4" stroke="rgba(255,122,0,0.7)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M30 10l-20 12" stroke="rgba(255,122,0,0.2)" strokeWidth="1"/>
                </svg>
              </div>
              <div className="service-tag">Enterprise</div>
              <h3 className="service-title">Business & Commercial</h3>
              <p className="service-desc">End-to-end haulage solutions for businesses — from supply chain support to scheduled bulk deliveries.</p>
              <Link to="/register" className="service-link">Get a quote →</Link>
            </div>

            {/* Dispatch Delivery — Coming Soon */}
            <div className="service-card service-card-coming-soon">
              <div className="service-visual service-visual-dispatch" aria-hidden="true">
                <svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 44V32l8-10h54v22H10z" stroke="rgba(255,122,0,0.3)" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M72 38h20l8 6v6H72V38z" stroke="rgba(255,122,0,0.3)" strokeWidth="1.5" strokeLinejoin="round"/>
                  <circle cx="24" cy="52" r="6" stroke="rgba(255,122,0,0.4)" strokeWidth="1.5"/>
                  <circle cx="24" cy="52" r="2.5" fill="rgba(255,122,0,0.25)"/>
                  <circle cx="84" cy="52" r="6" stroke="rgba(255,122,0,0.4)" strokeWidth="1.5"/>
                  <circle cx="84" cy="52" r="2.5" fill="rgba(255,122,0,0.25)"/>
                  <path d="M30 44h42M14 36h52" stroke="rgba(255,122,0,0.15)" strokeWidth="1" strokeDasharray="3 2"/>
                  <path d="M96 20l8-8M90 16l12 4M94 26l4-12" stroke="rgba(255,122,0,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="coming-soon-badge">Coming Soon</div>
              <h3 className="service-title">Dispatch Delivery</h3>
              <p className="service-desc">On-demand same-day dispatch delivery across cities — book a pickup and have your goods delivered directly to your customer's door, fast.</p>
              <span className="service-link coming-soon-link">Notify me →</span>
            </div>

          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section className="about-section" id="about">
        <div className="section-inner">
          <div className="about-grid">
            <div className="about-content">
              <p className="section-eyebrow">About JMove Logistics</p>
              <h2 className="section-title" style={{textAlign:'left'}}>
                Bridging the gap between<br />businesses and dependable transport
              </h2>
              <p className="about-text">
                JMove Logistics was established to bridge the gap between businesses and dependable
                transportation by offering professional haulage solutions carefully tailored to each
                client's needs.
              </p>
              <p className="about-text">
                With a strong focus on reliability, accountability, and customer satisfaction, JMove
                Logistics ensures that every delivery is handled with care and precision. Our
                commitment is to deliver excellence through a modern fleet and experienced drivers.
              </p>
              <div className="about-values">
                {['Professionalism','Integrity','Reliability','Efficiency','Safety','Customer Satisfaction'].map(v => (
                  <div key={v} className="about-value">
                    <span className="av-dot" />
                    {v}
                  </div>
                ))}
              </div>
            </div>
            <div className="about-statements">
              <div className="statement-card vision">
                <div className="statement-icon">🎯</div>
                <p className="statement-label">Our Vision</p>
                <p className="statement-text">
                  To become the leading haulage company recognized for efficiency, integrity, and
                  excellence in service delivery in Nigeria.
                </p>
              </div>
              <div className="statement-card mission">
                <div className="statement-icon">🚀</div>
                <p className="statement-label">Our Mission</p>
                <p className="statement-text">
                  To provide dependable haulage services that exceed customers' expectations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust / Fleet Numbers ── */}
      <section className="trust-section">
        <div className="trust-section-inner">
          <div className="trust-text-col">
            <p className="section-eyebrow" style={{ color:'rgba(255,183,74,0.9)' }}>Built on Trust</p>
            <h2 className="section-title" style={{ color:'#FFFFFF', textAlign:'left' }}>
              A fleet and team you can count on
            </h2>
            <p className="trust-section-sub">
              JMove Logistics combines professional drivers, a well-maintained fleet, and a purpose-built
              digital platform to deliver your goods reliably across Nigeria — every single time.
            </p>
            <div className="trust-feature-list">
              {[
                { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 3L6 10 3 7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, text: 'GPS tracking on every shipment' },
                { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 3L6 10 3 7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, text: 'Licensed & insured drivers' },
                { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 3L6 10 3 7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, text: 'Proof of delivery on every order' },
                { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 3L6 10 3 7" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, text: 'Regular vehicle safety inspections' },
              ].map(f => (
                <div key={f.text} className="trust-feature-item">
                  {f.icon}
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="trust-stats-grid">
            {[
              {
                num: '36', unit: 'States',
                label: 'National coverage',
                icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 2C8.48 2 4 6.48 4 12c0 7 10 16 10 16s10-9 10-16c0-5.52-4.48-10-10-10z" stroke="rgba(255,122,0,0.7)" strokeWidth="1.8"/><circle cx="14" cy="12" r="3.5" stroke="rgba(255,122,0,0.7)" strokeWidth="1.8"/></svg>,
              },
              {
                num: '24/7', unit: '',
                label: 'Support available',
                icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10" stroke="rgba(255,122,0,0.7)" strokeWidth="1.8"/><path d="M14 8v6l4 3" stroke="rgba(255,122,0,0.7)" strokeWidth="1.8" strokeLinecap="round"/></svg>,
              },
              {
                num: '100%', unit: '',
                label: 'Delivery commitment',
                icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10" stroke="rgba(255,122,0,0.7)" strokeWidth="1.8"/><path d="M9 14l4 4 6-7" stroke="rgba(255,122,0,0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
              },
              {
                num: '0', unit: 'Hidden fees',
                label: 'Transparent pricing always',
                icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10" stroke="rgba(255,122,0,0.7)" strokeWidth="1.8"/><path d="M14 8v1.5M14 18.5V20M10 12.5A2 2 0 0112 11h3a2 2 0 010 4h-2a2 2 0 000 4h3a2 2 0 002-2" stroke="rgba(255,122,0,0.7)" strokeWidth="1.6" strokeLinecap="round"/></svg>,
              },
            ].map(s => (
              <div key={s.label} className="trust-stat-card">
                <div className="trust-stat-icon">{s.icon}</div>
                <div className="trust-stat-num">{s.num}<span className="trust-stat-unit">{s.unit}</span></div>
                <p className="trust-stat-label">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Choose Us ── */}
      <section className="why-section" id="why-us">
        <div className="section-inner">
          <div className="section-header">
            <p className="section-eyebrow">Why Choose JMove</p>
            <h2 className="section-title">What Sets Us Apart</h2>
          </div>
          <div className="why-grid">
            {[
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 6v6l4 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
                title:'Timely & Reliable Delivery',
                desc:'Every shipment is carefully planned and monitored to ensure goods are delivered within the agreed timeframe and in excellent condition.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.8"/><path d="M5 20a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M19 9l2-2M17 7l4-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
                title:'Professional Drivers',
                desc:'Trained, licensed, and experienced drivers who understand road safety regulations, route planning, and customer service.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3L4 7v6c0 4.5 3.5 8.4 8 9.5 4.5-1.1 8-5 8-9.5V7L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                title:'Safety & Accountability',
                desc:'Vehicles are regularly maintained, strict safety procedures are followed, and accurate delivery records are maintained for every shipment.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 6v1.5M12 16.5V18M8.5 9.5A2.5 2.5 0 0111 8h2a2.5 2.5 0 010 5h-2a2.5 2.5 0 000 5h2a2.5 2.5 0 002.5-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
                title:'Transparent Pricing',
                desc:'Competitive pricing with no hidden charges. Clear cost breakdowns provided upfront so you always know exactly what you\'re paying.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 12h4l-2 6H5l-2-6h4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M12 3v9M9 9l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v2h14v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
                title:'Customer-Focused',
                desc:'Open communication, prompt responses to inquiries, and services adapted to meet specific customer needs — building long-term trust.',
              },
              {
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21C7 21 3 17 3 12s4-9 9-9 9 4 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 12l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M20.1 15.9l-2.1 2.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
                title:'Real-Time Tracking',
                desc:'Track your shipment live with our waybill tracking system. Know exactly where your goods are at every stage of the journey.',
              },
            ].map(w => (
              <div key={w.title} className="why-card">
                <div className="why-icon-wrap">{w.icon}</div>
                <h3 className="why-title">{w.title}</h3>
                <p className="why-desc">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="cta-banner">
        <div className="cta-banner-inner">
          <div>
            <h2 className="cta-banner-title">Ready to move your goods with confidence?</h2>
            <p className="cta-banner-sub">Get started with JMove Logistics today — reliable haulage across Nigeria.</p>
          </div>
          <div className="cta-banner-actions">
            <Link to="/register" className="btn-primary cta-banner-btn">Book a Shipment</Link>
            <Link to="/login" className="cta-banner-ghost">Sign in to existing account →</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-logo">
              <img src="/logo-orange-white.png" alt="JMove Logistics" style={{ height:36, width:'auto', objectFit:'contain' }} />
            </div>
            <p className="footer-tagline">"On Time. Everytime."</p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <p className="footer-col-title">Services</p>
              <a href="#services" className="footer-link">House Move</a>
              <a href="#services" className="footer-link">Office Move</a>
              <a href="#services" className="footer-link">Bulk Goods Move</a>
              <a href="#services" className="footer-link">Business & Commercial</a>
            </div>
            <div className="footer-col">
              <p className="footer-col-title">Company</p>
              <a href="#about" className="footer-link">About Us</a>
              <a href="#why-us" className="footer-link">Why JMove</a>
              <Link to="/careers" className="footer-link">Careers</Link>
              <Link to="/contact" className="footer-link">Contact Us</Link>
            </div>
            <div className="footer-col">
              <p className="footer-col-title">Customer</p>
              <Link to="/track" className="footer-link">Track Shipment</Link>
              <Link to="/register" className="footer-link">Book a Shipment</Link>
              <Link to="/login" className="footer-link">Sign In</Link>
              <Link to="/help" className="footer-link">Help & Support</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} JMove Logistics Ltd. All rights reserved.</p>
          <div className="footer-bottom-links">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
