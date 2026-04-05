import nodemailer from 'nodemailer';

const getTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: +process.env.SMTP_PORT || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const wrap = (content, title) => `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;background:#f8f9fa;margin:0;padding:20px}
  .c{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .h{background:linear-gradient(135deg,#0F1923,#1A2E3E);padding:32px;text-align:center}
  .h h1{color:#F4A012;margin:0;font-size:26px;font-weight:800}
  .h p{color:rgba(255,255,255,.5);margin:4px 0 0;font-size:13px}
  .b{padding:32px;color:#222}
  .badge{display:inline-block;background:#F4A012;color:#0F1923;padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;margin-bottom:16px}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px}
  .rl{color:#888}.rv{font-weight:600}
  .btn{display:inline-block;background:#F4A012;color:#0F1923;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:20px}
  .f{background:#f8f9fa;padding:20px 32px;text-align:center;color:#888;font-size:12px}
</style></head>
<body><div class="c">
  <div class="h"><h1>⚡ JMove Logistics</h1><p>Logistics & Delivery Platform</p></div>
  <div class="b">${content}</div>
  <div class="f"><p>© ${new Date().getFullYear()} JMove Logistics. All rights reserved.</p></div>
</div></body></html>`;

const send = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USER) { console.log(`[Email Mock] To: ${to} | ${subject}`); return; }
  try { await getTransporter().sendMail({ from: `"JMove Logistics" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`, to, subject, html }); }
  catch (e) { console.error('Email error:', e.message); }
};

export const sendWelcome = ({ email, firstName }) =>
  send({ to: email, subject: 'Welcome to JMove Logistics!', html: wrap(`<h2>Welcome, ${firstName}! 🎉</h2><p>Your account is ready. Start creating shipments and tracking them in real-time.</p><a href="${process.env.FRONTEND_URL}" class="btn">Get Started</a>`, 'Welcome') });

export const sendOrderConfirmation = ({ email, firstName }, order) =>
  send({ to: email, subject: `Booking Confirmed — ${order.waybillNumber}`, html: wrap(`<div class="badge">Booking Confirmed</div><h2>Hi ${firstName}, your haulage is booked!</h2><div class="row"><span class="rl">Waybill</span><span class="rv">${order.waybillNumber}</span></div><div class="row"><span class="rl">From</span><span class="rv">${order.originCity}</span></div><div class="row"><span class="rl">To</span><span class="rv">${order.destinationCity}</span></div><div class="row"><span class="rl">Receiver</span><span class="rv">${order.receiverName}</span></div><div class="row"><span class="rl">Service</span><span class="rv">${order.serviceType}</span></div><div class="row"><span class="rl">Est. Delivery</span><span class="rv">${order.estimatedDelivery}</span></div><div class="row"><span class="rl">Amount</span><span class="rv">₦${Number(order.totalAmount).toLocaleString()}</span></div><a href="${process.env.FRONTEND_URL}/dashboard/orders/${order._id}" class="btn">Track Your Shipment</a>`, 'Booking Confirmed') });

export const sendOrderUpdate = ({ email, firstName }, order) => {
  const msgs = {
    booked:           ['📋', 'Your haulage booking is confirmed!'],
    assigned:         ['🚗', 'A driver has been assigned to your delivery!'],
    picked_up:        ['📦', 'Your goods have been picked up!'],
    in_transit:       ['🚚', 'Your goods are in transit!'],
    out_for_delivery: ['📍', 'Your goods are out for delivery!'],
    delivered:        ['✅', 'Your goods have been delivered successfully!'],
    returned:         ['↩️', 'Your goods are being returned.'],
    cancelled:        ['❌', 'Your booking has been cancelled.'],
  };
  const [emoji, msg] = msgs[order.status] || ['📋', 'Your order has been updated.'];
  return send({ to: email, subject: `${emoji} Shipment Update — ${order.waybillNumber}`, html: wrap(`<div class="badge">${emoji} ${order.status.replace(/_/g, ' ').toUpperCase()}</div><h2>Hi ${firstName}</h2><p>${msg}</p><div class="row"><span class="rl">Waybill</span><span class="rv">${order.waybillNumber}</span></div><div class="row"><span class="rl">Route</span><span class="rv">${order.originCity} → ${order.destinationCity}</span></div><a href="${process.env.FRONTEND_URL}/dashboard/orders/${order._id}" class="btn">Track Shipment</a>`, 'Shipment Update') });
};

