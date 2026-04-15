/**
 * ═══════════════════════════════════════════════════════════════
 *  EMAIL SERVICE  —  powered by Resend
 *
 *  Architecture:
 *    • sendEmail()           — core send with retry + validation
 *    • sendOtpVerification() — account email-verification OTP
 *    • sendPasswordResetOtp()— password-reset OTP
 *    • sendWelcome()         — post-verification welcome
 *    • sendOrderConfirmation()— new booking confirmation
 *    • sendOrderUpdate()     — status change notification
 *    • sendPaymentReceipt()  — payment success receipt
 *    • sendDriverAssignment()— new job notification for drivers
 *    • sendNotification()    — generic transactional notice
 *
 *  Security:
 *    • API key read exclusively from RESEND_API_KEY env var
 *    • All user content HTML-escaped before injection into templates
 *    • Email format validated before every send attempt
 *    • OTPs never logged in production
 *    • Errors caught and returned — never crash the caller
 *
 *  Reliability:
 *    • Exponential-backoff retry (up to 3 attempts) on 5xx/network errors
 *    • 4xx client errors (bad API key, domain not verified) fail fast — no retry
 *    • Every function is non-blocking; callers should fire-and-forget with .catch()
 *
 *  Dev mode (no RESEND_API_KEY set):
 *    • Logs email metadata to the console instead of calling Resend
 *    • OTP is printed to console so developers can test without a mail server
 * ═══════════════════════════════════════════════════════════════
 */

import { Resend } from 'resend';

// ── Lazy client singleton ─────────────────────────────────────
// Instantiated once on first use so the module loads even without the key
// (tests, migrations, seeding) — the key is only required at send time.
let _client = null;
const getClient = () => {
  if (_client) return _client;
  if (!process.env.RESEND_API_KEY) return null;          // dev/test mode
  _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
};

// ── Config ────────────────────────────────────────────────────
const FROM_ADDRESS  = process.env.EMAIL_FROM   || 'JMove Logistics <noreply@jmovelogistics.com>';
const FRONTEND_URL  = process.env.FRONTEND_URL || 'https://jmovelogistics.com';
const IS_PROD       = process.env.NODE_ENV === 'production';

// ── Security: HTML-escape user-supplied strings ───────────────
// Prevents XSS / email-injection if any content is rendered in templates.
const esc = (val) =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

// ── Security: validate email format ──────────────────────────
const isValidEmail = (email) =>
  typeof email === 'string' &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

// ─────────────────────────────────────────────────────────────
//  HTML TEMPLATE ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * Base wrapper — every outgoing email uses this shell.
 * Inline CSS only (email clients strip <style> blocks).
 * Table-based structure for Outlook compatibility.
 */
