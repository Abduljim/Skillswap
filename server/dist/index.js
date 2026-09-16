"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/config/env.ts
var import_dotenv, import_path, env;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    import_dotenv = __toESM(require("dotenv"));
    import_path = __toESM(require("path"));
    import_dotenv.default.config({ path: import_path.default.resolve(__dirname, "../../../.env") });
    env = {
      NODE_ENV: process.env.NODE_ENV || "development",
      PORT: parseInt(process.env.PORT || "4000", 10),
      DATABASE_URL: process.env.DATABASE_URL || "",
      JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "365d",
      ADMIN_EMAIL: (process.env.ADMIN_EMAIL || "").toLowerCase(),
      CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
      SERVER_URL: process.env.SERVER_URL || "http://localhost:4000",
      COOKIE_SECRET: process.env.COOKIE_SECRET || "dev-cookie-secret-change-me",
      RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
      RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
      LOG_LEVEL: process.env.LOG_LEVEL || "info",
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "",
      ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME || "app.skillswap.client",
      PLAY_BILLING_VERIFY: process.env.PLAY_BILLING_VERIFY || "false",
      SMTP_HOST: process.env.SMTP_HOST || "",
      SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
      SMTP_USER: process.env.SMTP_USER || "",
      SMTP_PASS: process.env.SMTP_PASS || "",
      SMTP_FROM: process.env.SMTP_FROM || "",
      RESET_URL: process.env.RESET_URL || ""
    };
    if (env.NODE_ENV === "production" && env.JWT_SECRET === "dev-secret-change-me") {
      throw new Error("JWT_SECRET must be set in production");
    }
  }
});

// src/services/playBillingVerifier.ts
var playBillingVerifier_exports = {};
__export(playBillingVerifier_exports, {
  verifyPlayPurchase: () => verifyPlayPurchase
});
async function getClient() {
  if (authClient) return { authClient, androidPublisher };
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured");
  }
  const keyFile = JSON.parse(
    import_fs.default.readFileSync(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, "utf8")
  );
  authClient = new import_googleapis.google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"]
  });
  androidPublisher = import_googleapis.google.androidpublisher("v3");
  return { authClient, androidPublisher };
}
async function verifyPlayPurchase(p) {
  if (env.PLAY_BILLING_VERIFY !== "true") {
    return { valid: true };
  }
  try {
    const { androidPublisher: androidPublisher2 } = await getClient();
    const res = await androidPublisher2.purchases.products.get({
      packageName: env.ANDROID_PACKAGE_NAME,
      productId: p.productId,
      token: p.purchaseToken
    });
    const purchase = res.data;
    if (purchase.purchaseState !== 0) {
      return { valid: false, reason: `purchaseState=${purchase.purchaseState}` };
    }
    const expiresAt = purchase.expiryTimeMillis ? new Date(Number(purchase.expiryTimeMillis)) : void 0;
    return { valid: true, expiresAt };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}
var import_googleapis, import_fs, authClient, androidPublisher;
var init_playBillingVerifier = __esm({
  "src/services/playBillingVerifier.ts"() {
    "use strict";
    import_googleapis = require("googleapis");
    init_env();
    import_fs = __toESM(require("fs"));
    authClient = null;
    androidPublisher = null;
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_express14 = __toESM(require("express"));
var import_cors = __toESM(require("cors"));
var import_helmet = __toESM(require("helmet"));
var import_cookie_parser = __toESM(require("cookie-parser"));
var import_express_rate_limit = __toESM(require("express-rate-limit"));
var import_http = __toESM(require("http"));
var import_path2 = __toESM(require("path"));
var import_fs2 = __toESM(require("fs"));
init_env();

// src/lib/prisma.ts
var import_client = require("@prisma/client");
var prisma = global.__prisma || new import_client.PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});
if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

// src/middleware/error.ts
var import_zod = require("zod");

// src/utils/errors.ts
var HttpError = class _HttpError extends Error {
  status;
  code;
  details;
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, _HttpError.prototype);
  }
};
var BadRequestError = class extends HttpError {
  constructor(message = "Invalid request", details) {
    super(400, "BAD_REQUEST", message, details);
  }
};
var UnauthorizedError = class extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
};
var ForbiddenError = class extends HttpError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
  }
};
var NotFoundError = class extends HttpError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
};
var ConflictError = class extends HttpError {
  constructor(message = "Conflict", details) {
    super(409, "CONFLICT", message, details);
  }
};
var ValidationError = class extends HttpError {
  constructor(message = "Invalid request", details) {
    super(400, "VALIDATION_ERROR", message, details);
  }
};

// src/middleware/error.ts
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
  }
  if (err instanceof import_zod.ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: err.issues
      }
    });
  }
  console.error("[ERROR]", err);
  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production" ? "Internal error" : err.message
    }
  });
}
function notFoundHandler(_req, res) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Endpoint not found" }
  });
}

// src/routes/auth.routes.ts
var import_express = require("express");

// src/validators/schemas.ts
var import_zod2 = require("zod");
var signupSchema = import_zod2.z.object({
  email: import_zod2.z.string().email().max(255),
  password: import_zod2.z.string().min(8).max(100),
  displayName: import_zod2.z.string().min(2).max(80)
});
var loginSchema = import_zod2.z.object({
  email: import_zod2.z.string().email(),
  password: import_zod2.z.string().min(1)
});
var forgotPasswordSchema = import_zod2.z.object({
  email: import_zod2.z.string().email()
});
var resetPasswordSchema = import_zod2.z.object({
  token: import_zod2.z.string().min(10),
  password: import_zod2.z.string().min(8).max(100)
});
var avatarUrlSchema = import_zod2.z.string().max(2e6).refine(
  (v) => v.startsWith("data:image/") || /^https?:\/\/.+/i.test(v),
  { message: "Must be an image URL or data URL" }
).nullable().optional();
var updateProfileSchema = import_zod2.z.object({
  displayName: import_zod2.z.string().min(2).max(80).optional(),
  university: import_zod2.z.string().max(200).nullable().optional(),
  department: import_zod2.z.string().max(200).nullable().optional(),
  yearLevel: import_zod2.z.string().max(50).nullable().optional(),
  bio: import_zod2.z.string().max(1e3).nullable().optional(),
  avatarUrl: avatarUrlSchema,
  learningFormat: import_zod2.z.enum(["ONLINE", "IN_PERSON", "EITHER"]).optional(),
  avatarFrame: import_zod2.z.enum(["default", "frame_0", "frame_1", "frame_2", "frame_3", "frame_4", "frame_5", "frame_6", "frame_7", "frame_8", "frame_9", "frame_10", "frame_11"]).optional(),
  bannerStyle: import_zod2.z.enum(["cream", "purple", "blue", "teal", "orange", "pink", "gold", "indigo", "green"]).optional(),
  occupation: import_zod2.z.enum(["student", "employed", "self_employed", "unemployed", "other"]).nullable().optional(),
  jobTitle: import_zod2.z.string().max(100).nullable().optional(),
  company: import_zod2.z.string().max(150).nullable().optional(),
  gender: import_zod2.z.enum(["male", "female", "unspecified"]).nullable().optional(),
  availabilities: import_zod2.z.array(
    import_zod2.z.object({
      weekday: import_zod2.z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
      timeOfDay: import_zod2.z.enum(["MORNING", "AFTERNOON", "EVENING"])
    })
  ).optional()
});
var updatePasswordSchema = import_zod2.z.object({
  currentPassword: import_zod2.z.string().min(1),
  newPassword: import_zod2.z.string().min(8).max(100)
});
var changePasswordSchema = import_zod2.z.object({
  currentPassword: import_zod2.z.string().min(1),
  newPassword: import_zod2.z.string().min(8).max(100)
});
var addUserSkillSchema = import_zod2.z.object({
  skillId: import_zod2.z.string().uuid(),
  type: import_zod2.z.enum(["TEACH", "WANT"]),
  proficiency: import_zod2.z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]).default("INTERMEDIATE")
});
var matchQuerySchema = import_zod2.z.object({
  minScore: import_zod2.z.coerce.number().int().min(0).max(100).default(40),
  skillId: import_zod2.z.string().uuid().optional(),
  university: import_zod2.z.string().optional(),
  format: import_zod2.z.enum(["ONLINE", "IN_PERSON", "EITHER"]).optional(),
  page: import_zod2.z.coerce.number().int().min(1).default(1),
  pageSize: import_zod2.z.coerce.number().int().min(1).max(50).default(20)
});
var createExchangeRequestSchema = import_zod2.z.object({
  receiverId: import_zod2.z.string().uuid(),
  offeredSkillId: import_zod2.z.string().uuid(),
  requestedSkillId: import_zod2.z.string().uuid(),
  message: import_zod2.z.string().min(10).max(1e3)
});
var createSessionSchema = import_zod2.z.object({
  title: import_zod2.z.string().min(2).max(150),
  scheduledAt: import_zod2.z.string().datetime(),
  durationMinutes: import_zod2.z.number().int().min(15).max(480),
  format: import_zod2.z.enum(["ONLINE", "IN_PERSON"]),
  meetingLink: import_zod2.z.string().url().max(500).optional().nullable(),
  location: import_zod2.z.string().max(300).optional().nullable(),
  notes: import_zod2.z.string().max(2e3).optional().nullable()
});
var updateSessionSchema = createSessionSchema.partial();
var createMessageSchema = import_zod2.z.object({
  body: import_zod2.z.string().min(1).max(2e6),
  type: import_zod2.z.enum(["TEXT", "IMAGE", "STICKER"]).default("TEXT")
});
var createReviewSchema = import_zod2.z.object({
  rating: import_zod2.z.number().int().min(1).max(5),
  comment: import_zod2.z.string().max(2e3).optional().nullable()
});
var createReportSchema = import_zod2.z.object({
  reportedUserId: import_zod2.z.string().uuid(),
  reason: import_zod2.z.string().min(2).max(100),
  description: import_zod2.z.string().min(10).max(2e3)
});
var createSkillSchema = import_zod2.z.object({
  name: import_zod2.z.string().min(2).max(80),
  category: import_zod2.z.string().min(2).max(50),
  description: import_zod2.z.string().max(500).optional().nullable()
});
var updateSkillSchema = import_zod2.z.object({
  name: import_zod2.z.string().min(2).max(80).optional(),
  category: import_zod2.z.string().min(2).max(50).optional(),
  description: import_zod2.z.string().max(500).optional().nullable(),
  isActive: import_zod2.z.boolean().optional()
});
var adminUpdateUserSchema = import_zod2.z.object({
  isActive: import_zod2.z.boolean().optional(),
  isAdmin: import_zod2.z.boolean().optional()
});
var userSearchSchema = import_zod2.z.object({
  q: import_zod2.z.string().optional(),
  skillId: import_zod2.z.string().uuid().optional(),
  university: import_zod2.z.string().optional(),
  format: import_zod2.z.enum(["ONLINE", "IN_PERSON", "EITHER"]).optional(),
  page: import_zod2.z.coerce.number().int().min(1).default(1),
  pageSize: import_zod2.z.coerce.number().int().min(1).max(50).default(20),
  sort: import_zod2.z.enum(["newest", "rating", "completed"]).default("newest")
});

