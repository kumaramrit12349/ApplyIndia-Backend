"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const feedbackService_1 = require("../../services/public/feedbackService");
const router = (0, express_1.Router)();
router.post("/", async (req, res) => {
    try {
        const { name, email, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and message are required",
            });
        }
        const result = await (0, feedbackService_1.addFeedbackToDB)({ name, email, message });
        res.json({
            success: true,
            data: result,
            message: "Feedback submitted successfully",
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to submit feedback",
        });
    }
});
exports.default = router;
