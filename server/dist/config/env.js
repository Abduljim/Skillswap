"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
exports.env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '4000', 10),
    DATABASE_URL: process.env.DATABASE_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '365d',
    ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').toLowerCase(),
    CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:4000',
    COOKIE_SECRET: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-me',
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '',
    ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME || 'app.skillswap.client',
    PLAY_BILLING_VERIFY: process.env.PLAY_BILLING_VERIFY || 'false',
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    EMAIL_FROM: process.env.EMAIL_FROM || '',
    RESET_URL: process.env.RESET_URL || '',
    FCM_SERVER_KEY: process.env.FCM_SERVER_KEY || '',
    FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON || '',
};
if (exports.env.NODE_ENV === 'production' && exports.env.JWT_SECRET === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET must be set in production');
}
//# sourceMappingURL=env.js.map