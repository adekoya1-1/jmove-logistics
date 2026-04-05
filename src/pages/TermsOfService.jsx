import { Link } from 'react-router-dom';
import './StaticPage.css';
import PublicNav from '../components/PublicNav.jsx';

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By accessing or using the JMove Logistics platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.

These terms apply to all users including customers, guests, and any other persons accessing the platform.`,
  },
  {
    title: '2. Description of Service',
    body: `JMove Logistics provides a digital platform that enables customers to:
- Book haulage and logistics services across Nigeria.
- Track shipments in real time using a waybill number.
- Make and manage payments for logistics services.
- Communicate with our operations team and assigned drivers.

We act as an intermediary between customers and our network of employed professional drivers. All drivers operate under the supervision and standards of JMove Logistics Ltd.`,
  },
  {
    title: '3. Account Registration',
    body: `To use our booking services, you must register for an account. You agree to:
- Provide accurate, current, and complete information during registration.
- Verify your email address via OTP before your account becomes active.
- Keep your password confidential and not share your account credentials.
- Notify us immediately at security@jmovelogistics.com if you suspect unauthorised access.

You are responsible for all activity that occurs under your account. We reserve the right to suspend or terminate accounts that violate these terms.`,
  },
  {
    title: '4. Booking and Orders',
    body: `**4.1 Bookings**: A booking is confirmed only after successful payment. Upon confirmation, a waybill number is generated and sent to your email.

**4.2 Accuracy of Information**: You are responsible for providing accurate pickup address, delivery address, and goods description. Inaccurate information that results in failed or delayed delivery may incur additional charges.

**4.3 Prohibited Goods**: You must not ship the following:
- Illegal or controlled substances
- Weapons, ammunition, or explosives
- Hazardous, flammable, or toxic materials
- Live animals
- Human remains
- Currency or negotiable instruments above ₦500,000

JMove Logistics reserves the right to refuse or terminate any shipment found to contain prohibited items. Law enforcement may be notified.

**4.4 Cancellations**: Cancellations before driver assignment are free. After driver assignment, a cancellation fee of up to 20% of the order value may apply.`,
  },
  {
    title: '5. Payments',
    body: `All payments are processed via Paystack. By making a payment, you agree to Paystack's terms and conditions in addition to ours.

**5.1 Pricing**: Prices are calculated based on route, vehicle type, and goods weight/volume. All prices are displayed in Nigerian Naira (NGN) and are inclusive of applicable VAT.

**5.2 Refunds**: Refunds for eligible cancellations are processed within 3–5 business days to your original payment method. We do not issue cash refunds.

**5.3 Failed Payments**: If your payment fails, your booking will not be confirmed. Please ensure your card or account has sufficient funds.`,
  },
  {
    title: '6. Liability and Claims',
    body: `**6.1 Liability Limit**: JMove Logistics' liability for loss or damage to goods is limited to the declared value of the goods at the time of booking, up to a maximum of ₦500,000 per shipment unless additional insurance is purchased.

**6.2 Claims Process**: Damage or loss claims must be reported within 48 hours of delivery (or scheduled delivery date for missing shipments). Claims submitted after this window may not be processed.

**6.3 Exclusions**: We are not liable for:
- Delays caused by traffic, road conditions, or force majeure events.
- Damage resulting from inadequate packaging by the customer.
- Loss or damage to prohibited items.
- Indirect, consequential, or incidental losses.`,
  },
  {
    title: '7. Acceptable Use',
    body: `You agree not to:
- Use the platform for any unlawful purpose.
- Attempt to gain unauthorised access to any part of our system.
- Reverse-engineer, decompile, or disassemble any part of the Service.
- Use automated tools to scrape, crawl, or overload our platform.
- Impersonate another person or provide false information.
- Interfere with the proper working of the Service.

Violation of these terms may result in immediate account termination and, where applicable, legal action.`,
  },
  {
    title: '8. Intellectual Property',
    body: `All content on the JMove Logistics platform — including logos, text, graphics, software, and code — is owned by JMove Logistics Ltd or its licensors. You may not reproduce, distribute, or create derivative works without our express written permission.`,
  },
  {
    title: '9. Modifications to Terms',
    body: `We reserve the right to modify these terms at any time. We will notify users of material changes at least 14 days before they take effect via email or a notice on the platform. Continued use of the Service after the effective date constitutes acceptance of the revised terms.`,
  },
  {
    title: '10. Governing Law',
    body: `These Terms of Service are governed by the laws of the Federal Republic of Nigeria. Any disputes arising from or relating to these terms or the use of our Service shall be subject to the exclusive jurisdiction of the Nigerian courts.`,
  },
  {
    title: '11. Contact',
    body: `For questions about these Terms of Service, contact us at:

**JMove Logistics Ltd**
Email: legal@jmovelogistics.com
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

export default function TermsOfService() {
  return (
    <div className="sp-page">
      <PublicNav />

      <div className="sp-hero sp-hero--compact">
        <div className="sp-hero-inner">
          <p className="sp-eyebrow">Legal</p>
          <h1 className="sp-hero-title">Terms of Service</h1>
          <p className="sp-hero-sub">Last updated: April 2025</p>
        </div>
      </div>

      <div className="sp-content sp-content--legal">
        <div className="legal-intro">
          Please read these Terms of Service carefully before using the JMove Logistics platform.
          These terms constitute a legally binding agreement between you and JMove Logistics Ltd.
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
