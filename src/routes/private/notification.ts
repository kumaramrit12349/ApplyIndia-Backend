import { Router } from "express";
import { addCompleteNotification, approveNotification, archiveNotification, editCompleteNotification, getNotificationById, unarchiveNotification, viewNotifications } from "../../services/private/notificationService";
import { authenticateTokenAndEmail } from "../../middlewares/authMiddleware";

const router = Router();
router.use(authenticateTokenAndEmail);



/******************************************************************************
 *                            ADMIN ROUTES
 *        (Protected by Cognito Authorizer at API Gateway)
 ******************************************************************************/

// Add notification
router.post("/add", async (req, res) => {
  try {
    const result = await addCompleteNotification(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error adding notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add notification",
    });
  }
});

// View all notifications
router.get("/view", async (_req, res) => {
  try {
    const notifications = await viewNotifications();
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Get notification by ID
router.get("/getById/:id", async (req, res) => {
  try {
    const notification = await getNotificationById(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Edit notification
router.put("/edit/:id", async (req, res) => {
  try {
    const notification = await editCompleteNotification(
      req.params.id,
      req.body
    );
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Approve notification
router.patch("/approve/:id", async (req, res) => {
  try {
    const notification = await approveNotification(
      req.params.id,
      "admin"
    );
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Archive notification
router.delete("/delete/:id", async (req, res) => {
  try {
    const notification = await archiveNotification(req.params.id);
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Database error",
    });
  }
});

// Unarchive notification
router.patch("/unarchive/:id", async (req, res) => {
  try {
    const notification = await unarchiveNotification(req.params.id);
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to unarchive",
    });
  }
});

export default router;