/**
 * ─────────────────────────────────────────────────────────
 *  INPUT SANITIZATION MIDDLEWARE
 *
 *  1. express-mongo-sanitize  → strips $ and . from keys
 *     prevents: { "email": { "$gt": "" } } injection
 *
 *  2. Manual XSS cleaner      → strips <script>, HTML tags
 *     from string values recursively
 *
 *  3. HTTP Parameter Pollution → rejects duplicate query params
 *
 *  Order in index.js: body-parse → mongoSanitize → xssSanitize → hpp
 * ─────────────────────────────────────────────────────────
 */
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';

// ── 1. NoSQL Injection prevention ────────────────────────
//  Strips keys containing $ or . (Mongoose operators used in injection)
export const noSqlSanitize = mongoSanitize({
  replaceWith: '_',        // replace forbidden chars with _ rather than removing
  onSanitizeValue: (key, path) => {
    console.warn(`[Security] NoSQL injection attempt — key: "${key}" path: "${path}" ip: (see request)`);
  },
});

// ── 2. XSS sanitizer ─────────────────────────────────────
//  Recursively walks req.body, req.query, req.params
//  and strips HTML tags from string values.
//  NOTE: We do NOT use a heavy HTML sanitizer here because
//  this is a JSON API (not rendering HTML). We strip all tags
//  to prevent stored XSS if data is ever rendered client-side.
const stripTags = (value) => {
  if (typeof value === 'string') {
    return value
      .replace(/<[^>]*>/g, '')          // strip HTML tags
      .replace(/javascript:/gi, '')      // strip js: URIs
      .replace(/on\w+\s*=/gi, '')        // strip onX= event handlers
      .trim();
  }
  if (Array.isArray(value))  return value.map(stripTags);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const out = {};
    for (const k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        out[k] = stripTags(value[k]);
      }
    }
    return out;
  }
  return value;
};

export const xssSanitize = (req, res, next) => {
  req.body   = stripTags(req.body);
  req.query  = stripTags(req.query);
  // Note: do NOT sanitize req.params here — Zod does it on validated routes
  next();
};

// ── 3. HPP — HTTP Parameter Pollution ───────────────────
//  Prevents: /route?role=admin&role=customer (picks last value)
//  Whitelist params that are legitimately array-valued
export const hppProtect = hpp({
  whitelist: ['permissions', 'status'],
});
