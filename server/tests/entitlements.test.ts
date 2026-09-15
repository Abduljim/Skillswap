import {
  LIMITS,
  limitsFor,
  type Tier,
} from '../src/services/entitlements.service';

describe('Entitlements / tier limits', () => {
  it('FREE caps pending requests at 3', () => {
    expect(LIMITS.FREE.activeExchangeRequests).toBe(3);
    expect(LIMITS.FREE.exchanges).toBe(5);
  });

  it('PRO is unlimited', () => {
    expect(LIMITS.PRO.activeExchangeRequests).toBe(Infinity);
    expect(LIMITS.PRO.exchanges).toBe(Infinity);
  });

  it('PRO has visibility/boost/insights perks', () => {
    expect(LIMITS.PRO.profileViewsCanSee).toBe(true);
    expect(LIMITS.PRO.boost).toBe(true);
    expect(LIMITS.PRO.priorityInMatches).toBe(true);
    expect(LIMITS.PRO.proBadge).toBe(true);
  });

  it('FREE does not have pro perks', () => {
    expect(LIMITS.FREE.profileViewsCanSee).toBe(false);
    expect(LIMITS.FREE.boost).toBe(false);
    expect(LIMITS.FREE.priorityInMatches).toBe(false);
    expect(LIMITS.FREE.proBadge).toBe(false);
  });

  it('limitsFor returns the right map per tier', () => {
    expect(limitsFor('FREE' as Tier).activeExchangeRequests).toBe(3);
    expect(limitsFor('PRO' as Tier).activeExchangeRequests).toBe(Infinity);
  });
});