import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import './Landing.css';

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
      <nav className="landing-nav">
        <div className="nav-inner">
          <div className="nav-logo">
            <img src="/logo-dark.png" alt="JMove Logistics" style={{ height:44, width:'auto', objectFit:'contain' }} />
          </div>
          <div className="nav-links">
            <a href="#services" className="nav-item">Services</a>
            <a href="#tracking" className="nav-item">Track Shipment</a>
            <a href="#about" className="nav-item">About Us</a>
            <a href="#why-us" className="nav-item">Why JMove</a>
            <Link to="/login" className="nav-signin">Sign In</Link>
            <Link to="/register" className="btn-primary nav-register">Get Started</Link>
          </div>
        </div>
      </nav>

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
              <a href="#tracking" className="hero-cta-ghost">
                Track a Shipment →
              </a>
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
              <img src="/truck.jpeg" alt="JMove Logistics Van" className="hero-truck-img" />
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
            {[
              {
                icon: '🏠',
                title: 'House Move',
                tag: 'Residential',
                desc: 'Safe and stress-free relocation of household items with careful handling of all your belongings, big or small.',
              },
              {
                icon: '🏢',
                title: 'Office Move',
                tag: 'Commercial',
                desc: 'Professional office relocation services minimising downtime and disruption to your business operations.',
              },
              {
                icon: '📦',
                title: 'Bulk Goods Move',
                tag: 'High Volume',
                desc: 'Efficient transportation of large quantities of goods across local, regional, and national routes.',
              },
              {
                icon: '🏭',
                title: 'Business & Commercial',
                tag: 'Enterprise',
                desc: 'End-to-end haulage solutions for businesses — from supply chain support to scheduled bulk deliveries.',
              },
            ].map(s => (
              <div key={s.title} className="service-card">
                <div className="service-icon-wrap">
                  <span className="service-icon">{s.icon}</span>
                </div>
                <div className="service-tag">{s.tag}</div>
                <h3 className="service-title">{s.title}</h3>
                <p className="service-desc">{s.desc}</p>
                <Link to="/register" className="service-link">Get a quote →</Link>
              </div>
            ))}

            {/* Dispatch Delivery — Coming Soon */}
            <div className="service-card service-card-coming-soon">
              <div className="service-icon-wrap coming-soon-icon-wrap">
                <span className="service-icon">🚀</span>
              </div>
              <div className="coming-soon-badge">Coming Soon</div>
              <h3 className="service-title">Dispatch Delivery</h3>
              <p className="service-desc">
                On-demand same-day dispatch delivery across cities — book a pickup and have
                your goods delivered directly to your customer's door, fast.
              </p>
              <span className="service-link coming-soon-link">Notify me →</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Track section ── */}
      <section className="track-section" id="tracking">
        <div className="track-inner">
          <div className="track-content">
            <p className="section-eyebrow light">Track Your Shipment</p>
            <h2 className="track-title">Where is your goods right now?</h2>
            <p className="track-sub">
              Enter your waybill number for instant real-time updates — no account needed.
            </p>
            <TrackForm />
            <p className="track-hint">
              Have an account? <Link to="/dashboard" style={{color:'var(--gold-dark)'}}>Sign in for full history</Link>
            </p>
          </div>
          <div className="track-visual">
            {['Booking Confirmed','Driver Assigned','Goods Picked Up','In Transit','Out for Delivery','Delivered'].map((step, i) => (
              <div key={step} className={`track-step ${i < 5 ? 'done' : ''}`}>
                <div className="ts-dot">
                  {i < 5
                    ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                    : <div className="ts-pulse" />
                  }
                </div>
                {i < 5 && <div className="ts-line" />}
                <span className="ts-label">{step}</span>
              </div>
            ))}
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
                icon:'⏰',
                title:'Timely & Reliable Delivery',
                desc:'Every shipment is carefully planned and monitored to ensure goods are delivered within the agreed timeframe and in excellent condition.',
              },
              {
                icon:'👷',
                title:'Professional Drivers',
                desc:'Trained, licensed, and experienced drivers who understand road safety regulations, route planning, and customer service.',
              },
              {
                icon:'🛡️',
                title:'Safety & Accountability',
                desc:'Vehicles are regularly maintained, strict safety procedures are followed, and accurate delivery records are maintained for every shipment.',
              },
              {
                icon:'💰',
                title:'Transparent Pricing',
                desc:'Competitive pricing with no hidden charges. Clear cost breakdowns provided upfront so you always know exactly what you\'re paying.',
              },
              {
                icon:'🤝',
                title:'Customer-Focused',
                desc:'Open communication, prompt responses to inquiries, and services adapted to meet specific customer needs — building long-term trust.',
              },
              {
                icon:'📍',
                title:'Real-Time Tracking',
                desc:'Track your shipment live with our waybill tracking system. Know exactly where your goods are at every stage of the journey.',
              },
            ].map(w => (
              <div key={w.title} className="why-card">
                <div className="why-icon">{w.icon}</div>
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
              <a href="#" className="footer-link">Careers</a>
              <a href="#" className="footer-link">Contact Us</a>
            </div>
            <div className="footer-col">
              <p className="footer-col-title">Customer</p>
              <a href="#tracking" className="footer-link">Track Shipment</a>
              <Link to="/register" className="footer-link">Book a Shipment</Link>
              <Link to="/login" className="footer-link">Sign In</Link>
              <a href="#" className="footer-link">Help & Support</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} JMove Logistics Ltd. All rights reserved.</p>
          <div className="footer-bottom-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
