import { Router } from "express";
import { addFeedbackToDB } from "../../services/public/feedbackService";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }

    const result = await addFeedbackToDB({ name, email, message });

    res.json({
      success: true,
      data: result,
      message: "Feedback submitted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to submit feedback",
    });
  }
});

export default router;
