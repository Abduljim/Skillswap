"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noContent = exports.created = exports.ok = void 0;
const ok = (res, data) => {
    res.json({ success: true, data });
};
exports.ok = ok;
const created = (res, data) => {
    res.status(201).json({ success: true, data });
};
exports.created = created;
const noContent = (res) => {
    res.status(204).send();
};
exports.noContent = noContent;
//# sourceMappingURL=responses.js.map