const baseTemplate = ({ title, preheader = '', body }) => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F2F5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader: shown in inbox preview, hidden in body -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#F0F2F5;">
    ${esc(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#F0F2F5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:580px;background:#FFFFFF;border-radius:16px;
                      box-shadow:0 4px 32px rgba(0,0,0,0.10);overflow:hidden;">

          <!-- ── Header ── -->
          <tr>
            <td style="background:linear-gradient(135deg,#0F1923 0%,#1A2E3E 100%);
                       padding:28px 40px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="font-size:22px;font-weight:900;color:#F4A012;
                                 letter-spacing:-0.5px;font-family:-apple-system,
                                 BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                      &#9889; JMove Logistics
                    </span>
                    <br />
                    <span style="font-size:11px;color:rgba(255,255,255,0.4);
                                 letter-spacing:1.5px;text-transform:uppercase;
                                 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                      Haulage &amp; Logistics Platform
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:36px 40px 28px;color:#1F2937;
                       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
              ${body}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="background:#F8F9FA;border-top:1px solid #E5E7EB;
                       padding:20px 40px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#9CA3AF;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                &copy; ${new Date().getFullYear()} JMove Logistics Ltd. All rights reserved.
              </p>
              <p style="margin:0;font-size:11px;color:#D1D5DB;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                Nigeria&apos;s trusted haulage partner &middot;
                <a href="${FRONTEND_URL}"
                   style="color:#F4A012;text-decoration:none;">jmovelogistics.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

// ── Reusable template partials ────────────────────────────────

const badge = (text, color = '#F4A012') =>
  `<span style="display:inline-block;background:${color};color:#0F1923;
    padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;
    letter-spacing:0.3px;margin-bottom:20px;">${esc(text)}</span>`;

const heading = (text) =>
  `<h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0F1923;
    line-height:1.3;">${esc(text)}</h2>`;

const subtext = (text) =>
  `<p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.7;">${esc(text)}</p>`;

const detailRow = (label, value) =>
  `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #F3F4F6;font-size:13px;
               color:#9CA3AF;width:40%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #F3F4F6;font-size:13px;
               color:#111827;font-weight:600;text-align:right;vertical-align:top;">${esc(value)}</td>
  </tr>`;

const detailTable = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="margin:20px 0 28px;">${rows}</table>`;

const ctaButton = (text, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
    <tr>
      <td style="background:#F4A012;border-radius:8px;text-align:center;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:13px 32px;color:#0F1923;
                  font-size:14px;font-weight:700;text-decoration:none;
                  letter-spacing:0.3px;">
          ${esc(text)}
        </a>
      </td>
    </tr>
  </table>`;

const divider = () =>
  `<hr style="border:none;border-top:1px solid #F3F4F6;margin:24px 0;" />`;

const smallNote = (text) =>
  `<p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;line-height:1.7;
    border-left:3px solid #F3F4F6;padding-left:12px;">${esc(text)}</p>`;

// ─────────────────────────────────────────────────────────────
//  CORE SEND FUNCTION  —  retry + validation
// ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1000; // 1s → 2s exponential backoff

/**
 * Sends an email via Resend with exponential-backoff retry on transient errors.
 *
 * @param {{ to: string, subject: string, html: string }} opts
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string, dev?: boolean }>}
 *
 * Never throws — always returns a result object.
 * Callers that don't care about the result can fire-and-forget with .catch(console.error).
 */
const sendEmail = async ({ to, subject, html }) => {
  // ── Input validation ─────────────────────────────────────
  if (!isValidEmail(to)) {
    console.error(`[EmailService] Refused to send — invalid address: "${to}"`);
    return { ok: false, error: 'Invalid email address' };
  }
  if (!subject || typeof subject !== 'string') {
    console.error('[EmailService] Refused to send — missing subject');
    return { ok: false, error: 'Missing subject' };
  }

  const client = getClient();

  // ── Dev / CI mode (no API key configured) ────────────────
  if (!client) {
    console.log(`\n[EmailService DEV] ${'─'.repeat(48)}`);
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  (set RESEND_API_KEY to send real emails)`);
    console.log(`${'─'.repeat(50)}\n`);
    return { ok: true, dev: true };
  }

  // ── Send with retry ───────────────────────────────────────
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await client.emails.send({
        from: FROM_ADDRESS,
        to:   [to],
        subject,
        html,
      });

      if (error) {
        // Resend returns { data: null, error } on API-level errors.
        // 4xx = caller mistake (bad key, unverified domain) → fail fast, no retry.
        const status = error.statusCode ?? 0;
        if (status >= 400 && status < 500) {
          console.error(`[EmailService] Client error (${status}) — no retry: ${error.message}`);
          return { ok: false, error: error.message };
        }
        // 5xx / unknown → retry
        throw new Error(`Resend API error (${status}): ${error.message}`);
      }

      return { ok: true, messageId: data?.id };

    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === MAX_ATTEMPTS;

      if (!isLastAttempt) {
        const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1); // 1s, 2s
        console.warn(
          `[EmailService] Attempt ${attempt}/${MAX_ATTEMPTS} failed — retrying in ${delayMs}ms. Error: ${err.message}`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  // All attempts exhausted
  console.error(
    `[EmailService] Delivery failed after ${MAX_ATTEMPTS} attempts to "${to}". Last error: ${lastError?.message}`
  );
  return { ok: false, error: lastError?.message ?? 'Email delivery failed' };
};

// ─────────────────────────────────────────────────────────────
//  OTP: EMAIL VERIFICATION
// ─────────────────────────────────────────────────────────────

/**
 * @param {{ email: string, firstName: string, otp: string }} opts
 * ⚠️  `otp` goes straight into the email body and is NEVER logged in production.
 *    In dev mode (no API key) it is printed to console for developer convenience.
 */
export const sendOtpVerification = ({ email, firstName, otp }) => {
  // Dev-only OTP console log — guarded by IS_PROD and API key absence
  if (!IS_PROD && !process.env.RESEND_API_KEY) {
    console.log(`\n[OTP DEV] ${'─'.repeat(44)}`);
    console.log(`  To:      ${email}`);
    console.log(`  Purpose: Email Verification`);
    console.log(`  OTP:     ${otp}  (valid 10 min)`);
    console.log(`${'─'.repeat(46)}\n`);
    return Promise.resolve({ ok: true, dev: true });
  }

  const body = `
    ${badge('Email Verification')}
    ${heading(`Hi ${firstName}, verify your email`)}
    ${subtext('Enter the 6-digit code below to activate your JMove Logistics account.')}

    <!-- OTP box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 28px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:#F9FAFB;border:2px dashed #D1D5DB;
                      border-radius:14px;padding:24px 48px;text-align:center;">
            <span style="font-size:44px;font-weight:900;letter-spacing:12px;
                         color:#0F1923;font-family:'Courier New',Courier,monospace;
                         display:block;line-height:1;">${otp}</span>
            <span style="font-size:12px;color:#9CA3AF;display:block;margin-top:10px;
                         letter-spacing:0.5px;">YOUR VERIFICATION CODE</span>
          </div>
        </td>
      </tr>
    </table>

    ${detailTable(detailRow('Expires in', '10 minutes') + detailRow('Single-use', 'Yes — code is invalidated after use'))}
    ${smallNote('If you did not create a JMove Logistics account, you can safely ignore this email. Do not share this code with anyone.')}
  `;

  return sendEmail({
    to:      email,
    subject: `${otp} — Verify your JMove Logistics account`,
    html:    baseTemplate({ title: 'Verify Your Email', preheader: `Your verification code is ${otp}. Valid for 10 minutes.`, body }),
  });
};

// ─────────────────────────────────────────────────────────────
//  OTP: PASSWORD RESET
// ─────────────────────────────────────────────────────────────

/**
 * @param {{ email: string, firstName: string, otp: string }} opts
 */
export const sendPasswordResetOtp = ({ email, firstName, otp }) => {
  if (!IS_PROD && !process.env.RESEND_API_KEY) {
    console.log(`\n[OTP DEV] ${'─'.repeat(44)}`);
    console.log(`  To:      ${email}`);
    console.log(`  Purpose: Password Reset`);
    console.log(`  OTP:     ${otp}  (valid 10 min)`);
    console.log(`${'─'.repeat(46)}\n`);
    return Promise.resolve({ ok: true, dev: true });
  }

  const body = `
    ${badge('Password Reset', '#EF4444')}
    ${heading(`Hi ${firstName}, reset your password`)}
    ${subtext('Use the code below to reset your JMove Logistics password. If you did not request this, your account is safe.')}

    <!-- OTP box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 28px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:#FFF7F7;border:2px dashed #FCA5A5;
                      border-radius:14px;padding:24px 48px;text-align:center;">
            <span style="font-size:44px;font-weight:900;letter-spacing:12px;
                         color:#7F1D1D;font-family:'Courier New',Courier,monospace;
                         display:block;line-height:1;">${otp}</span>
            <span style="font-size:12px;color:#EF4444;display:block;margin-top:10px;
                         letter-spacing:0.5px;">PASSWORD RESET CODE</span>
          </div>
        </td>
      </tr>
    </table>

    ${detailTable(
      detailRow('Expires in', '10 minutes') +
      detailRow('Single-use', 'Yes — code is invalidated after use') +
      detailRow('Your password', 'Will NOT change unless you use this code')
    )}
    ${smallNote('If you did not request a password reset, ignore this email. Your account remains secure. Do not share this code with anyone.')}
  `;

  return sendEmail({
    to:      email,
    subject: `${otp} — JMove Logistics password reset code`,
    html:    baseTemplate({ title: 'Reset Your Password', preheader: `Your password reset code is ${otp}. Valid for 10 minutes.`, body }),
  });
};

// ─────────────────────────────────────────────────────────────
//  WELCOME — post email-verification
// ─────────────────────────────────────────────────────────────

export const sendWelcome = ({ email, firstName }) => {
  const body = `
    ${badge('Welcome to JMove Logistics! 🎉')}
    ${heading(`Welcome aboard, ${firstName}!`)}
    ${subtext('Your account is verified and ready. You can now book haulage, track your shipments in real time, and manage your deliveries from anywhere.')}

    ${detailTable(
      detailRow('Coverage', 'All 36 Nigerian states') +
      detailRow('Tracking', 'Real-time updates on every shipment') +
      detailRow('Pricing',  'Transparent — no hidden charges') +
      detailRow('Support',  '24/7 customer service')
    )}

    ${ctaButton('Book Your First Shipment →', `${FRONTEND_URL}/dashboard/new-order`)}
    ${smallNote('Need help getting started? Visit our Help Centre or contact our support team from your dashboard.')}
  `;

  return sendEmail({
    to:      email,
    subject: 'Welcome to JMove Logistics — your account is ready',
    html:    baseTemplate({ title: 'Welcome to JMove Logistics', preheader: `Welcome, ${firstName}! Your JMove Logistics account is active. Start booking shipments today.`, body }),
  });
};

// ─────────────────────────────────────────────────────────────
//  ORDER CONFIRMATION
// ─────────────────────────────────────────────────────────────

export const sendOrderConfirmation = ({ email, firstName }, order) => {
  const orderUrl = `${FRONTEND_URL}/dashboard/orders/${order._id}`;
  const amount   = `₦${Number(order.totalAmount || 0).toLocaleString('en-NG')}`;

  const body = `
    ${badge('Booking Confirmed ✓')}
    ${heading(`Hi ${firstName}, your haulage is booked!`)}
    ${subtext(`Your shipment from ${esc(order.originCity)} to ${esc(order.destinationCity)} is confirmed. Here is your booking summary.`)}

    ${detailTable(
      detailRow('Waybill Number',    order.waybillNumber) +
      detailRow('From',              order.originCity) +
      detailRow('To',                order.destinationCity) +
      detailRow('Receiver',          `${order.receiverName} · ${order.receiverPhone}`) +
      detailRow('Service Type',      (order.serviceType || 'standard').charAt(0).toUpperCase() + (order.serviceType || 'standard').slice(1)) +
      detailRow('Estimated Delivery',order.estimatedDelivery || 'Confirmed on pickup') +
      detailRow('Payment Method',    (order.paymentMethod || 'online').toUpperCase()) +
      detailRow('Total Amount',      amount)
    )}

    ${ctaButton('Track Your Shipment →', orderUrl)}
    ${divider()}
    <p style="font-size:13px;color:#6B7280;margin:0;line-height:1.7;">
      Questions about your booking?
      <a href="${FRONTEND_URL}/help" style="color:#F4A012;text-decoration:none;font-weight:600;">Visit our Help Centre</a>
      or reply to this email.
    </p>
  `;

  return sendEmail({
    to:      email,
    subject: `Booking confirmed — Waybill ${esc(order.waybillNumber)}`,
    html:    baseTemplate({
      title:     'Booking Confirmed',
      preheader: `Your shipment ${order.waybillNumber} from ${order.originCity} to ${order.destinationCity} is confirmed.`,
      body,
    }),
  });
};

// ─────────────────────────────────────────────────────────────
//  ORDER STATUS UPDATE
// ─────────────────────────────────────────────────────────────

const STATUS_META = {
  booked:           { emoji: '📋', label: 'Booking Confirmed',     color: '#3B82F6', msg: 'Your haulage booking is confirmed and a driver will be assigned shortly.' },
  assigned:         { emoji: '🚗', label: 'Driver Assigned',       color: '#8B5CF6', msg: 'A professional driver has been assigned to your delivery.' },
  picked_up:        { emoji: '📦', label: 'Goods Picked Up',       color: '#F59E0B', msg: 'Your goods have been collected and are ready for transit.' },
  in_transit:       { emoji: '🚚', label: 'In Transit',            color: '#F59E0B', msg: 'Your goods are on the road and heading to the destination.' },
  out_for_delivery: { emoji: '📍', label: 'Out for Delivery',      color: '#10B981', msg: 'Your goods are out for delivery and will arrive soon.' },
  delivered:        { emoji: '✅', label: 'Delivered',             color: '#10B981', msg: 'Your goods have been delivered successfully. Thank you for choosing JMove Logistics!' },
  returned:         { emoji: '↩️', label: 'Being Returned',        color: '#EF4444', msg: 'Your goods are being returned. Please contact support for details.' },
  cancelled:        { emoji: '❌', label: 'Booking Cancelled',     color: '#EF4444', msg: 'Your booking has been cancelled. Contact support if this is unexpected.' },
};

export const sendOrderUpdate = ({ email, firstName }, order) => {
  const meta     = STATUS_META[order.status] || STATUS_META.booked;
  const orderUrl = `${FRONTEND_URL}/dashboard/orders/${order._id}`;

  const body = `
    ${badge(`${meta.emoji} ${meta.label}`, meta.color)}
    ${heading(`Hi ${firstName}`)}
    ${subtext(meta.msg)}

    ${detailTable(
      detailRow('Waybill', order.waybillNumber) +
      detailRow('Route',   `${order.originCity} → ${order.destinationCity}`) +
      detailRow('Status',  meta.label)
    )}

    ${ctaButton('View Shipment Details →', orderUrl)}
  `;

  return sendEmail({
    to:      email,
    subject: `${meta.emoji} Shipment update — ${esc(order.waybillNumber)}`,
    html:    baseTemplate({
      title:     `Shipment Update — ${meta.label}`,
      preheader: `${meta.msg} Waybill: ${order.waybillNumber}`,
      body,
    }),
  });
};

// ─────────────────────────────────────────────────────────────
//  PAYMENT RECEIPT
// ─────────────────────────────────────────────────────────────

export const sendPaymentReceipt = ({ email, firstName }, order, reference) => {
  const orderUrl = `${FRONTEND_URL}/dashboard/orders/${order._id}`;
  const amount   = `₦${Number(order.totalAmount || 0).toLocaleString('en-NG')}`;

  const body = `
    ${badge('💳 Payment Confirmed')}
    ${heading(`Payment received, ${firstName}!`)}
    ${subtext('Your payment has been processed successfully. Here is your receipt.')}

    ${detailTable(
      detailRow('Waybill',        order.waybillNumber) +
      detailRow('Route',          `${order.originCity} → ${order.destinationCity}`) +
      detailRow('Amount Paid',    amount) +
      detailRow('Reference',      reference || 'N/A') +
      detailRow('Payment Status', 'Confirmed ✓')
    )}

    ${ctaButton('Track Your Delivery →', orderUrl)}
    ${smallNote('Keep this email as your payment receipt. The reference number above can be used for any payment-related queries.')}
  `;

  return sendEmail({
    to:      email,
    subject: `💳 Payment confirmed — ${esc(order.waybillNumber)}`,
    html:    baseTemplate({
      title:     'Payment Confirmed',
      preheader: `Payment of ${amount} received for waybill ${order.waybillNumber}.`,
      body,
    }),
  });
};

// ─────────────────────────────────────────────────────────────
//  DRIVER JOB ASSIGNMENT
// ─────────────────────────────────────────────────────────────

export const sendDriverAssignment = ({ email, firstName }, order) => {
  const driverUrl = `${FRONTEND_URL}/driver/active`;
  const weight    = order.weight ? `${order.weight}kg` : 'N/A';

  const body = `
    ${badge('New Delivery Job 🚚')}
    ${heading(`Hi ${firstName}, you have a new delivery!`)}
    ${subtext('A new job has been assigned to you. Review the details below and accept it from your driver dashboard.')}

    ${detailTable(
      detailRow('Waybill',      order.waybillNumber) +
      detailRow('Pickup',       `${order.originCity}${order.senderAddress ? ' — ' + order.senderAddress : ''}`) +
      detailRow('Delivery',     `${order.destinationCity} — ${order.receiverAddress}`) +
      detailRow('Receiver',     `${order.receiverName} · ${order.receiverPhone}`) +
      detailRow('Weight',       weight) +
      detailRow('Service Type', (order.serviceType || 'standard').charAt(0).toUpperCase() + (order.serviceType || 'standard').slice(1))
    )}

    ${ctaButton('Open Driver Hub →', driverUrl)}
    ${smallNote('Accept or decline the job from your driver dashboard. Contact support if you have any issues with this assignment.')}
  `;

  return sendEmail({
    to:      email,
    subject: `New delivery job — ${esc(order.waybillNumber)}`,
    html:    baseTemplate({
      title:     'New Delivery Job',
      preheader: `New job assigned: ${order.originCity} → ${order.destinationCity}. Waybill: ${order.waybillNumber}`,
      body,
    }),
  });
};

// ─────────────────────────────────────────────────────────────
//  GENERIC NOTIFICATION
// ─────────────────────────────────────────────────────────────

/**
 * General-purpose transactional email for system notifications,
 * admin alerts, or any bespoke message.
 *
 * @param {{ email: string, firstName?: string }} recipient
 * @param {{ subject: string, message: string, ctaText?: string, ctaUrl?: string }} opts
 */
export const sendNotification = ({ email, firstName = '' }, { subject, message, ctaText, ctaUrl }) => {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hello,';

  const body = `
    ${badge('Notification')}
    <p style="font-size:15px;font-weight:600;color:#0F1923;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:14px;color:#374151;line-height:1.75;margin:0 0 24px;">${esc(message)}</p>
    ${ctaText && ctaUrl ? ctaButton(ctaText, ctaUrl) : ''}
    ${divider()}
    <p style="font-size:13px;color:#9CA3AF;margin:0;">
      This is an automated notification from JMove Logistics.
    </p>
  `;

  return sendEmail({
    to:      email,
    subject: esc(subject),
    html:    baseTemplate({ title: esc(subject), preheader: esc(message), body }),
  });
};
