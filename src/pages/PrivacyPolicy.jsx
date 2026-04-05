import { Link } from 'react-router-dom';
import './StaticPage.css';

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: `We collect information you provide directly to us, including:
- **Account data**: name, email address, phone number, and password when you register.
- **Order data**: pickup address, delivery address, goods description, and payment information when you book a shipment.
- **Usage data**: how you interact with our platform, including pages visited, features used, and device/browser information.
- **Communications**: any messages you send us through our contact form or support channels.`,
  },
  {
    title: '2. How We Use Your Information',
    body: `We use the information we collect to:
- Create and manage your account.
- Process and fulfil your shipment bookings.
- Send you booking confirmations, waybill details, and delivery updates.
- Process payments and issue refunds.
- Respond to your enquiries and provide customer support.
- Improve our services and develop new features.
- Send you operational notices and, where you have opted in, marketing communications.
- Comply with our legal obligations.`,
  },
  {
    title: '3. Information Sharing',
    body: `We do not sell your personal information. We may share it only in the following circumstances:
- **Drivers**: We share your pickup and delivery address with the assigned driver to fulfil your order.
- **Payment processors**: We share necessary details with Paystack to process payments securely.
- **Service providers**: We may use third-party providers (email services, cloud hosting) who process data on our behalf under strict data protection agreements.
- **Legal requirements**: We may disclose information if required by law, court order, or government authority.`,
  },
  {
    title: '4. Data Retention',
    body: `We retain your personal data for as long as your account is active or as needed to provide services. If you close your account, we will delete or anonymise your data within 90 days, except where we are required to retain it for legal or accounting purposes (typically 6 years under Nigerian tax law).`,
  },
  {
    title: '5. Security',
    body: `We take reasonable technical and organisational measures to protect your information:
- Passwords are hashed using bcrypt and never stored in plain text.
- All data in transit is encrypted using TLS (HTTPS).
- Access tokens are short-lived and refresh tokens are stored securely.
- We use rate limiting and account lockout to protect against brute-force attacks.

No system is completely secure, and we cannot guarantee absolute security. Please notify us immediately at security@jmovelogistics.com if you believe your account has been compromised.`,
  },
  {
    title: '6. Your Rights',
    body: `Under the Nigeria Data Protection Act (NDPA) 2023, you have the right to:
- **Access** the personal data we hold about you.
- **Correct** inaccurate or incomplete information.
- **Delete** your account and associated personal data.
- **Object** to or restrict certain types of processing.
- **Data portability** — receive a copy of your data in a machine-readable format.

To exercise any of these rights, contact us at privacy@jmovelogistics.com. We will respond within 30 days.`,
  },
  {
    title: '7. Cookies',
    body: `We use only essential cookies required for the platform to function (session management, authentication state). We do not use advertising or tracking cookies. You can disable cookies in your browser settings, but this may affect the functionality of the platform.`,
  },
  {
    title: '8. Children\'s Privacy',
    body: `Our services are not directed at persons under the age of 18. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal information, we will delete it promptly.`,
  },
  {
    title: '9. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify you of material changes by email or by displaying a prominent notice on our platform at least 14 days before the change takes effect. Your continued use of our services after the effective date constitutes acceptance of the updated policy.`,
  },
  {
    title: '10. Contact Us',
    body: `If you have questions about this Privacy Policy or how we handle your data, please contact:

**JMove Logistics Ltd**
Email: privacy@jmovelogistics.com
Nigeria`,
  },
];

function renderBody(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('- ')) {
      return <li key={i} dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
    }
    if (line.trim() === '') return <br key={i} />;
    return <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
  });
}

export default function PrivacyPolicy() {
  return (
    <div className="sp-page">
      <nav className="sp-nav">
        <Link to="/" className="sp-nav-logo">
          <img src="/logo-dark.png" alt="JMove Logistics" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </Link>
        <Link to="/" className="sp-nav-back">← Back to Home</Link>
      </nav>

      <div className="sp-hero sp-hero--compact">
        <div className="sp-hero-inner">
          <p className="sp-eyebrow">Legal</p>
          <h1 className="sp-hero-title">Privacy Policy</h1>
          <p className="sp-hero-sub">Last updated: April 2025</p>
        </div>
      </div>

      <div className="sp-content sp-content--legal">
        <div className="legal-intro">
          JMove Logistics Ltd ("we", "us", or "our") is committed to protecting your privacy.
          This Privacy Policy explains how we collect, use, and safeguard your personal information
          when you use our platform and services.
        </div>

        {SECTIONS.map(s => (
          <div key={s.title} className="legal-section">
            <h2 className="legal-section-title">{s.title}</h2>
            <div className="legal-body">
              {renderBody(s.body)}
            </div>
          </div>
        ))}
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
