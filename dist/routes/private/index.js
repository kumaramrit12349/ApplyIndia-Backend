"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_1 = __importDefault(require("./notification"));
const router = (0, express_1.Router)();
router.use("/notification", notification_1.default);
exports.default = router;
