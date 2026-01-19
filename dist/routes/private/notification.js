"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notificationService_1 = require("../../services/private/notificationService");
const router = (0, express_1.Router)();
/******************************************************************************
 *                            ADMIN ROUTES
 *        (Protected by Cognito Authorizer at API Gateway)
 ******************************************************************************/
// Add notification
router.post("/add", async (req, res) => {
    try {
        const result = await (0, notificationService_1.addCompleteNotification)(req.body);
        res.json({ success: true, data: result });
    }
    catch (error) {
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
        const notifications = await (0, notificationService_1.viewNotifications)();
        res.json({ success: true, notifications });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Database error",
        });
    }
});
// Get notification by ID
router.get("/getById/:id", async (req, res) => {
    try {
        const notification = await (0, notificationService_1.getNotificationById)(req.params.id);
        if (!notification) {
            return res.status(404).json({
                success: false,
                error: "Notification not found",
            });
        }
        res.json({ success: true, notification });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Database error",
        });
    }
});
// Edit notification
router.put("/edit/:id", async (req, res) => {
    try {
        const notification = await (0, notificationService_1.editCompleteNotification)(req.params.id, req.body);
        res.json({ success: true, notification });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Database error",
        });
    }
});
// Approve notification
router.patch("/approve/:id", async (req, res) => {
    try {
        const notification = await (0, notificationService_1.approveNotification)(req.params.id, "admin");
        res.json({ success: true, notification });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Database error",
        });
    }
});
// Archive notification
router.delete("/delete/:id", async (req, res) => {
    try {
        const notification = await (0, notificationService_1.archiveNotification)(req.params.id);
        res.json({ success: true, notification });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Database error",
        });
    }
});
// Unarchive notification
router.patch("/unarchive/:id", async (req, res) => {
    try {
        const notification = await (0, notificationService_1.unarchiveNotification)(req.params.id);
        res.json({ success: true, notification });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Failed to unarchive",
        });
    }
});
exports.default = router;
