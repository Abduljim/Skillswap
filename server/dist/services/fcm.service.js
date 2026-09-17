"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fcmV1Configured = void 0;
exports.sendFcmV1 = sendFcmV1;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
let cachedAccessToken = null;
function parseServiceAccount() {
    if (!env_1.env.FCM_SERVICE_ACCOUNT_JSON)
        return null;
    try {
        const parsed = JSON.parse(env_1.env.FCM_SERVICE_ACCOUNT_JSON);
        if (!parsed.project_id || !parsed.client_email || !parsed.private_key)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
// Fetch a short-lived OAuth2 access token for the firebase.messaging scope.
async function getAccessToken(sa) {
    const now = Date.now();
    if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
        return cachedAccessToken.token;
    }
    const assertion = jsonwebtoken_1.default.sign({ scope: SCOPE }, sa.private_key, {
        algorithm: 'RS256',
        issuer: sa.client_email,
        subject: sa.client_email,
        audience: TOKEN_URL,
        expiresIn: 3600,
    });
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });
    if (!res.ok) {
        throw new Error(`OAuth token exchange failed: ${res.status}`);
    }
    const json = (await res.json());
    cachedAccessToken = {
        token: json.access_token,
        expiresAt: now + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
}
/**
 * Send an FCM data message to one device using the Firebase HTTP v1 API
 * (service-account auth). Returns true on success, and 'invalid' when the token
 * is dead (the device should be dropped).
 */
async function sendFcmV1(token, data) {
    const sa = parseServiceAccount();
    if (!sa)
        return 'error';
    try {
        const accessToken = await getAccessToken(sa);
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: {
                    token,
                    data,
                    android: { priority: 'HIGH' },
                },
            }),
        });
        if (res.ok)
            return 'ok';
        if (res.status === 400 || res.status === 404 || res.status === 410)
            return 'invalid';
        if (res.status === 401 || res.status === 403) {
            // Token/scope problem — clear the cache so the next call re-auths.
            cachedAccessToken = null;
        }
        return 'error';
    }
    catch {
        return 'error';
    }
}
const fcmV1Configured = () => parseServiceAccount() !== null;
exports.fcmV1Configured = fcmV1Configured;
//# sourceMappingURL=fcm.service.js.map