// src/middleware/validate.ts
var validate = (schema, source = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(
      new ValidationError("Invalid request", {
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message
        }))
      })
    );
  }
  req[source] = result.data;
  next();
};

// src/services/auth.service.ts
var import_bcryptjs = __toESM(require("bcryptjs"));

// src/middleware/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
init_env();
var COOKIE_NAME = "skillswap_token";
function signToken(payload) {
  return import_jsonwebtoken.default.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}
var COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1e3;
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/"
  });
}
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
var requireAuth = async (req, _res, next) => {
  try {
    let token;
    const cookieToken = req.cookies?.[COOKIE_NAME];
    if (cookieToken) token = cookieToken;
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.substring(7);
    }
    if (!token) throw new UnauthorizedError("Authentication required");
    const payload = import_jsonwebtoken.default.verify(token, env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isActive: true }
    });
    if (!user || !user.isActive) throw new UnauthorizedError("Account inactive");
    req.user = { userId: user.id, email: user.email };
    next();
  } catch (e) {
    if (e instanceof UnauthorizedError) return next(e);
    next(new UnauthorizedError("Invalid token"));
  }
};
var requireAdmin = async (req, _res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const u = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
    if (!u?.isAdmin) throw new ForbiddenError("Admin access required");
    next();
  } catch (e) {
    next(e);
  }
};

// src/services/auth.service.ts
var import_crypto = require("crypto");
init_env();

// src/services/email.service.ts
var import_nodemailer = __toESM(require("nodemailer"));
init_env();
function isConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}
async function sendEmail(opts) {
  if (!isConfigured()) {
    return { delivered: false };
  }
  let transporter;
  let timer;
  try {
    transporter = import_nodemailer.default.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : void 0,
      connectionTimeout: 1e4,
      greetingTimeout: 1e4,
      socketTimeout: 15e3
    });
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Email delivery timed out")), 15e3);
    });
    await Promise.race([
      transporter.sendMail({
        from: env.SMTP_FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html
      }),
      timeout
    ]);
    return { delivered: true };
  } catch {
    return { delivered: false };
  } finally {
    clearTimeout(timer);
    try {
      transporter?.close();
    } catch {
    }
  }
}
function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail({
    to,
    subject: "SkillSwap \u2014 reset your password",
    text: `Reset your password here:

${resetUrl}

The link expires in 1 hour and can be used once.
If you didn't ask for this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;padding:24px;background:#f5f2ec;border-radius:16px">
        <h2 style="margin:0 0 8px;color:#12131a">SkillSwap</h2>
        <p style="color:#3b3b41;margin:0 0 16px">Click below to choose a new password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#fb4f1d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">Reset password</a>
        <p style="color:#8a8a8f;font-size:12px;margin-top:20px">If you didn't request this, you can safely ignore this email.</p>
      </div>`
  });
}

// src/services/entitlements.service.ts
var LIMITS = {
  FREE: {
    activeExchangeRequests: 3,
    // pending outgoing requests
    exchanges: 5,
    // active exchanges
    profileViewsCanSee: false,
    // pro only
    boost: false,
    priorityInMatches: false,
    proBadge: false
  },
  PRO: {
    activeExchangeRequests: Infinity,
    exchanges: Infinity,
    profileViewsCanSee: true,
    boost: true,
    priorityInMatches: true,
    proBadge: true
  }
};
async function getUserTier(userId) {
  const [sub, user] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  ]);
  const isAdmin = user?.isAdmin ?? false;
  if (isAdmin) return { tier: "PRO", subscription: sub, isAdmin };
  if (!sub) return { tier: "FREE", subscription: null, isAdmin };
  const active = sub.status === "ACTIVE" && (!sub.expiresAt || sub.expiresAt > /* @__PURE__ */ new Date());
  return {
    tier: active && sub.tier === "PRO" ? "PRO" : "FREE",
    subscription: sub,
    isAdmin
  };
}
function limitsFor(tier) {
  return LIMITS[tier];
}
async function checkCanSendRequest(userId) {
  const { tier } = await getUserTier(userId);
  const limits = limitsFor(tier);
  if (limits.activeExchangeRequests === Infinity) return { allowed: true };
  const pending = await prisma.exchangeRequest.count({
    where: { senderId: userId, status: "PENDING" }
  });
  if (pending >= limits.activeExchangeRequests) {
    return {
      allowed: false,
      reason: `Free users can have up to ${limits.activeExchangeRequests} pending requests. Upgrade to Pro for unlimited.`
    };
  }
  return { allowed: true };
}
async function recordProfileView(viewerId, profileId) {
  if (viewerId === profileId) return;
  const recent = await prisma.profileView.findFirst({
    where: {
      viewerId,
      profileId,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1e3) }
    }
  });
  if (recent) return;
  await prisma.profileView.create({
    data: { viewerId, profileId }
  });
}
async function listProfileViewers(profileId) {
  const { tier } = await getUserTier(profileId);
  if (tier !== "PRO") return { allowed: false, viewers: [] };
  const viewers = await prisma.profileView.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      viewer: {
        select: {
          id: true,
          displayName: true,
          profile: { select: { avatarUrl: true, avatarFrame: true, university: true } }
        }
      }
    }
  });
  return {
    allowed: true,
    viewers: viewers.map((v) => ({
      id: v.id,
      viewedAt: v.createdAt,
      viewer: v.viewer
    }))
  };
}

// src/services/streak.service.ts
function dayKey(d) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function isYesterday(d) {
  const t = /* @__PURE__ */ new Date();
  t.setUTCDate(t.getUTCDate() - 1);
  return dayKey(d) === dayKey(t);
}
async function touchStreak(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastLoginAt: true, loginStreak: true, maxStreak: true }
  });
  if (!user) return { streak: 0, maxStreak: 0 };
  if (user.lastLoginAt && dayKey(user.lastLoginAt) === dayKey(/* @__PURE__ */ new Date())) {
    return { streak: user.loginStreak, maxStreak: user.maxStreak };
  }
  let next = 1;
  if (user.lastLoginAt && isYesterday(user.lastLoginAt)) next = user.loginStreak + 1;
  const maxStreak = Math.max(user.maxStreak, next);
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: /* @__PURE__ */ new Date(), loginStreak: next, maxStreak }
  });
  return { streak: next, maxStreak };
}
async function readStreak(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginStreak: true, maxStreak: true }
  });
  if (!user) return { streak: 0, maxStreak: 0 };
  return { streak: user.loginStreak, maxStreak: user.maxStreak };
}

// src/services/auth.service.ts
async function ensureAdminRole(email) {
  if (!env.ADMIN_EMAIL || email !== env.ADMIN_EMAIL) return false;
  await prisma.user.updateMany({
    where: { email, isAdmin: false },
    data: { isAdmin: true }
  });
  return true;
}
async function signup(input) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw new ConflictError("Email already registered");
  const passwordHash = await import_bcryptjs.default.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      displayName: input.displayName,
      profile: { create: {} }
    },
    select: { id: true, email: true, displayName: true, isAdmin: true }
  });
  await ensureAdminRole(user.email);
  return { user, token: signToken({ userId: user.id, email: user.email }) };
}
async function login(input) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !user.isActive) throw new UnauthorizedError("Invalid credentials");
  const ok2 = await import_bcryptjs.default.compare(input.password, user.passwordHash);
  if (!ok2) throw new UnauthorizedError("Invalid credentials");
  await ensureAdminRole(user.email);
  const [tierResult, streak] = await Promise.all([
    getUserTier(user.id),
    touchStreak(user.id).catch(() => ({ streak: 0, maxStreak: 0 }))
  ]);
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      tier: tierResult.tier,
      streak: streak.streak,
      maxStreak: streak.maxStreak
    },
    token: signToken({ userId: user.id, email: user.email })
  };
}
async function getMe(userId) {
  const [user, tierResult, streak] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        profile: {
          select: {
            id: true,
            university: true,
            department: true,
            yearLevel: true,
            occupation: true,
            jobTitle: true,
            company: true,
            gender: true,
            bio: true,
            avatarUrl: true,
            avatarFrame: true,
            bannerStyle: true,
            learningFormat: true,
            availabilities: {
              select: { id: true, weekday: true, timeOfDay: true }
            }
          }
        }
      }
    }),
    getUserTier(userId),
    touchStreak(userId).catch(() => ({ streak: 0, maxStreak: 0 }))
  ]);
  if (!user) throw new NotFoundError("User not found");
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    createdAt: user.createdAt,
    tier: tierResult.tier,
    streak: streak.streak,
    maxStreak: streak.maxStreak,
    profile: user.profile
  };
}
async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true }
  });
  if (!user) return;
  const raw = (0, import_crypto.randomBytes)(32).toString("hex");
  const tokenHash = (0, import_crypto.createHash)("sha256").update(raw).digest("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1e3)
    }
  });
  const resetUrl = env.RESET_URL ? `${env.RESET_URL.replace(/\/$/, "")}?token=${raw}` : `${env.CLIENT_URL.replace(/\/$/, "")}/reset-password?token=${raw}`;
  await sendPasswordResetEmail(user.email, resetUrl).catch(() => void 0);
}
async function changePassword(input) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new NotFoundError("User not found");
  const ok2 = await import_bcryptjs.default.compare(input.currentPassword, user.passwordHash);
  if (!ok2) throw new UnauthorizedError("Current password is incorrect");
  const passwordHash = await import_bcryptjs.default.hash(input.newPassword, 10);
  await prisma.user.update({ where: { id: input.userId }, data: { passwordHash } });
}
async function resetPassword(token, newPassword) {
  const tokenHash = (0, import_crypto.createHash)("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < /* @__PURE__ */ new Date()) {
    throw new BadRequestError("Invalid or expired reset token");
  }
  const passwordHash = await import_bcryptjs.default.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: /* @__PURE__ */ new Date() }
    })
  ]);
}

