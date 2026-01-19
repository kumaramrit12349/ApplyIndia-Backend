"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const homeService_1 = require("../../services/public/homeService");
const notificationService_1 = require("../../services/private/notificationService");
const router = (0, express_1.Router)();
/******************************************************************************
 *                            PUBLIC ROUTES
 ******************************************************************************/
// Home page notifications
router.get("/home", async (_req, res) => {
    try {
        const grouped = await (0, homeService_1.getHomePageNotifications)();
        res.json({ success: true, data: grouped });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            error: "Database error",
        });
    }
});
// Category + search + pagination
router.get("/category/:category", async (req, res) => {
    try {
        const { category } = req.params;
        const { searchValue, lastEvaluatedKey } = req.query;
        const limit = Number(req.query.limit) || 20;
        const result = await (0, homeService_1.getNotificationsByCategory)(category, limit, typeof lastEvaluatedKey === "string" ? lastEvaluatedKey : undefined, typeof searchValue === "string" ? searchValue : undefined);
        res.json({
            success: true,
            ...result,
        });
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
exports.default = router;
