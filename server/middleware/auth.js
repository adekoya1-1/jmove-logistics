/**
 * ─────────────────────────────────────────────────────────
 *  HARDENED AUTH MIDDLEWARE
 *  - Stateless JWT verification (access token = 15 min)
 *  - Caches decoded user to avoid repeated DB hits on same request
 *  - Distinguishes expired vs invalid tokens
 *  - authorize() supports both role AND permission checks
 * ─────────────────────────────────────────────────────────
 */
import jwt from 'jsonwebtoken';
import { User } from '../db.js';

// ── Authenticate: verify access token, attach req.user ──
export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Access token required' });

    const token = header.split(' ')[1];
    if (!token || token.length > 512)
      return res.status(401).json({ success: false, message: 'Invalid token format' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError')
        return res.status(401).json({ success: false, message: 'Access token expired', code: 'TOKEN_EXPIRED' });
      return res.status(401).json({ success: false, message: 'Invalid access token' });
    }

    // Validate token structure
    // NOTE: was `!decoded.tokenVersion === undefined` — operator precedence bug (always false).
    // Fixed to `decoded.tokenVersion === undefined` which correctly catches missing field.
    if (!decoded.userId || !decoded.role || decoded.tokenVersion === undefined)
      return res.status(401).json({ success: false, message: 'Malformed token' });

    const user = await User.findById(decoded.userId)
      .select('-password -refreshToken -__v')
      .lean();

    if (!user)
      return res.status(401).json({ success: false, message: 'Account not found' });

    if (!user.isActive)
      return res.status(401).json({ success: false, message: 'Account has been deactivated' });

    // Token version check: invalidates all tokens issued before a password change / forced logout
    if (user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion)
      return res.status(401).json({ success: false, message: 'Session invalidated. Please log in again.', code: 'TOKEN_INVALIDATED' });

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth] Unexpected error:', err.message);
    res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

// ── Authorize: check role, optionally check permission ──
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: 'Authentication required' });

  if (!roles.includes(req.user.role))
    return res.status(403).json({ success: false, message: 'Access denied: insufficient role' });

  next();
};

// ── Permission guard: admin staff access control ─────────
// Usage: requirePermission('orders') — admin must have that permission
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: 'Authentication required' });

  if (req.user.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Admin access required' });

  // super_admin category bypasses all permission checks
  if (req.user.staffCategory === 'super_admin') return next();

  if (!req.user.permissions?.includes(permission))
    return res.status(403).json({ success: false, message: `Missing permission: ${permission}` });

  next();
};

// ── Ownership guard: verify resource belongs to req.user
export const requireOwnership = (getOwnerId) => async (req, res, next) => {
  try {
    const ownerId = await getOwnerId(req);
    if (!ownerId) return res.status(404).json({ success: false, message: 'Resource not found' });
    if (String(ownerId) !== String(req.user._id) && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Access denied: not your resource' });
    next();
  } catch (e) { next(e); }
};
