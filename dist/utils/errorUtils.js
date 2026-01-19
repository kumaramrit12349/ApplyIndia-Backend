"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleErrorsAxios = exports.createThrowError = void 0;
exports.logErrorLocation = logErrorLocation;
const ErrorMessage_1 = require("../db_schema/shared/ErrorMessage");
const SharedInterface_1 = require("../db_schema/shared/SharedInterface");
// src/utils/errorUtils.ts
const createThrowError = (code, name, msg, details) => {
    const err = new SharedInterface_1.ResponseError();
    err.code = code ?? ErrorMessage_1.BAD_REQUEST;
    err.name = name ?? ErrorMessage_1.BAD_REQUEST_NAME;
    err.message = msg ?? ErrorMessage_1.TRY_AGAIN;
    err.details = details ?? {};
    throw err;
};
exports.createThrowError = createThrowError;
function logErrorLocation(fileName, method, error, message, learnerSK, params) {
    const logErrorObject = {
        date: new Date().toISOString().slice(0, 20),
        Time: new Date().getTime(),
        fileName,
        method,
        error,
        message,
        learnerSK,
        errrCode: error.code,
        trace: error.stack,
        url: params?.req?.originalUrl,
        ip: params?.req?.ip,
        params: JSON.stringify({
            body: params?.req?.body,
            headers: params?.req?.headers,
            params: params?.req?.params,
            other: params?.req ? {} : params, // for other parameters
        }),
    };
    console.log(logErrorObject);
}
const handleErrorsAxios = (error, details) => {
    error = error;
    if (error?.response || error?.request) {
        (0, exports.createThrowError)(ErrorMessage_1.INTERNAL_SERVER_ERROR, ErrorMessage_1.SERVER_ERROR, ErrorMessage_1.TRY_AGAIN, details);
    }
    else {
        // Something happened in setting up the request that triggered an Error
        const errCode = isNaN(Number(error.code))
            ? ErrorMessage_1.BAD_REQUEST
            : Number(error.code);
        (0, exports.createThrowError)(errCode, error.name, error.message, details);
    }
};
exports.handleErrorsAxios = handleErrorsAxios;
