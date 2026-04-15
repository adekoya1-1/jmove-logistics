/**
 * email.js — backward-compatibility re-export
 *
 * All routes (auth.js, orders.js, payments.js) continue to import from
 * '../utils/email.js' without modification.  The actual implementation
 * lives in ../services/emailService.js (Resend SDK).
 *
 * To swap providers in the future, only emailService.js needs to change.
 */
export {
  sendWelcome,
  sendOrderConfirmation,
  sendOrderUpdate,
  sendPaymentReceipt,
  sendDriverAssignment,
  sendOtpVerification,
  sendPasswordResetOtp,
  sendNotification,
} from '../services/emailService.js';
