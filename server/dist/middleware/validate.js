"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const errors_1 = require("../utils/errors");
const validate = (schema, source = 'body') => (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
        return next(new errors_1.ValidationError('Invalid request', {
            issues: result.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
            })),
        }));
    }
    req[source] = result.data;
    next();
};
exports.validate = validate;
//# sourceMappingURL=validate.js.map