// src/utils/asyncHandler.ts
var asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// src/utils/responses.ts
var ok = (res, data) => {
  res.json({ success: true, data });
};

// src/routes/auth.routes.ts
var router = (0, import_express.Router)();
router.post(
  "/signup",
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await signup(req.body);
    setAuthCookie(res, result.token);
    ok(res, { user: result.user, token: result.token });
  })
);
router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await login(req.body);
    setAuthCookie(res, result.token);
    ok(res, { user: result.user, token: result.token });
  })
);
router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  ok(res, { loggedOut: true });
});
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = await getMe(req.user.userId);
    ok(res, me);
  })
);
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await requestPasswordReset(req.body.email).catch(() => void 0);
    ok(res, { message: "If an account exists for that email, you will receive a password reset link." });
  })
);
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await resetPassword(req.body.token, req.body.password);
    ok(res, { message: "Password reset successfully" });
  })
);
router.post(
  "/change-password",
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await changePassword({
      userId: req.user.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword
    });
    ok(res, { message: "Password changed successfully" });
  })
);
var auth_routes_default = router;

// src/routes/profile.routes.ts
var import_express2 = require("express");

// src/services/badges.service.ts
var BADGES = {
  EARLY_BIRD: {
    code: "EARLY_BIRD",
    label: "Early Adopter",
    icon: "Bird",
    description: "One of the first members",
    tier: "BASIC"
  },
  SWAPPER: {
    code: "SWAPPER",
    label: "Connector",
    icon: "Repeat",
    description: "Completed an exchange",
    tier: "BASIC"
  },
  PRO_CROWN: {
    code: "PRO_CROWN",
    label: "Pro Member",
    icon: "Crown",
    description: "Pro membership active",
    tier: "PRO"
  },
  TOP_TRADER: {
    code: "TOP_TRADER",
    label: "Skill Master",
    icon: "Award",
    description: "Active skill exchanger",
    tier: "PRO"
  },
  DIAMOND: {
    code: "DIAMOND",
    label: "Supporter",
    icon: "Gem",
    description: "Premium supporter of SkillSwap",
    tier: "PRO"
  }
};
function computeBadges(opts) {
  const badges = [];
  const joinedDays = opts.ageDays ?? 0;
  const completed = opts.completedExchanges ?? 0;
  if (joinedDays <= 60) {
    badges.push(BADGES.EARLY_BIRD);
  }
  if (completed >= 1) {
    badges.push(BADGES.SWAPPER);
  }
  if (opts.tier === "PRO") {
    badges.push(BADGES.PRO_CROWN, BADGES.TOP_TRADER, BADGES.DIAMOND);
  }
  return badges;
}

// src/services/profile.service.ts
async function getProfile(userId) {
  const [profile, tierResult, streak] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      include: {
        availabilities: true,
        user: {
          select: { id: true, email: true, displayName: true, createdAt: true, isAdmin: true }
        }
      }
    }),
    getUserTier(userId),
    readStreak(userId).catch(() => ({ streak: 0, maxStreak: 0 }))
  ]);
  if (!profile) throw new NotFoundError("Profile not found");
  const userSkills = await prisma.userSkill.findMany({
    where: { userId },
    include: { skill: { select: { id: true, name: true, category: true } } },
    orderBy: [{ type: "asc" }, { skill: { name: "asc" } }]
  });
  const completedCount = await prisma.exchange.count({
    where: { OR: [{ userAId: userId }, { userBId: userId }], status: "COMPLETED" }
  });
  const ageDays = Math.floor((Date.now() - profile.user.createdAt.getTime()) / 864e5);
  const badges = computeBadges({
    tier: tierResult.tier,
    completedExchanges: completedCount,
    ageDays
  });
  return {
    ...profile,
    bannerStyle: profile.bannerStyle ?? "cream",
    tier: tierResult.tier,
    badges,
    userSkills,
    streak: streak.streak,
    maxStreak: streak.maxStreak
  };
}
async function updateProfile(userId, input) {
  const { availabilities, displayName, ...profileFields } = input;
  if (displayName !== void 0) {
    await prisma.user.update({ where: { id: userId }, data: { displayName } });
  }
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError("Profile not found");
  if (Object.keys(profileFields).length > 0) {
    await prisma.profile.update({
      where: { userId },
      data: {
        university: profileFields.university ?? void 0,
        department: profileFields.department ?? void 0,
        yearLevel: profileFields.yearLevel ?? void 0,
        occupation: profileFields.occupation ?? void 0,
        jobTitle: profileFields.jobTitle ?? void 0,
        company: profileFields.company ?? void 0,
        gender: profileFields.gender ?? void 0,
        bio: profileFields.bio ?? void 0,
        avatarUrl: profileFields.avatarUrl ?? void 0,
        learningFormat: profileFields.learningFormat ?? void 0,
        avatarFrame: profileFields.avatarFrame ?? void 0,
        bannerStyle: profileFields.bannerStyle ?? void 0
      }
    });
  }
  if (availabilities) {
    await prisma.availability.deleteMany({ where: { profile: { userId } } });
    await prisma.availability.createMany({
      data: availabilities.map((a) => ({ ...a, profileId: profile.id })),
      skipDuplicates: true
    });
  }
  return getProfile(userId);
}
async function getUserById(id, viewerId) {
  if (viewerId && viewerId !== id) {
    await recordProfileView(viewerId, id);
  }
  const user = await prisma.user.findFirst({
    where: { id, isActive: true },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      profile: {
        select: {
          university: true,
          department: true,
          yearLevel: true,
          occupation: true,
          jobTitle: true,
          company: true,
          gender: true,
          bio: true,
          avatarUrl: true,
          learningFormat: true,
          avatarFrame: true,
          bannerStyle: true,
          availabilities: true
        }
      },
      userSkills: {
        where: { type: "TEACH" },
        select: {
          proficiency: true,
          skill: { select: { id: true, name: true, category: true } }
        }
      },
      reviewsReceived: {
        select: { rating: true }
      },
      _count: {
        select: {
          exchangesAsA: { where: { status: "COMPLETED" } },
          exchangesAsB: { where: { status: "COMPLETED" } }
        }
      }
    }
  });
  if (!user) throw new NotFoundError("User not found");
  const wantedSkills = await prisma.userSkill.findMany({
    where: { userId: id, type: "WANT" },
    select: { skill: { select: { id: true, name: true, category: true } } }
  });
  const ratings = user.reviewsReceived.map((r) => r.rating);
  const averageRating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : null;
  const completedCount = user._count.exchangesAsA + user._count.exchangesAsB;
  const tierResult = await getUserTier(id);
  const ageDays = Math.floor((Date.now() - user.createdAt.getTime()) / 864e5);
  const badges = computeBadges({
    tier: tierResult.tier,
    completedExchanges: completedCount,
    ageDays
  });
  return {
    id: user.id,
    displayName: user.displayName,
    university: user.profile?.university ?? null,
    department: user.profile?.department ?? null,
    yearLevel: user.profile?.yearLevel ?? null,
    occupation: user.profile?.occupation ?? null,
    jobTitle: user.profile?.jobTitle ?? null,
    company: user.profile?.company ?? null,
    gender: user.profile?.gender ?? null,
    bio: user.profile?.bio ?? null,
    avatarUrl: user.profile?.avatarUrl ?? null,
    avatarFrame: user.profile?.avatarFrame ?? null,
    bannerStyle: user.profile?.bannerStyle ?? "cream",
    learningFormat: user.profile?.learningFormat ?? null,
    availabilities: user.profile?.availabilities ?? [],
    tier: tierResult.tier,
    badges,
    teachingSkills: user.userSkills.map((s) => ({
      ...s.skill,
      proficiency: s.proficiency
    })),
    wantedSkills: wantedSkills.map((w) => w.skill),
    rating: averageRating,
    reviewsCount: ratings.length,
    completedExchanges: completedCount
  };
}

// src/routes/profile.routes.ts
var router2 = (0, import_express2.Router)();
router2.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await getProfile(req.user.userId);
    ok(res, profile);
  })
);
router2.put(
  "/",
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const profile = await updateProfile(req.user.userId, req.body);
    ok(res, profile);
  })
);
var profile_routes_default = router2;

// src/routes/users.routes.ts
var import_express3 = require("express");
var router3 = (0, import_express3.Router)();
router3.get(
  "/search",
  requireAuth,
  validate(userSearchSchema, "query"),
  asyncHandler(async (req, res) => {
    const { q, skillId, university, format, page, pageSize, sort } = req.query;
    const userId = req.user.userId;
    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] },
      select: { blockerId: true, blockedUserId: true }
    });
    const blockedIds = blocks.map((b) => b.blockerId === userId ? b.blockedUserId : b.blockerId);
    const where = {
      isActive: true,
      id: { not: userId, notIn: blockedIds }
    };
    if (q) {
      where.displayName = { contains: q, mode: "insensitive" };
    }
    const profileFilter = {};
    if (university) profileFilter.university = { contains: university, mode: "insensitive" };
    if (format) profileFilter.learningFormat = format;
    if (Object.keys(profileFilter).length > 0) where.profile = profileFilter;
    if (skillId) {
      where.userSkills = { some: { skillId, type: "TEACH" } };
    }
    const orderBy = { createdAt: "desc" };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          displayName: true,
          createdAt: true,
          profile: {
            select: {
              university: true,
              department: true,
              yearLevel: true,
              avatarUrl: true,
              learningFormat: true
            }
          },
          userSkills: {
            where: { type: "TEACH" },
            select: {
              proficiency: true,
              skill: { select: { id: true, name: true, category: true } }
            }
          },
          reviewsReceived: { select: { rating: true } },
          _count: {
            select: {
              exchangesAsA: { where: { status: "COMPLETED" } },
              exchangesAsB: { where: { status: "COMPLETED" } }
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);
    const enriched = users.map((u) => {
      const ratings = u.reviewsReceived.map((r) => r.rating);
      const averageRating = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : null;
      return {
        id: u.id,
        displayName: u.displayName,
        university: u.profile?.university ?? null,
        department: u.profile?.department ?? null,
        yearLevel: u.profile?.yearLevel ?? null,
        avatarUrl: u.profile?.avatarUrl ?? null,
        learningFormat: u.profile?.learningFormat ?? null,
        teachingSkills: u.userSkills.map((s) => ({ ...s.skill, proficiency: s.proficiency })),
        rating: averageRating,
        completedExchanges: u._count.exchangesAsA + u._count.exchangesAsB
      };
    });
    ok(res, { users: enriched, total, page, pageSize });
  })
);
router3.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.id, req.user.userId);
    ok(res, user);
  })
);
router3.get(
  "/:id/reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    const reviews = await prisma.review.findMany({
      where: { reviewedUserId: req.params.id },
      orderBy: { createdAt: "desc" },
      include: {
        reviewer: { select: { id: true, displayName: true } },
        exchange: {
          select: {
            skillA: { select: { name: true } },
            skillB: { select: { name: true } }
          }
        }
      }
    });
    ok(res, reviews);
  })
);
var users_routes_default = router3;

