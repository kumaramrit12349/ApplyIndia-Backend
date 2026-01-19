"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const home_1 = __importDefault(require("./home"));
const feedback_1 = __importDefault(require("./feedback"));
const router = (0, express_1.Router)();
router.use("/notification", home_1.default);
router.use(feedback_1.default);
exports.default = router;
