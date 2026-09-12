import { Router } from "express";
import { authenticateToken } from "../../middlewares/authMiddleware";
import { getAvailableSlotsForNotification } from "../../services/private/guidanceSlotService";
import {
  createBooking,
  cancelMyBooking,
  listMyBookings,
  getBookingAllowance,
} from "../../services/private/guidanceBookingService";
import { submitFeedback } from "../../services/private/guidanceFeedbackService";

const router = Router();
router.use(authenticateToken);

const ERROR_STATUS_MAP: Record<string, number> = {
  SLOT_NOT_FOUND: 404,
  SLOT_ALREADY_BOOKED: 409,
  GUIDANCE_NOT_AVAILABLE: 400,
  DEADLINE_PASSED: 400,
  BOOKING_LIMIT_REACHED: 400,
  ACTIVE_BOOKING_EXISTS: 400,
  USER_EMAIL_NOT_FOUND: 400,
  BOOKING_NOT_FOUND: 404,
  BOOKING_NOT_CANCELLABLE: 400,
  CANCEL_WINDOW_PASSED: 400,
  BOOKING_NOT_COMPLETED: 400,
  FEEDBACK_ALREADY_SUBMITTED: 400,
};

function respondError(res: any, error: any) {
  const msg = error?.message || "Something went wrong";
  const status = ERROR_STATUS_MAP[msg] || 500;
  res.status(status).json({ success: false, error: msg });
}

// GET /api/guidance/slots?notificationId=
router.get("/slots", async (req, res) => {
  try {
    const notificationId = req.query.notificationId as string;
    if (!notificationId) {
      return res.status(400).json({ success: false, error: "notificationId is required" });
    }
    const slots = await getAvailableSlotsForNotification(notificationId);
    res.json({ success: true, data: slots });
  } catch (error) {
    respondError(res, error);
  }
});

// GET /api/guidance/allowance/:notificationId
router.get("/allowance/:notificationId", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    if (!userSub) return res.status(401).json({ success: false, error: "User not authenticated" });
    const allowance = await getBookingAllowance(userSub, decodeURIComponent(req.params.notificationId));
    res.json({ success: true, data: allowance });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /api/guidance/bookings  { notification_id, slot_sk, issue_note? }
router.post("/bookings", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    if (!userSub) return res.status(401).json({ success: false, error: "User not authenticated" });
    const { notification_id, slot_sk, issue_note } = req.body;
    if (!notification_id || !slot_sk) {
      return res.status(400).json({ success: false, error: "notification_id and slot_sk are required" });
    }
    const booking = await createBooking(userSub, { notification_id, slot_sk, issue_note });
    res.json({ success: true, data: booking });
  } catch (error) {
    respondError(res, error);
  }
});

// GET /api/guidance/bookings/mine
router.get("/bookings/mine", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    if (!userSub) return res.status(401).json({ success: false, error: "User not authenticated" });
    const limit = Number(req.query.limit) || 30;
    const startKey = req.query.startKey ? JSON.parse(req.query.startKey as string) : undefined;
    const data = await listMyBookings(userSub, { limit, startKey });
    res.json({ success: true, ...data });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /api/guidance/bookings/:id/cancel
router.post("/bookings/:id/cancel", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    if (!userSub) return res.status(401).json({ success: false, error: "User not authenticated" });
    const booking = await cancelMyBooking(userSub, decodeURIComponent(req.params.id));
    res.json({ success: true, data: booking });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /api/guidance/bookings/:id/feedback
router.post("/bookings/:id/feedback", async (req, res) => {
  try {
    const userSub = (req as any).user?.sub;
    if (!userSub) return res.status(401).json({ success: false, error: "User not authenticated" });
    const { rating, problem_solved, topic_tags, message, consent_public } = req.body;
    const feedback = await submitFeedback(userSub, {
      booking_sk: decodeURIComponent(req.params.id),
      rating: Number(rating),
      problem_solved,
      topic_tags: topic_tags || [],
      message,
      consent_public: !!consent_public,
    });
    res.json({ success: true, data: feedback });
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