// src/routes/skills.routes.ts
var import_express4 = require("express");

// src/services/skill.service.ts
async function listSkills(category, includeInactive = false) {
  return prisma.skill.findMany({
    where: {
      isActive: includeInactive ? void 0 : true,
      ...category ? { category } : {}
    },
    orderBy: [{ category: "asc" }, { name: "asc" }]
  });
}
async function addUserSkill(userId, skillId, type, proficiency) {
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill || !skill.isActive) throw new NotFoundError("Skill not found");
  const existing = await prisma.userSkill.findUnique({
    where: { userId_skillId_type: { userId, skillId, type } }
  });
  if (existing) throw new ConflictError("Skill already added to your profile");
  return prisma.userSkill.create({
    data: { userId, skillId, type, proficiency },
    include: { skill: true }
  });
}
async function removeUserSkill(userId, skillId, type) {
  const existing = await prisma.userSkill.findUnique({
    where: { userId_skillId_type: { userId, skillId, type } }
  });
  if (!existing) throw new NotFoundError("Skill not on profile");
  await prisma.userSkill.delete({ where: { id: existing.id } });
}
async function createSkill(input) {
  const exists = await prisma.skill.findUnique({ where: { name: input.name } });
  if (exists) throw new ConflictError("Skill already exists");
  return prisma.skill.create({ data: input });
}
async function updateSkill(id, input) {
  return prisma.skill.update({ where: { id }, data: input });
}

// src/routes/skills.routes.ts
var router4 = (0, import_express4.Router)();
router4.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const category = req.query.category;
    const skills = await listSkills(category);
    ok(res, skills);
  })
);
router4.post(
  "/:id/add",
  requireAuth,
  validate(addUserSkillSchema),
  asyncHandler(async (req, res) => {
    if (req.params.id !== req.body.skillId) throw new BadRequestError("Skill ID mismatch");
    const created = await addUserSkill(
      req.user.userId,
      req.body.skillId,
      req.body.type,
      req.body.proficiency
    );
    ok(res, created);
  })
);
router4.delete(
  "/:id/remove",
  requireAuth,
  asyncHandler(async (req, res) => {
    const type = req.query.type || "TEACH";
    await removeUserSkill(req.user.userId, req.params.id, type);
    ok(res, { removed: true });
  })
);
router4.post(
  "/",
  requireAuth,
  requireAdmin,
  validate(createSkillSchema),
  asyncHandler(async (req, res) => {
    const created = await createSkill(req.body);
    ok(res, created);
  })
);
router4.put(
  "/:id",
  requireAuth,
  requireAdmin,
  validate(updateSkillSchema),
  asyncHandler(async (req, res) => {
    const updated = await updateSkill(req.params.id, req.body);
    ok(res, updated);
  })
);
var skills_routes_default = router4;

// src/routes/matches.routes.ts
var import_express5 = require("express");

// src/services/matching.service.ts
var SCORE = {
  TEACHES_I_WANT: 50,
  I_TEACH_THEY_WANT: 30,
  SAME_UNIVERSITY: 10,
  COMPATIBLE_FORMAT: 5,
  COMPATIBLE_AVAILABILITY: 5
};
var MATCH_THRESHOLDS = {
  PERFECT: 80,
  STRONG: 60,
  POTENTIAL: 40
};
function compatibleFormat(a, b) {
  if (!a || !b) return false;
  if (a === "EITHER" || b === "EITHER") return true;
  return a === b;
}
function compatibleAvailability(a, b) {
  const aSet = new Set(a.map((s) => `${s.weekday}:${s.timeOfDay}`));
  return b.some((s) => aSet.has(`${s.weekday}:${s.timeOfDay}`));
}
function calculateMatchScore(userA, userB) {
  const theyCanTeachMe = [];
  const iCanTeachThem = [];
  for (const w of userA.wantedSkills) {
    const teaching = userB.teachingSkills.find((t) => t.id === w.id);
    if (teaching) theyCanTeachMe.push(teaching);
  }
  for (const w of userB.wantedSkills) {
    const teaching = userA.teachingSkills.find((t) => t.id === w.id);
    if (teaching) iCanTeachThem.push(teaching);
  }
  let score = 0;
  const reasons = [];
  if (theyCanTeachMe.length > 0) {
    score += SCORE.TEACHES_I_WANT;
    reasons.push(`They teach ${theyCanTeachMe.map((s) => s.name).join(", ")} \u2014 what you want`);
  }
  if (iCanTeachThem.length > 0) {
    score += SCORE.I_TEACH_THEY_WANT;
    reasons.push(`You teach ${iCanTeachThem.map((s) => s.name).join(", ")} \u2014 what they want`);
  }
  if (userA.profile?.university && userB.profile?.university && userA.profile.university.toLowerCase() === userB.profile.university.toLowerCase()) {
    score += SCORE.SAME_UNIVERSITY;
    reasons.push(`Same university: ${userB.profile.university}`);
  }
  if (compatibleFormat(userA.profile?.learningFormat ?? null, userB.profile?.learningFormat ?? null)) {
    score += SCORE.COMPATIBLE_FORMAT;
    reasons.push("Compatible learning format");
  }
  if (userA.profile?.availabilities && userB.profile?.availabilities && compatibleAvailability(userA.profile.availabilities, userB.profile.availabilities)) {
    score += SCORE.COMPATIBLE_AVAILABILITY;
    reasons.push("Compatible availability");
  }
  if (score > 100) score = 100;
  return {
    userId: userB.id,
    score,
    matchedSkills: {
      theyCanTeachMe,
      iCanTeachThem
    },
    reasons
  };
}
function matchCategory(score) {
  if (score >= MATCH_THRESHOLDS.PERFECT) return "PERFECT";
  if (score >= MATCH_THRESHOLDS.STRONG) return "STRONG";
  if (score >= MATCH_THRESHOLDS.POTENTIAL) return "POTENTIAL";
  return "NONE";
}

// src/services/subscription.service.ts
var PRO_PRODUCTS = {
  WEB_MONTHLY: { productId: "skillswap_pro_web_monthly", priceCents: 499, currency: "USD", durationDays: 30, platform: "WEB" },
  WEB_YEARLY: { productId: "skillswap_pro_web_yearly", priceCents: 4900, currency: "USD", durationDays: 365, platform: "WEB" },
  ANDROID_MONTHLY: { productId: "skillswap_pro_android_monthly", priceCents: 499, currency: "USD", durationDays: 30, platform: "ANDROID" },
  ANDROID_YEARLY: { productId: "skillswap_pro_android_yearly", priceCents: 4900, currency: "USD", durationDays: 365, platform: "ANDROID" }
};
async function getMySubscription(userId) {
  const { tier, subscription } = await getUserTier(userId);
  return {
    tier,
    subscription,
    products: Object.values(PRO_PRODUCTS)
  };
}
async function upgradeWeb(userId, productKey) {
  const product = PRO_PRODUCTS[productKey];
  if (!product || product.platform !== "WEB") throw new BadRequestError("Invalid web product");
  const expiresAt = new Date(Date.now() + product.durationDays * 24 * 60 * 60 * 1e3);
  const sub = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier: "PRO",
      status: "ACTIVE",
      platform: "WEB",
      productId: product.productId,
      startedAt: /* @__PURE__ */ new Date(),
      expiresAt,
      autoRenew: false
    },
    update: {
      tier: "PRO",
      status: "ACTIVE",
      platform: "WEB",
      productId: product.productId,
      startedAt: /* @__PURE__ */ new Date(),
      expiresAt,
      cancelledAt: null
    }
  });
  return sub;
}
async function activateAndroidPurchase(input) {
  const product = Object.values(PRO_PRODUCTS).find((p) => p.productId === input.productId);
  if (!product || product.platform !== "ANDROID") {
    throw new BadRequestError("Unknown Android product");
  }
  const expiresAt = new Date(Date.now() + product.durationDays * 24 * 60 * 60 * 1e3);
  const sub = await prisma.subscription.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      tier: "PRO",
      status: "ACTIVE",
      platform: "ANDROID",
      productId: product.productId,
      purchaseToken: input.purchaseToken,
      orderId: input.orderId,
      startedAt: /* @__PURE__ */ new Date(),
      expiresAt,
      autoRenew: true
    },
    update: {
      tier: "PRO",
      status: "ACTIVE",
      platform: "ANDROID",
      productId: product.productId,
      purchaseToken: input.purchaseToken,
      orderId: input.orderId,
      startedAt: /* @__PURE__ */ new Date(),
      expiresAt,
      cancelledAt: null
    }
  });
  return sub;
}
async function cancelSubscription(userId) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) throw new NotFoundError("No subscription found");
  return prisma.subscription.update({
    where: { userId },
    data: { status: "CANCELLED", cancelledAt: /* @__PURE__ */ new Date(), autoRenew: false }
  });
}
async function restorePurchases(userId) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return { tier: "FREE", restored: false };
  const active = sub.status === "ACTIVE" && (!sub.expiresAt || sub.expiresAt > /* @__PURE__ */ new Date());
  return { tier: active ? "PRO" : "FREE", restored: true, subscription: sub };
}
async function activateBoost(userId) {
  const { tier } = await getUserTier(userId);
  if (tier !== "PRO") throw new BadRequestError("Boost is a Pro feature");
  const endsAt = new Date(Date.now() + 60 * 60 * 1e3);
  const boost = await prisma.boost.create({
    data: { userId, startsAt: /* @__PURE__ */ new Date(), endsAt }
  });
  return boost;
}
async function activeBoosts() {
  const now = /* @__PURE__ */ new Date();
  const boosts = await prisma.boost.findMany({ where: { endsAt: { gt: now } } });
  return new Set(boosts.map((b) => b.userId));
}

