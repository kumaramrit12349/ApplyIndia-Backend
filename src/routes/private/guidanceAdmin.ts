import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import {
  createSlot,
  listSlotsForAdmin,
  setSlotAvailability,
  cancelSlot,
} from "../../services/private/guidanceSlotService";
import {
  listBookingsForAdmin,
  markBookingOutcome,
} from "../../services/private/guidanceBookingService";
import {
  listFeedbackForModeration,
  moderateFeedback,
  getGuidanceStats,
} from "../../services/private/guidanceFeedbackService";
import { GUIDANCE_BOOKING_STATUS } from "../../db_schema/GuidanceBooking/GuidanceBookingConstant";

const router = Router();
router.use(authenticateTokenAndEmail);
router.use(requireRole("admin"));

function respondError(res: any, error: any, fallback: string) {
  console.error(error);
  res.status(400).json({ success: false, error: error?.message || fallback });
}

// POST /api/guidance-admin/slots  { notification_id, start_time, meet_link, notes? }
router.post("/slots", async (req, res) => {
  try {
    const adminSub = (req as any).user?.sub;
    const { notification_id, start_time, meet_link, notes } = req.body;
    const slot = await createSlot(adminSub, { notification_id, start_time: Number(start_time), meet_link, notes });
    res.json({ success: true, data: slot });
  } catch (error) {
    respondError(res, error, "Failed to create slot");
  }
});

// POST /api/guidance-admin/slots/list  { notificationId?, status?, limit?, startKey? }
router.post("/slots/list", async (req, res) => {
  try {
    const { notificationId, status, limit = 30, startKey } = req.body;
    const data = await listSlotsForAdmin(notificationId, status, limit, startKey);
    res.json({ success: true, ...data });
  } catch (error) {
    respondError(res, error, "Failed to list slots");
  }
});

// PATCH /api/guidance-admin/slots/:id/availability  { available: boolean }
router.patch("/slots/:id/availability", async (req, res) => {
  try {
    const slot = await setSlotAvailability(decodeURIComponent(req.params.id), !!req.body.available);
    res.json({ success: true, data: slot });
  } catch (error) {
    respondError(res, error, "Failed to update slot availability");
  }
});

// POST /api/guidance-admin/slots/:id/cancel  { reason? }
router.post("/slots/:id/cancel", async (req, res) => {
  try {
    const result = await cancelSlot(decodeURIComponent(req.params.id), req.body.reason);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to cancel slot");
  }
});

// POST /api/guidance-admin/bookings/list  { notificationId?, status?, limit?, startKey? }
router.post("/bookings/list", async (req, res) => {
  try {
    const { notificationId, status, limit = 30, startKey } = req.body;
    const data = await listBookingsForAdmin({ notificationId, status, limit, startKey });
    res.json({ success: true, ...data });
  } catch (error) {
    respondError(res, error, "Failed to list bookings");
  }
});

// POST /api/guidance-admin/bookings/:id/outcome  { outcome: "completed"|"no_show", adminNotes? }
router.post("/bookings/:id/outcome", async (req, res) => {
  try {
    const { outcome, adminNotes } = req.body;
    if (outcome !== GUIDANCE_BOOKING_STATUS.COMPLETED && outcome !== GUIDANCE_BOOKING_STATUS.NO_SHOW) {
      return res.status(400).json({ success: false, error: "outcome must be 'completed' or 'no_show'" });
    }
    const booking = await markBookingOutcome(decodeURIComponent(req.params.id), outcome, adminNotes);
    res.json({ success: true, data: booking });
  } catch (error) {
    respondError(res, error, "Failed to mark booking outcome");
  }
});

// POST /api/guidance-admin/feedback/list  { status?, limit?, startKey? }
router.post("/feedback/list", async (req, res) => {
  try {
    const { status, limit = 30, startKey } = req.body;
    const data = await listFeedbackForModeration({ status, limit, startKey });
    res.json({ success: true, ...data });
  } catch (error) {
    respondError(res, error, "Failed to list feedback");
  }
});

// POST /api/guidance-admin/feedback/:id/moderate  { action, displayNameOverride? }
router.post("/feedback/:id/moderate", async (req, res) => {
  try {
    const adminSub = (req as any).user?.sub;
    const { action, displayNameOverride } = req.body;
    const feedback = await moderateFeedback(adminSub, decodeURIComponent(req.params.id), action, displayNameOverride);
    res.json({ success: true, data: feedback });
  } catch (error) {
    respondError(res, error, "Failed to moderate feedback");
  }
});

// GET /api/guidance-admin/stats
router.get("/stats", async (_req, res) => {
  try {
    const stats = await getGuidanceStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    respondError(res, error, "Failed to fetch guidance stats");
  }
});

export default router;
