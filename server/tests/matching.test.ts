import { calculateMatchScore, matchCategory, MATCH_THRESHOLDS } from '../src/services/matching.service';

const skillPython = { id: 'skill-python', name: 'Python', category: 'Technology' };
const skillFigma = { id: 'skill-figma', name: 'Figma', category: 'Design' };
const skillPhoto = { id: 'skill-photo', name: 'Photography', category: 'Creative' };

describe('Matching Engine', () => {
  describe('calculateMatchScore', () => {
    it('returns 100 for a perfect reciprocal match with shared university, format, availability', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: {
          university: 'UNILAG',
          learningFormat: 'EITHER' as const,
          availabilities: [{ weekday: 'MONDAY' as const, timeOfDay: 'EVENING' as const }],
        },
        teachingSkills: [skillPython],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: {
          university: 'UNILAG',
          learningFormat: 'EITHER' as const,
          availabilities: [{ weekday: 'MONDAY' as const, timeOfDay: 'EVENING' as const }],
        },
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      expect(result.score).toBe(100);
      expect(result.matchedSkills.theyCanTeachMe).toEqual([skillFigma]);
      expect(result.matchedSkills.iCanTeachThem).toEqual([skillPython]);
    });

    it('returns 50 when user B teaches a skill A wants but A teaches nothing B wants', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: null,
        teachingSkills: [],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: null,
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      expect(result.score).toBe(50);
    });

    it('returns 30 when user A teaches something B wants but B teaches nothing A wants', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: null,
        teachingSkills: [skillPython],
        wantedSkills: [],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: null,
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      expect(result.score).toBe(30);
    });

    it('adds 10 for same university', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: {
          university: 'UNILAG',
          learningFormat: 'ONLINE' as const,
          availabilities: [],
        },
        teachingSkills: [skillPython],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: {
          university: 'unilag', // case-insensitive
          learningFormat: 'ONLINE' as const,
          availabilities: [],
        },
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      // 50 + 30 + 10 + 5 = 95
      expect(result.score).toBe(95);
    });

    it('adds 5 for compatible format when both EITHER', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: {
          university: null,
          learningFormat: 'EITHER' as const,
          availabilities: [],
        },
        teachingSkills: [skillPython],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: {
          university: null,
          learningFormat: 'IN_PERSON' as const,
          availabilities: [],
        },
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      // 50 + 30 + 0 (no uni) + 5 (EITHER is compatible) + 0 (no avail) = 85
      expect(result.score).toBe(85);
    });

    it('does NOT add format bonus when ONLINE vs IN_PERSON', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: {
          university: null,
          learningFormat: 'ONLINE' as const,
          availabilities: [],
        },
        teachingSkills: [skillPython],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: {
          university: null,
          learningFormat: 'IN_PERSON' as const,
          availabilities: [],
        },
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      // 50 + 30 + 0 + 0 + 0 = 80
      expect(result.score).toBe(80);
    });

    it('adds 5 for compatible availability', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: {
          university: null,
          learningFormat: 'ONLINE' as const,
          availabilities: [{ weekday: 'TUESDAY' as const, timeOfDay: 'AFTERNOON' as const }],
        },
        teachingSkills: [skillPython],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: {
          university: null,
          learningFormat: 'ONLINE' as const,
          availabilities: [{ weekday: 'TUESDAY' as const, timeOfDay: 'AFTERNOON' as const }],
        },
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      // 50 + 30 + 0 + 5 (ONLINE+ONLINE) + 5 (avail) = 90
      expect(result.score).toBe(90);
    });

    it('caps score at 100', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: {
          university: 'UNILAG',
          learningFormat: 'EITHER' as const,
          availabilities: [{ weekday: 'MONDAY' as const, timeOfDay: 'EVENING' as const }],
        },
        teachingSkills: [skillPython, skillPhoto],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: {
          university: 'UNILAG',
          learningFormat: 'EITHER' as const,
          availabilities: [{ weekday: 'MONDAY' as const, timeOfDay: 'EVENING' as const }],
        },
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython, skillPhoto],
      };
      const result = calculateMatchScore(userA, userB);
      expect(result.score).toBe(100);
    });

    it('returns 0 when no overlap at all', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: null,
        teachingSkills: [skillPython],
        wantedSkills: [],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: null,
        teachingSkills: [skillFigma],
        wantedSkills: [],
      };
      const result = calculateMatchScore(userA, userB);
      expect(result.score).toBe(0);
    });

    it('produces reasons explaining the match', () => {
      const userA = {
        id: 'A',
        isActive: true,
        profile: {
          university: 'UNILAG',
          learningFormat: 'EITHER' as const,
          availabilities: [],
        },
        teachingSkills: [skillPython],
        wantedSkills: [skillFigma],
      };
      const userB = {
        id: 'B',
        isActive: true,
        profile: {
          university: 'UNILAG',
          learningFormat: 'EITHER' as const,
          availabilities: [],
        },
        teachingSkills: [skillFigma],
        wantedSkills: [skillPython],
      };
      const result = calculateMatchScore(userA, userB);
      expect(result.reasons.length).toBeGreaterThan(2);
      expect(result.reasons.some((r) => r.includes('Python'))).toBe(true);
      expect(result.reasons.some((r) => r.includes('Figma'))).toBe(true);
    });
  });

  describe('matchCategory', () => {
    it('classifies 80-100 as PERFECT', () => {
      expect(matchCategory(95)).toBe('PERFECT');
      expect(matchCategory(80)).toBe('PERFECT');
      expect(matchCategory(100)).toBe('PERFECT');
    });
    it('classifies 60-79 as STRONG', () => {
      expect(matchCategory(60)).toBe('STRONG');
      expect(matchCategory(79)).toBe('STRONG');
    });
    it('classifies 40-59 as POTENTIAL', () => {
      expect(matchCategory(40)).toBe('POTENTIAL');
      expect(matchCategory(59)).toBe('POTENTIAL');
    });
    it('classifies below 40 as NONE', () => {
      expect(matchCategory(0)).toBe('NONE');
      expect(matchCategory(39)).toBe('NONE');
    });
  });

  describe('MATCH_THRESHOLDS', () => {
    it('matches spec', () => {
      expect(MATCH_THRESHOLDS.PERFECT).toBe(80);
      expect(MATCH_THRESHOLDS.STRONG).toBe(60);
      expect(MATCH_THRESHOLDS.POTENTIAL).toBe(40);
    });
  });
});