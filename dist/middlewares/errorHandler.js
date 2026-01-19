"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
exports.errorHandler = errorHandler;
function notFoundHandler(req, res) {
    res.status(404).json({ error: "Route not found" });
}
function errorHandler(err, _req, res, _next) {
    console.error("Error:", err.message || err);
    res.status(err.status || 500).json({
        error: err.message || "Internal Server Error",
    });
}
