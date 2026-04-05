import { useState } from 'react';
import { Link } from 'react-router-dom';
import './StaticPage.css';

const FAQS = [
  {
    category: 'Booking & Orders',
    items: [
      { q: 'How do I book a shipment?', a: 'Create a free account, click "Book a Shipment" from your dashboard, fill in the pickup and delivery details, select your vehicle type, and confirm. You\'ll receive a waybill number immediately.' },
      { q: 'Can I schedule a future pickup?', a: 'Yes. During the booking process you can choose a preferred pickup date and time. Our operations team will confirm availability within a few hours.' },
      { q: 'How do I cancel or modify a booking?', a: 'Go to Orders on your dashboard, open the booking, and click "Cancel" or "Edit". Cancellations are free before a driver is assigned. After assignment, a small fee may apply.' },
    ],
  },
  {
    category: 'Tracking',
    items: [
      { q: 'How do I track my shipment?', a: 'Use the waybill number sent to your email to track at jmovelogistics.com/track — no login required. You can also view live status from your dashboard under Orders.' },
      { q: 'Why hasn\'t my status updated?', a: 'Status updates occur at key milestones (pickup, in-transit, delivery). If your shipment has been stationary for over 12 hours unexpectedly, please contact our support team.' },
    ],
  },
  {
    category: 'Payments',
    items: [
      { q: 'What payment methods do you accept?', a: 'We accept payments via Paystack — card, bank transfer, and USSD. All transactions are secured and instant.' },
      { q: 'When am I charged?', a: 'Payment is collected at the time of booking confirmation. Your order is only confirmed once payment is successful.' },
      { q: 'How do I get a refund?', a: 'Refunds for cancelled orders are processed within 3–5 business days to your original payment method. Contact support with your waybill number to initiate.' },
    ],
  },
  {
    category: 'Account',
    items: [
      { q: 'I forgot my password. What do I do?', a: 'Click "Forgot password?" on the login page. Enter your email and we\'ll send a 6-digit OTP to reset your password. The link expires in 15 minutes.' },
      { q: 'How do I verify my email?', a: 'After registration, a 6-digit OTP is sent to your email. Enter it on the verification screen. If you didn\'t receive it, click "Resend Code" after 60 seconds.' },
      { q: 'Can I change my email address?', a: 'Currently email changes are handled by our support team. Contact us with your request and proof of identity.' },
    ],
  },
];

export default function HelpSupport() {
  const [open, setOpen] = useState({});
  const toggle = key => setOpen(o => ({ ...o, [key]: !o[key] }));

  return (
    <div className="sp-page">
      <nav className="sp-nav">
        <Link to="/" className="sp-nav-logo">
          <img src="/logo-dark.png" alt="JMove Logistics" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </Link>
        <Link to="/" className="sp-nav-back">← Back to Home</Link>
      </nav>

      <div className="sp-hero">
        <div className="sp-hero-inner">
          <p className="sp-eyebrow">Help Centre</p>
          <h1 className="sp-hero-title">Help & Support</h1>
          <p className="sp-hero-sub">Find answers to common questions or get in touch with our team.</p>
        </div>
      </div>

      <div className="sp-content">

        {/* Quick links */}
        <div className="help-quick">
          {[
            { icon: '📦', title: 'Track a Shipment', desc: 'Check your delivery status in real time.', to: '/track' },
            { icon: '📋', title: 'View My Orders', desc: 'See all your past and current bookings.', to: '/dashboard/orders' },
            { icon: '✉', title: 'Contact Support', desc: 'Send us a message — we reply within 24hrs.', to: '/contact' },
          ].map(q => (
            <Link key={q.title} to={q.to} className="help-quick-card">
              <div className="help-quick-icon">{q.icon}</div>
              <p className="help-quick-title">{q.title}</p>
              <p className="help-quick-desc">{q.desc}</p>
            </Link>
          ))}
        </div>

        {/* FAQ */}
        <div className="help-faq-wrap">
          <h2 className="sp-section-title">Frequently Asked Questions</h2>

          {FAQS.map(section => (
            <div key={section.category} className="faq-section">
              <p className="faq-category">{section.category}</p>
              {section.items.map((item, i) => {
                const key = `${section.category}-${i}`;
                return (
                  <div key={key} className={`faq-item ${open[key] ? 'faq-item--open' : ''}`}>
                    <button className="faq-q" onClick={() => toggle(key)}>
                      <span>{item.q}</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="faq-chevron">
                        <path d="M4 6l4 4 4-4"/>
                      </svg>
                    </button>
                    {open[key] && <p className="faq-a">{item.a}</p>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Still need help */}
        <div className="help-cta">
          <p className="help-cta-title">Still need help?</p>
          <p className="help-cta-sub">Our support team is available Monday – Friday, 8am – 6pm WAT.</p>
          <Link to="/contact" className="btn-primary">Contact Us</Link>
        </div>
      </div>

      <div className="sp-footer">
        <p>© {new Date().getFullYear()} JMove Logistics Ltd. All rights reserved.</p>
        <div className="sp-footer-links">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
