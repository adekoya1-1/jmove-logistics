import { useState } from 'react';
import { Link } from 'react-router-dom';
import './StaticPage.css';
import PublicNav from '../components/PublicNav.jsx';
import SEO from '../components/SEO.jsx';

export default function ContactUs() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="sp-page">
      <SEO
        title="Contact Us"
        description="Get in touch with JMove Logistics. Have a question, need a haulage quote, or want to discuss your logistics needs? Our team is ready to help you anywhere in Nigeria."
        canonical="/contact"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          'name': 'Contact JMove Logistics',
          'url': 'https://www.jmovelogistics.com/contact',
          'description': 'Contact JMove Logistics for haulage quotes, enquiries, and logistics support.',
          'mainEntity': { '@id': 'https://www.jmovelogistics.com/#organization' },
        }}
      />
      <PublicNav />

      {/* Hero */}
      <div className="sp-hero">
        <div className="sp-hero-inner">
          <p className="sp-eyebrow">Get in Touch</p>
          <h1 className="sp-hero-title">Contact Us</h1>
          <p className="sp-hero-sub">
            Have a question, need a quote, or want to talk logistics? Our team is ready to help.
          </p>
        </div>
      </div>

      <div className="sp-content">

        {/* Contact cards */}
        <div className="contact-cards">
          {[
            {
              icon: '📞',
              title: 'Call Us',
              lines: ['Our team is available during business hours', 'Monday – Friday, 8am – 6pm WAT'],
            },
            {
              icon: '✉',
              title: 'Email Us',
              lines: ['Send us a message any time', 'We respond within 24 business hours'],
            },
            {
              icon: '📍',
              title: 'Visit Us',
              lines: ['JMove Logistics Ltd', 'Nigeria'],
            },
          ].map(c => (
            <div key={c.title} className="contact-card">
              <div className="contact-card-icon">{c.icon}</div>
              <p className="contact-card-title">{c.title}</p>
              {c.lines.map(l => <p key={l} className="contact-card-line">{l}</p>)}
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="contact-form-wrap">
          <h2 className="sp-section-title">Send Us a Message</h2>
          <p className="sp-section-sub">Fill in the form below and we'll get back to you as soon as possible.</p>

          {sent ? (
            <div className="contact-success">
              <div className="contact-success-icon">✓</div>
              <h3>Message Sent!</h3>
              <p>Thank you for reaching out. A member of our team will be in touch within 24 business hours.</p>
              <button className="btn-primary" onClick={() => setSent(false)}>Send Another</button>
            </div>
          ) : (
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="contact-form-row">
                <div className="sp-field">
                  <label className="sp-label">Full Name</label>
                  <input className="sp-input" type="text" value={form.name} onChange={set('name')} placeholder="Your full name" required />
                </div>
                <div className="sp-field">
                  <label className="sp-label">Email Address</label>
                  <input className="sp-input" type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" required />
                </div>
              </div>
              <div className="contact-form-row">
                <div className="sp-field">
                  <label className="sp-label">Phone Number <span className="sp-optional">(optional)</span></label>
                  <input className="sp-input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+234 801 234 5678" />
                </div>
                <div className="sp-field">
                  <label className="sp-label">Subject</label>
                  <select className="sp-input" value={form.subject} onChange={set('subject')} required>
                    <option value="">Select a subject</option>
                    <option>Get a Quote</option>
                    <option>Track a Shipment</option>
                    <option>Driver Partnership</option>
                    <option>Complaint / Feedback</option>
                    <option>General Inquiry</option>
                  </select>
                </div>
              </div>
              <div className="sp-field">
                <label className="sp-label">Message</label>
                <textarea className="sp-input sp-textarea" value={form.message} onChange={set('message')} placeholder="Tell us how we can help…" rows={5} required />
              </div>
              <button type="submit" className="btn-primary contact-submit">Send Message</button>
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
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