// src/services/match.service.ts
async function getMatchesForUser(userId, filters) {
  const minScore = filters.minScore ?? 40;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedUserId: userId }]
    },
    select: { blockerId: true, blockedUserId: true }
  });
  const blockedUserIds = /* @__PURE__ */ new Set();
  blocks.forEach((b) => {
    blockedUserIds.add(b.blockerId === userId ? b.blockedUserId : b.blockerId);
  });
  const viewer = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      profile: {
        select: {
          university: true,
          learningFormat: true,
          availabilities: { select: { weekday: true, timeOfDay: true } }
        }
      },
      userSkills: {
        select: {
          type: true,
          skill: { select: { id: true, name: true, category: true } }
        }
      }
    }
  });
  if (!viewer) return { matches: [], total: 0, page, pageSize };
  const viewerInput = {
    id: viewer.id,
    isActive: viewer.isActive,
    profile: viewer.profile ? {
      university: viewer.profile.university,
      learningFormat: viewer.profile.learningFormat,
      availabilities: viewer.profile.availabilities
    } : null,
    teachingSkills: viewer.userSkills.filter((s) => s.type === "TEACH").map((s) => s.skill),
    wantedSkills: viewer.userSkills.filter((s) => s.type === "WANT").map((s) => s.skill)
  };
  const candidateWhere = {
    isActive: true,
    id: { not: userId, notIn: Array.from(blockedUserIds) }
  };
  if (filters.university) {
    candidateWhere.profile = {
      ...candidateWhere.profile || {},
      university: { contains: filters.university, mode: "insensitive" }
    };
  }
  if (filters.format) {
    candidateWhere.profile = {
      ...candidateWhere.profile || {},
      learningFormat: filters.format
    };
  }
  if (filters.skillId) {
    candidateWhere.userSkills = {
      some: { skillId: filters.skillId, type: "TEACH" }
    };
  }
  const candidates = await prisma.user.findMany({
    where: candidateWhere,
    select: {
      id: true,
      isActive: true,
      profile: {
        select: {
          university: true,
          learningFormat: true,
          availabilities: { select: { weekday: true, timeOfDay: true } }
        }
      },
      userSkills: {
        select: {
          type: true,
          skill: { select: { id: true, name: true, category: true } }
        }
      }
    },
    take: 200
  });
  const boostSet = await activeBoosts();
  const candidateSubs = await prisma.subscription.findMany({
    where: { userId: { in: candidates.map((c) => c.id) } }
  });
  const tierMap = new Map(
    candidateSubs.map((s) => [
      s.userId,
      s.status === "ACTIVE" && (!s.expiresAt || s.expiresAt > /* @__PURE__ */ new Date()) && s.tier === "PRO" ? "PRO" : "FREE"
    ])
  );
  const scores = candidates.map((c) => {
    const candidateInput = {
      id: c.id,
      isActive: c.isActive,
      profile: c.profile ? {
        university: c.profile.university,
        learningFormat: c.profile.learningFormat,
        availabilities: c.profile.availabilities
      } : null,
      teachingSkills: c.userSkills.filter((s) => s.type === "TEACH").map((s) => s.skill),
      wantedSkills: c.userSkills.filter((s) => s.type === "WANT").map((s) => s.skill)
    };
    const ms = calculateMatchScore(viewerInput, candidateInput);
    const category = matchCategory(ms.score);
    const boost = boostSet.has(c.id) ? 0.5 : 0;
    const adjusted = Math.min(100, ms.score + boost);
    return {
      ...ms,
      score: adjusted,
      category,
      isBoosted: boostSet.has(c.id),
      tier: tierMap.get(c.id) === "PRO" ? "PRO" : "FREE"
    };
  }).filter((m) => m.score >= minScore).sort((a, b) => {
    if (Math.abs(b.score - a.score) < 5 && a.isBoosted && !b.isBoosted) return 1;
    if (Math.abs(b.score - a.score) < 5 && !a.isBoosted && b.isBoosted) return -1;
    return b.score - a.score;
  });
  const userIds = scores.map((s) => s.userId);
  const profiles = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      displayName: true,
      profile: {
        select: { avatarUrl: true, avatarFrame: true, university: true, department: true, learningFormat: true }
      },
      reviewsReceived: { select: { rating: true } },
      _count: {
        select: {
          exchangesAsA: { where: { status: "COMPLETED" } },
          exchangesAsB: { where: { status: "COMPLETED" } }
        }
      }
    }
  });
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const total = scores.length;
  const paginated = scores.slice((page - 1) * pageSize, page * pageSize);
  const enriched = paginated.map((m) => {
    const p = profileMap.get(m.userId);
    const ratings = p?.reviewsReceived.map((r) => r.rating) ?? [];
    const avg = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 : null;
    return {
      ...m,
      displayName: p?.displayName ?? null,
      avatarUrl: p?.profile?.avatarUrl ?? null,
      avatarFrame: p?.profile?.avatarFrame ?? null,
      university: p?.profile?.university ?? null,
      department: p?.profile?.department ?? null,
      learningFormat: p?.profile?.learningFormat ?? null,
      rating: avg,
      completedExchanges: (p?._count.exchangesAsA ?? 0) + (p?._count.exchangesAsB ?? 0),
      isBoosted: m.isBoosted
    };
  });
  return { matches: enriched, total, page, pageSize };
}
async function getMatchDetail(viewerId, otherId) {
  const result = await getMatchesForUser(viewerId, {
    minScore: 0,
    pageSize: 100
  });
  const found = result.matches.find((m) => m.userId === otherId);
  return found || null;
}

// src/routes/matches.routes.ts
var router5 = (0, import_express5.Router)();
router5.get(
  "/",
  requireAuth,
  validate(matchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const result = await getMatchesForUser(req.user.userId, req.query);
    ok(res, result);
  })
);
router5.get(
  "/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const detail = await getMatchDetail(req.user.userId, req.params.userId);
    ok(res, detail);
  })
);
var matches_routes_default = router5;

// src/routes/exchangeRequests.routes.ts
var import_express6 = require("express");

// src/services/notification.service.ts
async function createNotification(input) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload
    }
  });
}
async function listNotifications(userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}
async function markRead(userId, notificationId) {
  const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notif || notif.userId !== userId) throw new Error("Notification not found");
  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true }
  });
}
async function markAllRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true }
  });
}

// src/services/exchangeRequest.service.ts
async function createExchangeRequest(input) {
  if (input.senderId === input.receiverId) {
    throw new BadRequestError("Cannot send a request to yourself");
  }
  const limitCheck = await checkCanSendRequest(input.senderId);
  if (!limitCheck.allowed) {
    throw new ForbiddenError(limitCheck.reason || "Limit reached");
  }
  const [receiver, sender] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.receiverId }, select: { id: true, isActive: true } }),
    prisma.user.findUnique({ where: { id: input.senderId }, select: { id: true, isActive: true } })
  ]);
  if (!receiver || !receiver.isActive) throw new NotFoundError("Recipient not found");
  if (!sender || !sender.isActive) throw new BadRequestError("Your account is inactive");
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: input.senderId, blockedUserId: input.receiverId },
        { blockerId: input.receiverId, blockedUserId: input.senderId }
      ]
    }
  });
  if (blocked) throw new ForbiddenError("You cannot send a request to this user");
  const [senderTeaches, receiverTeaches] = await Promise.all([
    prisma.userSkill.findUnique({
      where: {
        userId_skillId_type: {
          userId: input.senderId,
          skillId: input.offeredSkillId,
          type: "TEACH"
        }
      }
    }),
    prisma.userSkill.findUnique({
      where: {
        userId_skillId_type: {
          userId: input.receiverId,
          skillId: input.requestedSkillId,
          type: "TEACH"
        }
      }
    })
  ]);
  if (!senderTeaches) throw new BadRequestError("You do not teach the offered skill");
  if (!receiverTeaches) throw new BadRequestError("Recipient does not teach the requested skill");
  const dup = await prisma.exchangeRequest.findFirst({
    where: {
      senderId: input.senderId,
      receiverId: input.receiverId,
      offeredSkillId: input.offeredSkillId,
      requestedSkillId: input.requestedSkillId,
      status: "PENDING"
    }
  });
  if (dup) throw new ConflictError("A pending request already exists");
  const created = await prisma.exchangeRequest.create({
    data: {
      senderId: input.senderId,
      receiverId: input.receiverId,
      offeredSkillId: input.offeredSkillId,
      requestedSkillId: input.requestedSkillId,
      message: input.message,
      status: "PENDING"
    },
    include: {
      sender: { select: { id: true, displayName: true } },
      receiver: { select: { id: true, displayName: true } }
    }
  });
  await createNotification({
    userId: input.receiverId,
    type: "EXCHANGE_REQUEST_RECEIVED",
    title: "New exchange request",
    body: `${created.sender.displayName} wants to learn from you.`,
    payload: { requestId: created.id, senderId: input.senderId }
  });
  return created;
}
async function listRequests(userId, type) {
  const where = type === "sent" ? { senderId: userId } : { receiverId: userId };
  const requests = await prisma.exchangeRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } } },
      receiver: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } } },
      offeredSkill: { select: { id: true, name: true, category: true } },
      requestedSkill: { select: { id: true, name: true, category: true } }
    }
  });
  return requests;
}
async function acceptRequest(userId, requestId) {
  const request = await prisma.exchangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Request not found");
  if (request.receiverId !== userId) throw new ForbiddenError("You cannot accept this request");
  if (request.status !== "PENDING") throw new BadRequestError("Request is no longer pending");
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.exchange.findFirst({
      where: {
        OR: [
          { userAId: request.senderId, userBId: request.receiverId, skillAId: request.offeredSkillId, skillBId: request.requestedSkillId, status: "ACTIVE" },
          { userAId: request.receiverId, userBId: request.senderId, skillAId: request.requestedSkillId, skillBId: request.offeredSkillId, status: "ACTIVE" }
        ]
      }
    });
    if (existing) throw new ConflictError("An active exchange already exists for this pair");
    const exchange = await tx.exchange.create({
      data: {
        requestId: request.id,
        userAId: request.senderId,
        userBId: request.receiverId,
        skillAId: request.offeredSkillId,
        skillBId: request.requestedSkillId,
        status: "ACTIVE"
      }
    });
    await tx.exchangeRequest.update({
      where: { id: request.id },
      data: { status: "ACCEPTED" }
    });
    return exchange;
  });
  await createNotification({
    userId: request.senderId,
    type: "EXCHANGE_REQUEST_ACCEPTED",
    title: "Request accepted",
    body: "Your exchange request was accepted. You can now chat and schedule sessions.",
    payload: { exchangeId: result.id }
  });
  return result;
}
async function rejectRequest(userId, requestId) {
  const request = await prisma.exchangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Request not found");
  if (request.receiverId !== userId) throw new ForbiddenError("You cannot reject this request");
  if (request.status !== "PENDING") throw new BadRequestError("Request is no longer pending");
  const updated = await prisma.exchangeRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED" }
  });
  await createNotification({
    userId: request.senderId,
    type: "EXCHANGE_REQUEST_REJECTED",
    title: "Request declined",
    body: "Your exchange request was declined.",
    payload: { requestId: request.id }
  });
  return updated;
}
async function cancelRequest(userId, requestId) {
  const request = await prisma.exchangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Request not found");
  if (request.senderId !== userId) throw new ForbiddenError("You cannot cancel this request");
  if (request.status !== "PENDING") throw new BadRequestError("Request is no longer pending");
  return prisma.exchangeRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED" }
  });
}

