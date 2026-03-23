import jwt from 'jsonwebtoken';
import { User } from '../db.js';

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Access token required' });

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.userId).select('-password -refreshToken');

    if (!user || !user.isActive)
      return res.status(401).json({ success: false, message: 'User not found or inactive' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: 'Authentication required' });
  if (!roles.includes(req.user.role))
    return res.status(403).json({ success: false, message: `Access denied. Required: ${roles.join(', ')}` });
  next();
};
