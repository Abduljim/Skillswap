"use strict";
// Standard error types and helpers
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.HttpError = void 0;
class HttpError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, HttpError.prototype);
    }
}
exports.HttpError = HttpError;
class BadRequestError extends HttpError {
    constructor(message = 'Invalid request', details) {
        super(400, 'BAD_REQUEST', message, details);
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends HttpError {
    constructor(message = 'Unauthorized') {
        super(401, 'UNAUTHORIZED', message);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends HttpError {
    constructor(message = 'Forbidden') {
        super(403, 'FORBIDDEN', message);
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends HttpError {
    constructor(message = 'Not found') {
        super(404, 'NOT_FOUND', message);
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends HttpError {
    constructor(message = 'Conflict', details) {
        super(409, 'CONFLICT', message, details);
    }
}
exports.ConflictError = ConflictError;
class ValidationError extends HttpError {
    constructor(message = 'Invalid request', details) {
        super(400, 'VALIDATION_ERROR', message, details);
    }
}
exports.ValidationError = ValidationError;
//# sourceMappingURL=errors.js.map