// src/routes/exchangeRequests.routes.ts
var router6 = (0, import_express6.Router)();
router6.post(
  "/",
  requireAuth,
  validate(createExchangeRequestSchema),
  asyncHandler(async (req, res) => {
    const created = await createExchangeRequest({
      ...req.body,
      senderId: req.user.userId
    });
    ok(res, created);
  })
);
router6.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const type = req.query.type || "received";
    const list = await listRequests(req.user.userId, type);
    ok(res, list);
  })
);
router6.post(
  "/:id/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await acceptRequest(req.user.userId, req.params.id);
    ok(res, result);
  })
);
router6.post(
  "/:id/reject",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await rejectRequest(req.user.userId, req.params.id);
    ok(res, result);
  })
);
router6.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await cancelRequest(req.user.userId, req.params.id);
    ok(res, result);
  })
);
var exchangeRequests_routes_default = router6;

// src/routes/exchanges.routes.ts
var import_express7 = require("express");

// src/services/exchange.service.ts
async function assertParticipant(userId, exchangeId) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError("Exchange not found");
  if (exchange.userAId !== userId && exchange.userBId !== userId) {
    throw new ForbiddenError("Not a participant in this exchange");
  }
  return exchange;
}
async function listUserExchanges(userId) {
  const exchanges = await prisma.exchange.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }]
    },
    orderBy: { updatedAt: "desc" },
    include: {
      userA: {
        select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true } } }
      },
      userB: {
        select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true } } }
      },
      _count: { select: { messages: true, sessions: true } }
    }
  });
  const skillIds = Array.from(new Set(exchanges.flatMap((e) => [e.skillAId, e.skillBId])));
  const skills = await prisma.skill.findMany({
    where: { id: { in: skillIds } },
    select: { id: true, name: true, category: true }
  });
  const skillMap = new Map(skills.map((s) => [s.id, s]));
  return exchanges.map((e) => ({
    id: e.id,
    userA: e.userA,
    userB: e.userB,
    skillA: skillMap.get(e.skillAId),
    skillB: skillMap.get(e.skillBId),
    status: e.status,
    createdAt: e.createdAt,
    completedAt: e.completedAt,
    messageCount: e._count.messages,
    sessionCount: e._count.sessions
  }));
}
async function getExchange(userId, exchangeId) {
  const exchange = await assertParticipant(userId, exchangeId);
  const [userA, userB, skillA, skillB, sessions, messages, confirmations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: exchange.userAId },
      select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } }
    }),
    prisma.user.findUnique({
      where: { id: exchange.userBId },
      select: { id: true, displayName: true, profile: { select: { avatarUrl: true, avatarFrame: true, university: true } } }
    }),
    prisma.skill.findUnique({ where: { id: exchange.skillAId } }),
    prisma.skill.findUnique({ where: { id: exchange.skillBId } }),
    prisma.session.findMany({ where: { exchangeId }, orderBy: { scheduledAt: "asc" } }),
    prisma.message.count({ where: { exchangeId } }),
    prisma.exchangeCompletionConfirmation.findMany({
      where: { exchangeId },
      select: { userId: true }
    })
  ]);
  return {
    ...exchange,
    userA,
    userB,
    skillA,
    skillB,
    sessions,
    messageCount: messages,
    completions: confirmations.map((c) => c.userId)
  };
}
async function completeExchange(userId, exchangeId) {
  const exchange = await assertParticipant(userId, exchangeId);
  if (exchange.status !== "ACTIVE") throw new BadRequestError("Exchange is not active");
  await prisma.exchangeCompletionConfirmation.upsert({
    where: { exchangeId_userId: { exchangeId, userId } },
    create: { exchangeId, userId },
    update: { confirmedAt: /* @__PURE__ */ new Date() }
  });
  const confirmations = await prisma.exchangeCompletionConfirmation.findMany({
    where: { exchangeId }
  });
  if (confirmations.length === 2) {
    await prisma.exchange.update({
      where: { id: exchangeId },
      data: { status: "COMPLETED", completedAt: /* @__PURE__ */ new Date() }
    });
    const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
    await createNotification({
      userId,
      type: "EXCHANGE_COMPLETED",
      title: "Exchange completed",
      body: "Your exchange is now complete. You can leave a review.",
      payload: { exchangeId }
    });
    await createNotification({
      userId: otherUserId,
      type: "EXCHANGE_COMPLETED",
      title: "Exchange completed",
      body: "Your exchange is now complete. You can leave a review.",
      payload: { exchangeId }
    });
  } else {
    const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
    await createNotification({
      userId: otherUserId,
      type: "EXCHANGE_COMPLETION_REQUESTED",
      title: "Completion requested",
      body: "Your exchange partner has requested to complete this exchange.",
      payload: { exchangeId }
    });
  }
  return getExchange(userId, exchangeId);
}
async function cancelExchange(userId, exchangeId) {
  const exchange = await assertParticipant(userId, exchangeId);
  if (exchange.status !== "ACTIVE") throw new BadRequestError("Exchange is not active");
  await prisma.exchange.update({
    where: { id: exchangeId },
    data: { status: "CANCELLED" }
  });
  const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: "EXCHANGE_CANCELLED",
    title: "Exchange cancelled",
    body: "Your exchange partner cancelled the exchange.",
    payload: { exchangeId }
  });
  return getExchange(userId, exchangeId);
}

// src/services/session.service.ts
async function assertParticipant2(userId, exchangeId) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError("Exchange not found");
  if (exchange.userAId !== userId && exchange.userBId !== userId) {
    throw new ForbiddenError("Not a participant in this exchange");
  }
  return exchange;
}
async function listSessions(userId, exchangeId) {
  await assertParticipant2(userId, exchangeId);
  return prisma.session.findMany({
    where: { exchangeId },
    orderBy: { scheduledAt: "asc" }
  });
}
async function createSession(userId, exchangeId, input) {
  const exchange = await assertParticipant2(userId, exchangeId);
  if (exchange.status !== "ACTIVE") throw new BadRequestError("Exchange is not active");
  const session = await prisma.session.create({
    data: {
      exchangeId,
      title: input.title,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      format: input.format,
      meetingLink: input.meetingLink,
      location: input.location,
      notes: input.notes,
      status: "SCHEDULED"
    }
  });
  const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: "SESSION_SCHEDULED",
    title: "New session scheduled",
    body: `${input.title} on ${input.scheduledAt.toLocaleString()}`,
    payload: { exchangeId, sessionId: session.id }
  });
  return session;
}
async function updateSession(userId, sessionId, input) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { exchange: true }
  });
  if (!session) throw new NotFoundError("Session not found");
  if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
    throw new ForbiddenError("Not a participant");
  }
  const data = { ...input };
  if (input.scheduledAt) data.scheduledAt = new Date(input.scheduledAt);
  const updated = await prisma.session.update({ where: { id: sessionId }, data });
  const otherUserId = session.exchange.userAId === userId ? session.exchange.userBId : session.exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: "SESSION_UPDATED",
    title: "Session updated",
    body: `${updated.title} \u2014 ${updated.scheduledAt.toLocaleString()}`,
    payload: { exchangeId: session.exchangeId, sessionId }
  });
  return updated;
}
async function deleteSession(userId, sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { exchange: true }
  });
  if (!session) throw new NotFoundError("Session not found");
  if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
    throw new ForbiddenError("Not a participant");
  }
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: "CANCELLED" }
  });
  const otherUserId = session.exchange.userAId === userId ? session.exchange.userBId : session.exchange.userAId;
  await createNotification({
    userId: otherUserId,
    type: "SESSION_CANCELLED",
    title: "Session cancelled",
    body: `${session.title} was cancelled.`,
    payload: { exchangeId: session.exchangeId, sessionId }
  });
  return { cancelled: true };
}
async function completeSession(userId, sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { exchange: true }
  });
  if (!session) throw new NotFoundError("Session not found");
  if (session.exchange.userAId !== userId && session.exchange.userBId !== userId) {
    throw new ForbiddenError("Not a participant");
  }
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { status: "COMPLETED" }
  });
  return updated;
}

