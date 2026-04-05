import { Link } from 'react-router-dom';
import './StaticPage.css';
import PublicNav from '../components/PublicNav.jsx';

const ROLES = [
  {
    title: 'Professional Truck Driver',
    type: 'Full-time',
    location: 'Nigeria (Multiple Routes)',
    desc: 'Join our growing fleet of professional drivers delivering goods safely and on time across Nigeria. Valid commercial licence required.',
    requirements: ['Valid commercial driver\'s licence (CDL)', 'Minimum 2 years haulage experience', 'Clean driving record', 'Strong knowledge of Nigerian road networks'],
  },
  {
    title: 'Logistics Operations Coordinator',
    type: 'Full-time',
    location: 'Lagos, Nigeria',
    desc: 'Coordinate daily haulage operations, driver assignments, and customer order fulfilment. You\'ll be the backbone of our dispatch team.',
    requirements: ['2+ years in logistics or operations', 'Strong organisational and communication skills', 'Proficiency in basic computer tools', 'Ability to work in a fast-paced environment'],
  },
  {
    title: 'Customer Experience Representative',
    type: 'Full-time',
    location: 'Lagos, Nigeria (Hybrid)',
    desc: 'Be the first point of contact for our customers. Handle enquiries, resolve complaints, and ensure every customer has a great experience.',
    requirements: ['1+ years customer service experience', 'Excellent verbal and written communication', 'Empathetic and solutions-oriented', 'Experience with CRM tools is a plus'],
  },
];

export default function Careers() {
  return (
    <div className="sp-page">
      <PublicNav />

      <div className="sp-hero">
        <div className="sp-hero-inner">
          <p className="sp-eyebrow">Join Our Team</p>
          <h1 className="sp-hero-title">Careers at JMove</h1>
          <p className="sp-hero-sub">
            We're building Nigeria's most reliable logistics company. Come grow with us.
          </p>
        </div>
      </div>

      <div className="sp-content">

        {/* Values */}
        <div className="careers-values">
          {[
            { icon: '🤝', title: 'People First', desc: 'We treat every team member with respect and invest in their growth.' },
            { icon: '🚀', title: 'Grow Fast', desc: 'JMove is scaling — ambitious people thrive here.' },
            { icon: '🛡️', title: 'Safety Always', desc: 'Your wellbeing on and off the road is our priority.' },
            { icon: '💰', title: 'Competitive Pay', desc: 'Fair compensation, performance bonuses, and timely payroll.' },
          ].map(v => (
            <div key={v.title} className="careers-value">
              <div className="careers-value-icon">{v.icon}</div>
              <p className="careers-value-title">{v.title}</p>
              <p className="careers-value-desc">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* Open roles */}
        <div className="careers-roles-wrap">
          <h2 className="sp-section-title">Open Positions</h2>
          <p className="sp-section-sub">We're hiring across operations, driving, and customer experience.</p>

          <div className="careers-roles">
            {ROLES.map(role => (
              <div key={role.title} className="careers-role">
                <div className="careers-role-header">
                  <div>
                    <p className="careers-role-title">{role.title}</p>
                    <div className="careers-role-meta">
                      <span className="careers-badge">{role.type}</span>
                      <span className="careers-location">📍 {role.location}</span>
                    </div>
                  </div>
                </div>
                <p className="careers-role-desc">{role.desc}</p>
                <div className="careers-role-reqs">
                  <p className="careers-reqs-title">Requirements</p>
                  <ul>
                    {role.requirements.map(r => <li key={r}>{r}</li>)}
                  </ul>
                </div>
                <a href="mailto:careers@jmovelogistics.com" className="btn-primary careers-apply-btn">
                  Apply for This Role
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Speculative */}
        <div className="careers-open-app">
          <p className="careers-open-title">Don't see a role that fits?</p>
          <p className="careers-open-sub">
            We're always looking for talented, driven people. Send your CV and a short intro to{' '}
            <a href="mailto:careers@jmovelogistics.com">careers@jmovelogistics.com</a> and we'll keep you on file.
          </p>
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
