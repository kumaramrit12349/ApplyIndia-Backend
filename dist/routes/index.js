"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = __importDefault(require("./auth"));
const public_1 = __importDefault(require("./public"));
const private_1 = __importDefault(require("./private"));
const router = (0, express_1.Router)();
router.get("/", (_req, res) => {
    res.json({ message: "Welcome to ApplyIndia!" });
});
router.use("/auth", auth_1.default);
router.use("/public", public_1.default);
router.use("/api", private_1.default);
exports.default = router;