// src/sockets/io.ts
var import_socket = require("socket.io");
var import_jsonwebtoken2 = __toESM(require("jsonwebtoken"));
init_env();
var io = null;
function initSocket(httpServer2) {
  io = new import_socket.Server(httpServer2, {
    cors: {
      origin: env.CLIENT_URL === "*" ? true : env.CLIENT_URL,
      credentials: true
    }
  });
  io.use(async (socket, next) => {
    try {
      let token;
      const cookieHeader = socket.handshake.headers.cookie || "";
      const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
      if (match) token = decodeURIComponent(match[1]);
      if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }
      if (!token) return next(new Error("Unauthorized"));
      const payload = import_jsonwebtoken2.default.verify(token, env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, isActive: true }
      });
      if (!user || !user.isActive) return next(new Error("Unauthorized"));
      socket.userId = user.id;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);
    socket.on("exchange:join", async (exchangeId) => {
      const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
      if (exchange && (exchange.userAId === userId || exchange.userBId === userId) && exchange.status === "ACTIVE") {
        socket.join(`exchange:${exchangeId}`);
      }
    });
    socket.on("exchange:leave", (exchangeId) => {
      socket.leave(`exchange:${exchangeId}`);
    });
    socket.on("message:send", async (data) => {
      try {
        const exchange = await prisma.exchange.findUnique({ where: { id: data.exchangeId } });
        if (!exchange || exchange.userAId !== userId && exchange.userBId !== userId || exchange.status !== "ACTIVE") return;
        const message = await prisma.message.create({
          data: {
            exchangeId: data.exchangeId,
            senderId: userId,
            body: data.body,
            type: data.type || "TEXT"
          },
          include: { sender: { select: { id: true, displayName: true } } }
        });
        io.to(`exchange:${data.exchangeId}`).emit("message:new", message);
      } catch (e) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });
    socket.on("message:read", async (data) => {
      await prisma.message.updateMany({
        where: { exchangeId: data.exchangeId, senderId: { not: userId }, readAt: null },
        data: { readAt: /* @__PURE__ */ new Date() }
      });
      io.to(`exchange:${data.exchangeId}`).emit("message:read", {
        exchangeId: data.exchangeId,
        readerId: userId
      });
    });
    socket.on("typing", (data) => {
      socket.to(`exchange:${data.exchangeId}`).emit("typing", {
        exchangeId: data.exchangeId,
        userId
      });
    });
    socket.on("call:request", async (data) => {
      try {
        const exchange = await prisma.exchange.findUnique({
          where: { id: data.exchangeId },
          select: { id: true, userAId: true, userBId: true, status: true }
        });
        if (!exchange || exchange.userAId !== userId && exchange.userBId !== userId || exchange.status !== "ACTIVE") {
          return socket.emit("error", { message: "Cannot place call" });
        }
        const targetUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
        const caller = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            profile: { select: { avatarUrl: true, avatarFrame: true } }
          }
        });
        const callerPayload = {
          id: caller?.id ?? userId,
          displayName: caller?.displayName ?? "User",
          avatarUrl: caller?.profile?.avatarUrl ?? null,
          avatarFrame: caller?.profile?.avatarFrame ?? null
        };
        const payload = { exchangeId: data.exchangeId, video: !!data.video, caller: callerPayload };
        io.to(`exchange:${data.exchangeId}`).emit("call:ringing", payload);
        io.to(`user:${targetUserId}`).emit("call:ringing", payload);
      } catch (e) {
        socket.emit("error", { message: "Failed to initiate call" });
      }
    });
    socket.on("call:accept", (data) => {
      socket.to(`exchange:${data.exchangeId}`).emit("call:accepted", {
        exchangeId: data.exchangeId,
        acceptorId: userId
      });
    });
    socket.on("call:reject", (data) => {
      socket.to(`exchange:${data.exchangeId}`).emit("call:rejected", {
        exchangeId: data.exchangeId,
        rejectorId: userId
      });
    });
    socket.on("call:hangup", (data) => {
      socket.to(`exchange:${data.exchangeId}`).emit("call:ended", {
        exchangeId: data.exchangeId,
        endedBy: userId
      });
    });
    socket.on("webrtc:signal", (data) => {
      io.to(`user:${data.to}`).emit("webrtc:signal", {
        exchangeId: data.exchangeId,
        from: userId,
        signal: data.signal
      });
    });
  });
}
function emitToExchange(exchangeId, event, payload) {
  if (!io) return;
  io.to(`exchange:${exchangeId}`).emit(event, payload);
}

// src/services/message.service.ts
async function assertActiveParticipant(userId, exchangeId) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError("Exchange not found");
  if (exchange.userAId !== userId && exchange.userBId !== userId) {
    throw new ForbiddenError("Not a participant in this exchange");
  }
  if (exchange.status !== "ACTIVE") {
    throw new BadRequestError("Exchange is not active");
  }
  return exchange;
}
async function listMessages(userId, exchangeId) {
  await assertActiveParticipant(userId, exchangeId);
  const messages = await prisma.message.findMany({
    where: { exchangeId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, displayName: true } } }
  });
  await prisma.message.updateMany({
    where: { exchangeId, readAt: null, senderId: { not: userId } },
    data: { readAt: /* @__PURE__ */ new Date() }
  });
  return messages;
}
async function listConversations(userId) {
  const exchanges = await prisma.exchange.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ userAId: userId }, { userBId: userId }],
      messages: { some: {} }
    },
    select: {
      id: true,
      userAId: true,
      updatedAt: true,
      userA: {
        select: {
          id: true,
          displayName: true,
          profile: { select: { avatarUrl: true, avatarFrame: true } }
        }
      },
      userB: {
        select: {
          id: true,
          displayName: true,
          profile: { select: { avatarUrl: true, avatarFrame: true } }
        }
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: { messages: { where: { readAt: null, senderId: { not: userId } } } }
      }
    }
  });
  return exchanges.map((ex) => {
    const partner = ex.userAId === userId ? ex.userB : ex.userA;
    return {
      exchangeId: ex.id,
      partner,
      lastMessage: ex.messages[0] ?? null,
      unreadCount: ex._count.messages,
      updatedAt: ex.messages[0]?.createdAt ?? ex.updatedAt
    };
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
async function createMessage(userId, exchangeId, body, type = "TEXT") {
  const exchange = await assertActiveParticipant(userId, exchangeId);
  const message = await prisma.message.create({
    data: { exchangeId, senderId: userId, body, type },
    include: { sender: { select: { id: true, displayName: true } } }
  });
  emitToExchange(exchangeId, "message:new", message);
  const otherUserId = exchange.userAId === userId ? exchange.userBId : exchange.userAId;
  const notifBody = type === "IMAGE" ? "\u{1F4F7} Image" : type === "STICKER" ? "\u{1F3A8} Sticker" : body.slice(0, 100);
  await prisma.notification.create({
    data: {
      userId: otherUserId,
      type: "NEW_MESSAGE",
      title: `New message from ${message.sender.displayName}`,
      body: notifBody,
      payload: { exchangeId, messageId: message.id }
    }
  });
  return message;
}

// src/services/review.service.ts
async function createReview(reviewerId, exchangeId, input) {
  const exchange = await prisma.exchange.findUnique({ where: { id: exchangeId } });
  if (!exchange) throw new NotFoundError("Exchange not found");
  if (exchange.userAId !== reviewerId && exchange.userBId !== reviewerId) {
    throw new ForbiddenError("You did not participate in this exchange");
  }
  if (exchange.status !== "COMPLETED") {
    throw new BadRequestError("Reviews are only allowed on completed exchanges");
  }
  if (input.rating < 1 || input.rating > 5) {
    throw new BadRequestError("Rating must be between 1 and 5");
  }
  const reviewedUserId = exchange.userAId === reviewerId ? exchange.userBId : exchange.userAId;
  const existing = await prisma.review.findUnique({
    where: { exchangeId_reviewerId: { exchangeId, reviewerId } }
  });
  if (existing) throw new ConflictError("You have already reviewed this exchange");
  const review = await prisma.review.create({
    data: {
      exchangeId,
      reviewerId,
      reviewedUserId,
      rating: input.rating,
      comment: input.comment
    }
  });
  await createNotification({
    userId: reviewedUserId,
    type: "NEW_REVIEW",
    title: "New review",
    body: `You received a ${input.rating}-star review.`,
    payload: { exchangeId, reviewId: review.id, rating: input.rating }
  });
  return review;
}

// src/routes/exchanges.routes.ts
var router7 = (0, import_express7.Router)();
router7.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await listUserExchanges(req.user.userId);
    ok(res, list);
  })
);
router7.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const exchange = await getExchange(req.user.userId, req.params.id);
    ok(res, exchange);
  })
);
router7.post(
  "/:id/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await completeExchange(req.user.userId, req.params.id);
    ok(res, result);
  })
);
router7.post(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await cancelExchange(req.user.userId, req.params.id);
    ok(res, result);
  })
);
router7.get(
  "/:id/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await listSessions(req.user.userId, req.params.id);
    ok(res, list);
  })
);
router7.post(
  "/:id/sessions",
  requireAuth,
  validate(createSessionSchema),
  asyncHandler(async (req, res) => {
    const created = await createSession(req.user.userId, req.params.id, {
      ...req.body,
      scheduledAt: new Date(req.body.scheduledAt)
    });
    ok(res, created);
  })
);
router7.get(
  "/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await listMessages(req.user.userId, req.params.id);
    ok(res, list);
  })
);
router7.post(
  "/:id/messages",
  requireAuth,
  validate(createMessageSchema),
  asyncHandler(async (req, res) => {
    const msg = await createMessage(
      req.user.userId,
      req.params.id,
      req.body.body,
      req.body.type
    );
    ok(res, msg);
  })
);
router7.post(
  "/:id/review",
  requireAuth,
  validate(createReviewSchema),
  asyncHandler(async (req, res) => {
    const review = await createReview(req.user.userId, req.params.id, req.body);
    ok(res, review);
  })
);
var exchanges_routes_default = router7;

// src/routes/messages.routes.ts
var import_express8 = require("express");
var router8 = (0, import_express8.Router)();
router8.get(
  "/conversations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await listConversations(req.user.userId);
    ok(res, list);
  })
);
var messages_routes_default = router8;

// src/routes/sessions.routes.ts
var import_express9 = require("express");
var router9 = (0, import_express9.Router)();
router9.put(
  "/:id",
  requireAuth,
  validate(updateSessionSchema),
  asyncHandler(async (req, res) => {
    const updated = await updateSession(req.user.userId, req.params.id, req.body);
    ok(res, updated);
  })
);
router9.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await deleteSession(req.user.userId, req.params.id);
    ok(res, result);
  })
);
router9.post(
  "/:id/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await completeSession(req.user.userId, req.params.id);
    ok(res, result);
  })
);
var sessions_routes_default = router9;

