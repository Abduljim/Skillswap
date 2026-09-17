"use strict";
// Badge system — badges are derived from tier + on-profile activity so they are
// always live and need no extra tables.
Object.defineProperty(exports, "__esModule", { value: true });
exports.BADGES = void 0;
exports.computeBadges = computeBadges;
exports.BADGES = {
    EARLY_BIRD: {
        code: 'EARLY_BIRD',
        label: 'Early Adopter',
        icon: 'Bird',
        description: 'One of the first members',
        tier: 'BASIC',
    },
    SWAPPER: {
        code: 'SWAPPER',
        label: 'Connector',
        icon: 'Repeat',
        description: 'Completed an exchange',
        tier: 'BASIC',
    },
    PRO_CROWN: {
        code: 'PRO_CROWN',
        label: 'Pro Member',
        icon: 'Crown',
        description: 'Pro membership active',
        tier: 'PRO',
    },
    TOP_TRADER: {
        code: 'TOP_TRADER',
        label: 'Skill Master',
        icon: 'Award',
        description: 'Active skill exchanger',
        tier: 'PRO',
    },
    DIAMOND: {
        code: 'DIAMOND',
        label: 'Supporter',
        icon: 'Gem',
        description: 'Premium supporter of SkillSwap',
        tier: 'PRO',
    },
};
function computeBadges(opts) {
    const badges = [];
    const joinedDays = opts.ageDays ?? 0;
    const completed = opts.completedExchanges ?? 0;
    if (joinedDays <= 60) {
        badges.push(exports.BADGES.EARLY_BIRD);
    }
    if (completed >= 1) {
        badges.push(exports.BADGES.SWAPPER);
    }
    if (opts.tier === 'PRO') {
        badges.push(exports.BADGES.PRO_CROWN, exports.BADGES.TOP_TRADER, exports.BADGES.DIAMOND);
    }
    return badges;
}
//# sourceMappingURL=badges.service.js.map