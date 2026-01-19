"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseError = void 0;
const ErrorMessage_1 = require("./ErrorMessage");
const http_status_codes_1 = require("http-status-codes");
class ResponseError extends Error {
    constructor(code, name, message = ErrorMessage_1.TRY_AGAIN, details) {
        super();
        this.code = code ?? http_status_codes_1.StatusCodes.BAD_REQUEST;
        this.name = name ?? ErrorMessage_1.BAD_REQUEST_NAME;
        this.message = message ?? ErrorMessage_1.TRY_AGAIN;
        this.details = details ?? {};
    }
}
exports.ResponseError = ResponseError;