// src/routes/notifications.routes.ts
var import_express10 = require("express");
var router10 = (0, import_express10.Router)();
router10.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await listNotifications(req.user.userId);
    const unreadCount = list.filter((n) => !n.isRead).length;
    ok(res, { notifications: list, unreadCount });
  })
);
router10.post(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const updated = await markRead(req.user.userId, req.params.id);
    ok(res, updated);
  })
);
router10.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await markAllRead(req.user.userId);
    ok(res, { updated: result.count });
  })
);
var notifications_routes_default = router10;

// src/routes/safety.routes.ts
var import_express11 = require("express");

// src/services/safety.service.ts
async function reportUser(reporterId, input) {
  if (reporterId === input.reportedUserId) {
    throw new BadRequestError("Cannot report yourself");
  }
  const exists = await prisma.user.findUnique({ where: { id: input.reportedUserId } });
  if (!exists) throw new NotFoundError("User not found");
  return prisma.report.create({
    data: {
      reporterId,
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      description: input.description
    }
  });
}
async function blockUser(blockerId, blockedUserId) {
  if (blockerId === blockedUserId) {
    throw new BadRequestError("Cannot block yourself");
  }
  const exists = await prisma.user.findUnique({ where: { id: blockedUserId } });
  if (!exists) throw new NotFoundError("User not found");
  await prisma.block.upsert({
    where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
    create: { blockerId, blockedUserId },
    update: {}
  });
  return { blocked: true };
}
async function unblockUser(blockerId, blockedUserId) {
  await prisma.block.deleteMany({
    where: { blockerId, blockedUserId }
  });
  return { unblocked: true };
}

// src/routes/safety.routes.ts
var router11 = (0, import_express11.Router)();
router11.post(
  "/reports",
  requireAuth,
  validate(createReportSchema),
  asyncHandler(async (req, res) => {
    const report = await reportUser(req.user.userId, req.body);
    ok(res, report);
  })
);
router11.post(
  "/users/:id/block",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await blockUser(req.user.userId, req.params.id);
    ok(res, result);
  })
);
router11.delete(
  "/users/:id/block",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await unblockUser(req.user.userId, req.params.id);
    ok(res, result);
  })
);
var safety_routes_default = router11;

// src/routes/admin.routes.ts
var import_express12 = require("express");

// src/services/admin.service.ts
async function getStats() {
  const [
    userCount,
    activeUserCount,
    activeExchanges,
    completedExchanges,
    openReports,
    skills
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.exchange.count({ where: { status: "ACTIVE" } }),
    prisma.exchange.count({ where: { status: "COMPLETED" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.skill.count()
  ]);
  const popularSkills = await prisma.userSkill.groupBy({
    by: ["skillId"],
    where: { type: "TEACH" },
    _count: { skillId: true },
    orderBy: { _count: { skillId: "desc" } },
    take: 10
  });
  const popularSkillIds = popularSkills.map((p) => p.skillId);
  const skillInfo = await prisma.skill.findMany({
    where: { id: { in: popularSkillIds } },
    select: { id: true, name: true, category: true }
  });
  const skillMap = new Map(skillInfo.map((s) => [s.id, s]));
  const mostRequested = await prisma.userSkill.groupBy({
    by: ["skillId"],
    where: { type: "WANT" },
    _count: { skillId: true },
    orderBy: { _count: { skillId: "desc" } },
    take: 10
  });
  const requestedIds = mostRequested.map((p) => p.skillId);
  const reqInfo = await prisma.skill.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true, name: true, category: true }
  });
  const reqMap = new Map(reqInfo.map((s) => [s.id, s]));
  return {
    userCount,
    activeUserCount,
    activeExchanges,
    completedExchanges,
    openReports,
    skillsCount: skills,
    popularSkills: popularSkills.map((p) => ({
      ...skillMap.get(p.skillId),
      teacherCount: p._count.skillId
    })),
    mostRequested: mostRequested.map((p) => ({
      ...reqMap.get(p.skillId),
      learnerCount: p._count.skillId
    }))
  };
}
async function listUsers(opts) {
  const where = {};
  if (opts.q) {
    where.OR = [
      { displayName: { contains: opts.q, mode: "insensitive" } },
      { email: { contains: opts.q, mode: "insensitive" } }
    ];
  }
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        isAdmin: true,
        createdAt: true
      }
    }),
    prisma.user.count({ where })
  ]);
  return { users, total };
}
async function updateUser(id, input) {
  return prisma.user.update({ where: { id }, data: input });
}
async function listReports(opts) {
  return prisma.report.findMany({
    where: opts.status ? { status: opts.status } : void 0,
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, displayName: true, email: true } },
      reportedUser: { select: { id: true, displayName: true, email: true } }
    }
  });
}
async function updateReport(id, input) {
  return prisma.report.update({
    where: { id },
    data: {
      status: input.status,
      resolvedAt: input.status === "RESOLVED" || input.status === "DISMISSED" ? /* @__PURE__ */ new Date() : null
    }
  });
}

// src/routes/admin.routes.ts
var router12 = (0, import_express12.Router)();
router12.use(requireAuth, requireAdmin);
router12.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const stats = await getStats();
    ok(res, stats);
  })
);
router12.get(
  "/users",
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page || "1");
    const pageSize = parseInt(req.query.pageSize || "20");
    const q = req.query.q;
    const result = await listUsers({ page, pageSize, q });
    ok(res, result);
  })
);
router12.put(
  "/users/:id",
  validate(adminUpdateUserSchema),
  asyncHandler(async (req, res) => {
    const updated = await updateUser(req.params.id, req.body);
    ok(res, updated);
  })
);
router12.get(
  "/skills",
  asyncHandler(async (_req, res) => {
    const skills = await listSkills(void 0, true);
    ok(res, skills);
  })
);
router12.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    const reports = await listReports({ status });
    ok(res, reports);
  })
);
router12.put(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const updated = await updateReport(req.params.id, req.body);
    ok(res, updated);
  })
);
var admin_routes_default = router12;

// src/routes/billing.routes.ts
var import_express13 = require("express");
var import_zod3 = require("zod");
var router13 = (0, import_express13.Router)();
router13.get(
  "/subscription",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sub = await getMySubscription(req.user.userId);
    ok(res, sub);
  })
);
var webUpgradeSchema = import_zod3.z.object({
  productKey: import_zod3.z.enum(["WEB_MONTHLY", "WEB_YEARLY"])
});
router13.post(
  "/subscription/web",
  requireAuth,
  validate(webUpgradeSchema),
  asyncHandler(async (req, res) => {
    const sub = await upgradeWeb(req.user.userId, req.body.productKey);
    ok(res, sub);
  })
);
var androidPurchaseSchema = import_zod3.z.object({
  productId: import_zod3.z.string(),
  purchaseToken: import_zod3.z.string().min(5),
  orderId: import_zod3.z.string().optional()
});
router13.post(
  "/subscription/android",
  requireAuth,
  validate(androidPurchaseSchema),
  asyncHandler(async (req, res) => {
    const { verifyPlayPurchase: verifyPlayPurchase2 } = await Promise.resolve().then(() => (init_playBillingVerifier(), playBillingVerifier_exports));
    const verification = await verifyPlayPurchase2(req.body);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PURCHASE", message: verification.reason || "Purchase not valid" }
      });
    }
    const sub = await activateAndroidPurchase({
      userId: req.user.userId,
      ...req.body
    });
    ok(res, sub);
  })
);
router13.post(
  "/subscription/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sub = await cancelSubscription(req.user.userId);
    ok(res, sub);
  })
);
router13.post(
  "/subscription/restore",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await restorePurchases(req.user.userId);
    ok(res, result);
  })
);
router13.post(
  "/boost",
  requireAuth,
  asyncHandler(async (req, res) => {
    const boost = await activateBoost(req.user.userId);
    ok(res, boost);
  })
);
router13.get(
  "/profile-views",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listProfileViewers(req.user.userId);
    ok(res, result);
  })
);
var billing_routes_default = router13;

// src/index.ts
var app = (0, import_express14.default)();
app.set("trust proxy", 1);
app.use((0, import_helmet.default)());
app.use(
  (0, import_cors.default)({
    origin: env.CLIENT_URL === "*" ? true : env.CLIENT_URL,
    credentials: true
  })
);
app.use(import_express14.default.json({ limit: "1mb" }));
app.use((0, import_cookie_parser.default)(env.COOKIE_SECRET));
var globalLimiter = (0, import_express_rate_limit.default)({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);
var authLimiter = (0, import_express_rate_limit.default)({
  windowMs: 15 * 60 * 1e3,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});
app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() } });
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth", auth_routes_default);
app.use("/api/profile", profile_routes_default);
app.use("/api/users", users_routes_default);
app.use("/api/skills", skills_routes_default);
app.use("/api/matches", matches_routes_default);
app.use("/api/exchange-requests", exchangeRequests_routes_default);
app.use("/api/exchanges", exchanges_routes_default);
app.use("/api/messages", messages_routes_default);
app.use("/api/sessions", sessions_routes_default);
app.use("/api/notifications", notifications_routes_default);
app.use("/api", safety_routes_default);
app.use("/api", billing_routes_default);
app.use("/api/admin", admin_routes_default);
var publicDir = import_path2.default.resolve(__dirname, "../../client/dist");
if (import_fs2.default.existsSync(import_path2.default.join(publicDir, "index.html"))) {
  app.use(import_express14.default.static(publicDir, { maxAge: "7d", index: "index.html" }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
    res.sendFile(import_path2.default.join(publicDir, "index.html"));
  });
  console.log(`\u{1F310} Serving web client from ${publicDir}`);
} else {
  console.log(`\u{1F310} No web client build found at ${publicDir} \u2014 API only.`);
}
app.use(notFoundHandler);
app.use(errorHandler);
var httpServer = import_http.default.createServer(app);
initSocket(httpServer);
async function autoSeedIfEmpty() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log(`\u{1F331} Database already seeded (${userCount} users). Skipping.`);
      return;
    }
    console.log("\u{1F331} Empty database detected. Run `npm run seed` once to populate demo data.");
    console.log("   (Render Shell tab: cd server && npm run seed)");
  } catch (e) {
    console.error("\u26A0\uFE0F  DB check failed (non-fatal):", e?.message || e);
  }
}
httpServer.listen(env.PORT, () => {
  console.log(`\u{1F680} SkillSwap API running on http://localhost:${env.PORT}`);
  console.log(`\u{1F4E6} Environment: ${env.NODE_ENV}`);
  autoSeedIfEmpty();
});
var index_default = app;