export const sendPaymentReceipt = ({ email, firstName }, order, reference) =>
  send({ to: email, subject: `💳 Payment Confirmed — ${order.waybillNumber}`, html: wrap(`<div class="badge">💳 Payment Confirmed</div><h2>Payment received, ${firstName}!</h2><div class="row"><span class="rl">Waybill</span><span class="rv">${order.waybillNumber}</span></div><div class="row"><span class="rl">Route</span><span class="rv">${order.originCity} → ${order.destinationCity}</span></div><div class="row"><span class="rl">Amount</span><span class="rv">₦${Number(order.totalAmount).toLocaleString()}</span></div><div class="row"><span class="rl">Reference</span><span class="rv">${reference}</span></div><a href="${process.env.FRONTEND_URL}/dashboard/orders/${order._id}" class="btn">Track Delivery</a>`, 'Payment Receipt') });

export const sendDriverAssignment = ({ email, firstName }, order) =>
  send({ to: email, subject: `New Delivery Job — ${order.waybillNumber}`, html: wrap(`<div class="badge">New Job</div><h2>Hi ${firstName}, you have a new delivery!</h2><div class="row"><span class="rl">Waybill</span><span class="rv">${order.waybillNumber}</span></div><div class="row"><span class="rl">From</span><span class="rv">${order.originCity}${order.senderAddress ? ' — ' + order.senderAddress : ''}</span></div><div class="row"><span class="rl">Deliver to</span><span class="rv">${order.destinationCity} — ${order.receiverAddress}</span></div><div class="row"><span class="rl">Receiver</span><span class="rv">${order.receiverName} · ${order.receiverPhone}</span></div><div class="row"><span class="rl">Weight</span><span class="rv">${order.weight}kg</span></div><div class="row"><span class="rl">Service</span><span class="rv">${order.serviceType}</span></div><a href="${process.env.FRONTEND_URL}/driver/active" class="btn">Open Driver Hub</a>`, 'New Job') });

// ── OTP: email verification ──────────────────────────────
// ⚠️  NOTE: `otp` is NEVER logged in the send() function above — it goes
//    straight to the email body. In dev (no SMTP), we log it below ONLY
//    so developers can test without configuring a real mail server.
export const sendOtpVerification = ({ email, firstName, otp }) => {
  // DEV MODE ONLY — remove/guard this log if you add SMTP in staging
  if (!process.env.SMTP_USER) {
    console.log(`\n[OTP-DEV] ──────────────────────────────────────`);
    console.log(`  To:      ${email}`);
    console.log(`  Purpose: Email Verification`);
    console.log(`  OTP:     ${otp}  (valid 10 min)`);
    console.log(`────────────────────────────────────────────────\n`);
    return Promise.resolve();
  }
  return send({
    to:      email,
    subject: `🔐 ${otp} — Verify your JMove account`,
    html: wrap(`
      <h2>Hi ${firstName}, verify your email</h2>
      <p>Enter the code below to activate your JMove Logistics account.</p>
      <div style="margin:28px auto;text-align:center;">
        <div style="display:inline-block;background:#F4F4F4;border:2px dashed #D0D0D0;border-radius:12px;padding:20px 36px;">
          <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#0F1923;font-family:monospace;">${otp}</span>
        </div>
      </div>
      <div class="row"><span class="rl">Expires in</span><span class="rv">10 minutes</span></div>
      <p style="margin-top:20px;font-size:12px;color:#888;">
        This code is single-use. If you did not create a JMove account, you can safely ignore this email.
        Do not share this code with anyone.
      </p>
    `, 'Verify Your Email'),
  });
};

// ── OTP: password reset ──────────────────────────────────
export const sendPasswordResetOtp = ({ email, firstName, otp }) => {
  if (!process.env.SMTP_USER) {
    console.log(`\n[OTP-DEV] ──────────────────────────────────────`);
    console.log(`  To:      ${email}`);
    console.log(`  Purpose: Password Reset`);
    console.log(`  OTP:     ${otp}  (valid 10 min)`);
    console.log(`────────────────────────────────────────────────\n`);
    return Promise.resolve();
  }
  return send({
    to:      email,
    subject: `🔑 ${otp} — JMove password reset code`,
    html: wrap(`
      <h2>Hi ${firstName}, reset your password</h2>
      <p>Use the code below to reset your JMove Logistics password.</p>
      <div style="margin:28px auto;text-align:center;">
        <div style="display:inline-block;background:#F4F4F4;border:2px dashed #D0D0D0;border-radius:12px;padding:20px 36px;">
          <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#0F1923;font-family:monospace;">${otp}</span>
        </div>
      </div>
      <div class="row"><span class="rl">Expires in</span><span class="rv">10 minutes</span></div>
      <p style="margin-top:20px;font-size:12px;color:#888;">
        If you did not request a password reset, your account is safe — ignore this email.
        Your password will NOT change unless you use this code.
        Do not share this code with anyone.
      </p>
    `, 'Password Reset'),
  });
};
