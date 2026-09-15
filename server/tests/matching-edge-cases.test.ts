import { calculateMatchScore, shouldIncludeInMatches } from '../src/services/matching.service';

const skillPython = { id: 'skill-python', name: 'Python', category: 'Technology' };
const skillFigma = { id: 'skill-figma', name: 'Figma', category: 'Design' };

describe('Matching exclusions', () => {
  const activeUser = {
    id: 'B',
    isActive: true,
    profile: null,
    teachingSkills: [skillFigma],
    wantedSkills: [skillPython],
  };

  it('excludes the viewer (themselves)', () => {
    expect(shouldIncludeInMatches('A', { ...activeUser, id: 'A' }, false, false)).toBe(false);
  });

  it('excludes inactive users', () => {
    expect(
      shouldIncludeInMatches('A', { ...activeUser, id: 'B', isActive: false }, false, false)
    ).toBe(false);
  });

  it('excludes blocked users (A blocked B)', () => {
    expect(shouldIncludeInMatches('A', activeUser, true, false)).toBe(false);
  });

  it('excludes blocked users (B blocked A)', () => {
    expect(shouldIncludeInMatches('A', activeUser, false, true)).toBe(false);
  });

  it('includes active non-blocked users', () => {
    expect(shouldIncludeInMatches('A', activeUser, false, false)).toBe(true);
  });
});