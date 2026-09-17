"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userSearchSchema = exports.adminUpdateUserSchema = exports.updateSkillSchema = exports.createSkillSchema = exports.createReportSchema = exports.createReviewSchema = exports.createMessageSchema = exports.updateSessionSchema = exports.createSessionSchema = exports.createExchangeRequestSchema = exports.matchQuerySchema = exports.addUserSkillSchema = exports.changePasswordSchema = exports.updatePasswordSchema = exports.updateProfileSchema = exports.avatarUrlSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.signupSchema = void 0;
const zod_1 = require("zod");
// ============ Auth ============
exports.signupSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(255),
    password: zod_1.z.string().min(8).max(100),
    displayName: zod_1.z.string().min(2).max(80),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(10),
    password: zod_1.z.string().min(8).max(100),
});
// ============ Profile ============
// avatarUrl accepts either a normal http(s) image URL or a data URL (client
// downscales uploaded photos to a small JPEG before sending). Cap length so a
// single profile can't bloat the database.
exports.avatarUrlSchema = zod_1.z
    .preprocess((v) => (v === '' ? null : v), zod_1.z
    .string()
    .max(2_000_000)
    .refine((v) => v.startsWith('data:image/') || /^https?:\/\/.+/i.test(v), { message: 'Must be an image URL or data URL' })
    .nullable())
    .optional();
exports.updateProfileSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(2).max(80).optional(),
    university: zod_1.z.string().max(200).nullable().optional(),
    department: zod_1.z.string().max(200).nullable().optional(),
    yearLevel: zod_1.z.string().max(50).nullable().optional(),
    bio: zod_1.z.string().max(1000).nullable().optional(),
    avatarUrl: exports.avatarUrlSchema,
    learningFormat: zod_1.z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
    avatarFrame: zod_1.z.enum(['default', 'frame_0', 'frame_1', 'frame_2', 'frame_3', 'frame_4', 'frame_5', 'frame_6', 'frame_7', 'frame_8', 'frame_9', 'frame_10', 'frame_11']).optional(),
    bannerStyle: zod_1.z.enum(['cream', 'purple', 'blue', 'teal', 'orange', 'pink', 'gold', 'indigo', 'green']).optional(),
    // Empty selects come in as "" from the web/APK forms; treat them as "not set"
    // instead of failing the entire profile save (which made saved fields vanish).
    occupation: zod_1.z
        .preprocess((v) => (v === '' ? null : v), zod_1.z.enum(['student', 'employed', 'self_employed', 'unemployed', 'other']).nullable())
        .optional(),
    jobTitle: zod_1.z.string().max(100).nullable().optional(),
    company: zod_1.z.string().max(150).nullable().optional(),
    gender: zod_1.z
        .preprocess((v) => (v === '' ? null : v), zod_1.z.enum(['male', 'female', 'unspecified']).nullable())
        .optional(),
    age: zod_1.z
        .preprocess((v) => (v === '' || v === null ? null : typeof v === 'number' ? v : undefined), zod_1.z.number().int().min(13).max(120).nullable())
        .optional(),
    availabilities: zod_1.z
        .array(zod_1.z.object({
        weekday: zod_1.z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
        timeOfDay: zod_1.z.enum(['MORNING', 'AFTERNOON', 'EVENING']),
    }))
        .optional(),
});
exports.updatePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(100),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(100),
});
// ============ Skills ============
exports.addUserSkillSchema = zod_1.z.object({
    skillId: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['TEACH', 'WANT']),
    proficiency: zod_1.z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).default('INTERMEDIATE'),
});
// ============ Matches ============
exports.matchQuerySchema = zod_1.z.object({
    minScore: zod_1.z.coerce.number().int().min(0).max(100).default(40),
    skillId: zod_1.z.string().uuid().optional(),
    university: zod_1.z.string().optional(),
    format: zod_1.z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
// ============ Exchange requests ============
exports.createExchangeRequestSchema = zod_1.z.object({
    receiverId: zod_1.z.string().uuid(),
    offeredSkillId: zod_1.z.string().uuid(),
    requestedSkillId: zod_1.z.string().uuid(),
    message: zod_1.z.string().min(10).max(1000),
});
// ============ Sessions ============
exports.createSessionSchema = zod_1.z.object({
    title: zod_1.z.string().min(2).max(150),
    scheduledAt: zod_1.z.string().datetime(),
    durationMinutes: zod_1.z.number().int().min(15).max(480),
    format: zod_1.z.enum(['ONLINE', 'IN_PERSON']),
    meetingLink: zod_1.z.string().url().max(500).optional().nullable(),
    location: zod_1.z.string().max(300).optional().nullable(),
    notes: zod_1.z.string().max(2000).optional().nullable(),
});
exports.updateSessionSchema = exports.createSessionSchema.partial();
// ============ Messages ============
exports.createMessageSchema = zod_1.z.object({
    body: zod_1.z.string().min(1).max(2_000_000),
    type: zod_1.z.enum(['TEXT', 'IMAGE', 'STICKER']).default('TEXT'),
    caption: zod_1.z
        .string()
        .trim()
        .max(2000)
        .transform((v) => (v.length > 0 ? v : null))
        .optional()
        .nullable(),
});
// ============ Reviews ============
exports.createReviewSchema = zod_1.z.object({
    rating: zod_1.z.number().int().min(1).max(5),
    comment: zod_1.z.string().max(2000).optional().nullable(),
});
// ============ Reports ============
exports.createReportSchema = zod_1.z.object({
    reportedUserId: zod_1.z.string().uuid(),
    reason: zod_1.z.string().min(2).max(100),
    description: zod_1.z.string().min(10).max(2000),
});
// ============ Admin ============
exports.createSkillSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(80),
    category: zod_1.z.string().min(2).max(50),
    description: zod_1.z.string().max(500).optional().nullable(),
});
exports.updateSkillSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(80).optional(),
    category: zod_1.z.string().min(2).max(50).optional(),
    description: zod_1.z.string().max(500).optional().nullable(),
    isActive: zod_1.z.boolean().optional(),
});
exports.adminUpdateUserSchema = zod_1.z.object({
    isActive: zod_1.z.boolean().optional(),
    isAdmin: zod_1.z.boolean().optional(),
});
// ============ User search ============
exports.userSearchSchema = zod_1.z.object({
    q: zod_1.z.string().optional(),
    skillId: zod_1.z.string().uuid().optional(),
    university: zod_1.z.string().optional(),
    format: zod_1.z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(50).default(20),
    sort: zod_1.z.enum(['newest', 'rating', 'completed']).default('newest'),
});
//# sourceMappingURL=schemas.js.map