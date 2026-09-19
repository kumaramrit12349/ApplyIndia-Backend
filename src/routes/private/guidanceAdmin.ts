import { Router } from "express";
import { authenticateTokenAndEmail, requireRole } from "../../middlewares/authMiddleware";
import {
  createSlot,
  listSlotsForAdmin,
  setSlotAvailability,
  cancelSlot,
  bulkCancelAvailableSlots,
  bulkDeleteSlots,
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
// Guidance Partners manage only their own slots/bookings (enforced in the
// service layer below); Feedback moderation and Stats stay Admin-only via an
// extra requireRole("admin") directly on those specific routes.
router.use(requireRole("admin", "guidance_partner"));

const ERROR_STATUS_MAP: Record<string, number> = {
  NOT_YOUR_SLOT: 403,
  NOT_YOUR_BOOKING: 403,
};

function respondError(res: any, error: any, fallback: string) {
  console.error(error);
  const msg = error?.message || fallback;
  res.status(ERROR_STATUS_MAP[msg] || 400).json({ success: false, error: msg });
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
    const callerRole = (req as any).adminRole;
    const ownerSub = callerRole === "admin" ? undefined : (req as any).user?.sub;
    const data = await listSlotsForAdmin(notificationId, status, limit, startKey, ownerSub);
    res.json({ success: true, ...data });
  } catch (error) {
    respondError(res, error, "Failed to list slots");
  }
});

// PATCH /api/guidance-admin/slots/:id/availability  { available: boolean }
router.patch("/slots/:id/availability", async (req, res) => {
  try {
    const callerSub = (req as any).user?.sub;
    const callerRole = (req as any).adminRole;
    const slot = await setSlotAvailability(decodeURIComponent(req.params.id), !!req.body.available, callerSub, callerRole);
    res.json({ success: true, data: slot });
  } catch (error) {
    respondError(res, error, "Failed to update slot availability");
  }
});

// POST /api/guidance-admin/slots/:id/cancel  { reason? }
router.post("/slots/:id/cancel", async (req, res) => {
  try {
    const callerSub = (req as any).user?.sub;
    const callerRole = (req as any).adminRole;
    const result = await cancelSlot(decodeURIComponent(req.params.id), req.body.reason, callerSub, callerRole);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to cancel slot");
  }
});

// POST /api/guidance-admin/slots/bulk-cancel-available  { notification_id }
router.post("/slots/bulk-cancel-available", async (req, res) => {
  try {
    const { notification_id } = req.body;
    if (!notification_id) {
      return res.status(400).json({ success: false, error: "notification_id is required" });
    }
    const callerSub = (req as any).user?.sub;
    const callerRole = (req as any).adminRole;
    const result = await bulkCancelAvailableSlots(notification_id, callerSub, callerRole);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to bulk-cancel available slots");
  }
});

// POST /api/guidance-admin/slots/bulk-delete  { slot_sks: string[] }
router.post("/slots/bulk-delete", async (req, res) => {
  try {
    const { slot_sks } = req.body;
    if (!Array.isArray(slot_sks) || slot_sks.length === 0) {
      return res.status(400).json({ success: false, error: "slot_sks must be a non-empty array" });
    }
    const callerSub = (req as any).user?.sub;
    const callerRole = (req as any).adminRole;
    const result = await bulkDeleteSlots(slot_sks, callerSub, callerRole);
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error, "Failed to delete selected slots");
  }
});

// POST /api/guidance-admin/bookings/list  { notificationId?, status?, slotDateFrom?, slotDateTo?, limit?, startKey? }
router.post("/bookings/list", async (req, res) => {
  try {
    const { notificationId, status, limit = 30, startKey } = req.body;
    const slotDateFrom = Number.isFinite(Number(req.body.slotDateFrom)) && req.body.slotDateFrom !== undefined ? Number(req.body.slotDateFrom) : undefined;
    const slotDateTo = Number.isFinite(Number(req.body.slotDateTo)) && req.body.slotDateTo !== undefined ? Number(req.body.slotDateTo) : undefined;
    const callerRole = (req as any).adminRole;
    const ownerSub = callerRole === "admin" ? undefined : (req as any).user?.sub;
    const data = await listBookingsForAdmin({ notificationId, status, slotDateFrom, slotDateTo, limit, startKey, ownerSub });
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
    const callerSub = (req as any).user?.sub;
    const callerRole = (req as any).adminRole;
    const booking = await markBookingOutcome(decodeURIComponent(req.params.id), outcome, adminNotes, callerSub, callerRole);
    res.json({ success: true, data: booking });
  } catch (error) {
    respondError(res, error, "Failed to mark booking outcome");
  }
});

// POST /api/guidance-admin/feedback/list  { status?, limit?, startKey? }
router.post("/feedback/list", requireRole("admin"), async (req, res) => {
  try {
    const { status, limit = 30, startKey } = req.body;
    const data = await listFeedbackForModeration({ status, limit, startKey });
    res.json({ success: true, ...data });
  } catch (error) {
    respondError(res, error, "Failed to list feedback");
  }
});

// POST /api/guidance-admin/feedback/:id/moderate  { action, displayNameOverride? }
router.post("/feedback/:id/moderate", requireRole("admin"), async (req, res) => {
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
router.get("/stats", requireRole("admin"), async (_req, res) => {
  try {
    const stats = await getGuidanceStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    respondError(res, error, "Failed to fetch guidance stats");
  }
});

export default router;
