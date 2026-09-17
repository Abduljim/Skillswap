"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./config/env");
const prisma_1 = require("./lib/prisma");
const error_1 = require("./middleware/error");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const profile_routes_1 = __importDefault(require("./routes/profile.routes"));
const users_routes_1 = __importDefault(require("./routes/users.routes"));
const skills_routes_1 = __importDefault(require("./routes/skills.routes"));
const matches_routes_1 = __importDefault(require("./routes/matches.routes"));
const exchangeRequests_routes_1 = __importDefault(require("./routes/exchangeRequests.routes"));
const exchanges_routes_1 = __importDefault(require("./routes/exchanges.routes"));
const messages_routes_1 = __importDefault(require("./routes/messages.routes"));
const sessions_routes_1 = __importDefault(require("./routes/sessions.routes"));
const notifications_routes_1 = __importDefault(require("./routes/notifications.routes"));
const safety_routes_1 = __importDefault(require("./routes/safety.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
const io_1 = require("./sockets/io");
const catalogue_1 = require("./catalogue");
const app = (0, express_1.default)();
app.set('trust proxy', 1);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: env_1.env.CLIENT_URL === '*' ? true : env_1.env.CLIENT_URL,
    credentials: true,
}));
app.use(express_1.default.json({ limit: '3mb' }));
app.use((0, cookie_parser_1.default)(env_1.env.COOKIE_SECRET));
// Global rate limiter
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.env.RATE_LIMIT_WINDOW_MS,
    max: env_1.env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(globalLimiter);
// Stricter limiter for auth endpoints
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
});
app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/profile', profile_routes_1.default);
app.use('/api/users', users_routes_1.default);
app.use('/api/skills', skills_routes_1.default);
app.use('/api/matches', matches_routes_1.default);
app.use('/api/exchange-requests', exchangeRequests_routes_1.default);
app.use('/api/exchanges', exchanges_routes_1.default);
app.use('/api/messages', messages_routes_1.default);
app.use('/api/sessions', sessions_routes_1.default);
app.use('/api/notifications', notifications_routes_1.default);
app.use('/api', safety_routes_1.default); // /reports, /users/:id/block
app.use('/api', billing_routes_1.default); // /subscription, /boost, /profile-views
app.use('/api/admin', admin_routes_1.default);
// Serve the built web client (SPA) from the same process when present.
// All API routes are mounted above, so this only handles non-API GETs and
// falls back to index.html so React Router paths (/reset-password, …) work.
const publicDir = path_1.default.resolve(__dirname, '../../client/dist');
if (fs_1.default.existsSync(path_1.default.join(publicDir, 'index.html'))) {
    app.use(express_1.default.static(publicDir, { maxAge: '7d', index: 'index.html' }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
        res.sendFile(path_1.default.join(publicDir, 'index.html'));
    });
    console.log(`🌐 Serving web client from ${publicDir}`);
}
else {
    console.log(`🌐 No web client build found at ${publicDir} — API only.`);
}
app.use(error_1.notFoundHandler);
app.use(error_1.errorHandler);
const httpServer = http_1.default.createServer(app);
(0, io_1.initSocket)(httpServer);
// Marker for auto-seed status. Set to 'true' via env var when DB is freshly empty.
async function autoSeedIfEmpty() {
    try {
        const userCount = await prisma_1.prisma.user.count();
        if (userCount > 0) {
            console.log(`🌱 Database already seeded (${userCount} users). Skipping.`);
            return;
        }
        console.log('🌱 Empty database detected. Run `npm run seed` once to populate demo data.');
        console.log('   (Render Shell tab: cd server && npm run seed)');
    }
    catch (e) {
        console.error('⚠️  DB check failed (non-fatal):', e?.message || e);
    }
}
// Keep the live skill catalogue in sync on every boot (additive/upsert). This is
// what ships new skills (languages, university subjects, careers, …) to existing
// deployments without a manual seed — the seed script uses the same list.
async function ensureDefaultSkills() {
    try {
        const names = catalogue_1.SKILLS.map((s) => s.name);
        const existing = await prisma_1.prisma.skill.findMany({
            where: { name: { in: names } },
            select: { name: true },
        });
        const have = new Set(existing.map((s) => s.name));
        const missing = catalogue_1.SKILLS.filter((s) => !have.has(s.name));
        if (!missing.length)
            return;
        for (const s of missing) {
            await prisma_1.prisma.skill.upsert({
                where: { name: s.name },
                update: { category: s.category, description: s.description ?? null, isActive: true },
                create: { name: s.name, category: s.category, description: s.description ?? null, isActive: true },
            });
        }
        console.log(`🌱 Catalogue synced: added ${missing.length} skills (${missing.map((s) => s.name).join(', ')}).`);
    }
    catch (e) {
        console.error('⚠️  Catalogue sync failed (non-fatal):', e?.message || e);
    }
}
httpServer.listen(env_1.env.PORT, () => {
    console.log(`🚀 SkillSwap API running on http://localhost:${env_1.env.PORT}`);
    console.log(`📦 Environment: ${env_1.env.NODE_ENV}`);
    autoSeedIfEmpty();
    ensureDefaultSkills();
});
exports.default = app;
//# sourceMappingURL=index.js.map