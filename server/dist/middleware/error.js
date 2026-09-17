"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const zod_1 = require("zod");
const errors_1 = require("../utils/errors");
function errorHandler(err, _req, res, _next) {
    if (err instanceof errors_1.HttpError) {
        return res.status(err.status).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details,
            },
        });
    }
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid request',
                details: err.issues,
            },
        });
    }
    console.error('[ERROR]', err);
    return res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: process.env.NODE_ENV === 'production' ? 'Internal error' : err.message,
        },
    });
}
function notFoundHandler(_req, res) {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
}
//# sourceMappingURL=error.js.map