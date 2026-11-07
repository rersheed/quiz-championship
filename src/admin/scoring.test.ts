import { describe, expect, it } from 'vitest';
import { filterBonusesForContext, sourceLabel, type BonusType } from './scoring';
import { validateProgressionMath, type ScoringRules } from '../data';

const rules: ScoringRules = {
  id: 'r1',
  competition_id: 'c1',
  score_step: 5,
  correct_points: 10,
  incorrect_penalty: 2,
  max_adjustment: 100,
  opening_group_size: 8,
  opening_qualify: 3,
  semifinal_size: 6,
  semifinal_qualify: 4,
  final_size: 4,
  tie_break_rule: 'points_then_name',
};

const bonuses: BonusType[] = [
  { id: '1', competition_id: 'c1', name: 'Bonus Question', points: 2, active: true, sort_order: 1 },
  { id: '2', competition_id: 'c1', category_id: 'cat-a', name: 'Speed', points: 3, active: true, sort_order: 2 },
  { id: '3', competition_id: 'c1', name: 'Old', points: 5, active: false, sort_order: 3 },
  { id: '4', competition_id: 'other', name: 'Other', points: 1, active: true, sort_order: 1 },
];

describe('filterBonusesForContext', () => {
  it('returns active competition bonuses and category matches', () => {
    const result = filterBonusesForContext(bonuses, 'c1', 'cat-a');
    expect(result.map((b) => b.id)).toEqual(['1', '2']);
  });

  it('hides category-scoped bonuses for other categories', () => {
    const result = filterBonusesForContext(bonuses, 'c1', 'cat-b');
    expect(result.map((b) => b.id)).toEqual(['1']);
  });
});

describe('validateProgressionMath', () => {
  it('accepts 2 groups × 3 = 6 semifinal', () => {
    expect(validateProgressionMath(rules, 2)).toEqual([]);
  });

  it('rejects mismatched opening qualifier product', () => {
    const errors = validateProgressionMath(rules, 1);
    expect(errors[0]).toMatch(/Opening progression invalid/);
  });
});

describe('sourceLabel', () => {
  it('labels known sources', () => {
    expect(sourceLabel('category_override')).toBe('Category override');
    expect(sourceLabel('competition_default')).toBe('Competition default');
  });
});
