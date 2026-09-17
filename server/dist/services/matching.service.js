"use strict";
/**
 * Matching engine — purely deterministic.
 *
 * Scoring rules (max 100):
 *  +50  User B teaches ≥1 skill User A wants.
 *  +30  User A teaches ≥1 skill User B wants.
 *  +10  Same university.
 *   +5  Compatible learning format.
 *   +5  Compatible availability (overlapping weekday+time slot).
 *
 * Excludes:
 *   - user A themselves
 *   - inactive users
 *   - users blocked by either party
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MATCH_THRESHOLDS = void 0;
exports.calculateMatchScore = calculateMatchScore;
exports.shouldIncludeInMatches = shouldIncludeInMatches;
exports.matchCategory = matchCategory;
const SCORE = {
    TEACHES_I_WANT: 50,
    I_TEACH_THEY_WANT: 30,
    SAME_UNIVERSITY: 10,
    COMPATIBLE_FORMAT: 5,
    COMPATIBLE_AVAILABILITY: 5,
};
exports.MATCH_THRESHOLDS = {
    PERFECT: 80,
    STRONG: 60,
    POTENTIAL: 40,
};
function compatibleFormat(a, b) {
    if (!a || !b)
        return false;
    if (a === 'EITHER' || b === 'EITHER')
        return true;
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
        if (teaching)
            theyCanTeachMe.push(teaching);
    }
    for (const w of userB.wantedSkills) {
        const teaching = userA.teachingSkills.find((t) => t.id === w.id);
        if (teaching)
            iCanTeachThem.push(teaching);
    }
    let score = 0;
    const reasons = [];
    if (theyCanTeachMe.length > 0) {
        score += SCORE.TEACHES_I_WANT;
        reasons.push(`They teach ${theyCanTeachMe.map((s) => s.name).join(', ')} — what you want`);
    }
    if (iCanTeachThem.length > 0) {
        score += SCORE.I_TEACH_THEY_WANT;
        reasons.push(`You teach ${iCanTeachThem.map((s) => s.name).join(', ')} — what they want`);
    }
    if (userA.profile?.university &&
        userB.profile?.university &&
        userA.profile.university.toLowerCase() === userB.profile.university.toLowerCase()) {
        score += SCORE.SAME_UNIVERSITY;
        reasons.push(`Same university: ${userB.profile.university}`);
    }
    if (compatibleFormat(userA.profile?.learningFormat ?? null, userB.profile?.learningFormat ?? null)) {
        score += SCORE.COMPATIBLE_FORMAT;
        reasons.push('Compatible learning format');
    }
    if (userA.profile?.availabilities &&
        userB.profile?.availabilities &&
        compatibleAvailability(userA.profile.availabilities, userB.profile.availabilities)) {
        score += SCORE.COMPATIBLE_AVAILABILITY;
        reasons.push('Compatible availability');
    }
    // Cap at 100
    if (score > 100)
        score = 100;
    return {
        userId: userB.id,
        score,
        matchedSkills: {
            theyCanTeachMe,
            iCanTeachThem,
        },
        reasons,
    };
}
function shouldIncludeInMatches(viewerId, candidate, aBlockedB, bBlockedA) {
    if (candidate.id === viewerId)
        return false;
    if (!candidate.isActive)
        return false;
    if (aBlockedB || bBlockedA)
        return false;
    return true;
}
function matchCategory(score) {
    if (score >= exports.MATCH_THRESHOLDS.PERFECT)
        return 'PERFECT';
    if (score >= exports.MATCH_THRESHOLDS.STRONG)
        return 'STRONG';
    if (score >= exports.MATCH_THRESHOLDS.POTENTIAL)
        return 'POTENTIAL';
    return 'NONE';
}
//# sourceMappingURL=matching.service.js.map