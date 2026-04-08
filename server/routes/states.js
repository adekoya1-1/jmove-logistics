import { Router } from 'express';
import { State } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { invalidateCache } from '../services/pricingService.js';

const router = Router();

// GET /api/states - Fetch all states with availability status
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const states = await State.find().sort({ direction: 1, name: 1 }).lean();
    res.json({ success: true, data: states });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/states/:id/toggle - Toggle isActive status
router.patch('/:id/toggle', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const state = await State.findById(req.params.id);
    if (!state) return res.status(404).json({ success: false, message: 'State not found' });

    state.isActive = !state.isActive;
    await state.save();

    // MUST invalidate pricing service cache so customer endpoints immediately reflect the change
    invalidateCache();

    res.json({ success: true, data: state, message: `State ${state.name} is now ${state.isActive ? 'Active' : 'Inactive'}` });
  } catch (e) {
    next(e);
  }
});

export default router;
