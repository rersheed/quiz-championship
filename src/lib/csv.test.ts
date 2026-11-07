import { describe, expect, it } from 'vitest';
import { parseSchoolCsv, planStageMath } from './csv';

describe('parseSchoolCsv', () => {
  it('parses quoted commas and detects duplicates', () => {
    const csv = `name,short_name,city\n"Greenfield, Academy",Greenfield,Kaduna\n"Greenfield, Academy",GF,Zaria`;
    const { rows, errors } = parseSchoolCsv(csv);
    expect(rows[0].name).toBe('Greenfield, Academy');
    expect(rows).toHaveLength(2);
    expect(errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('reports empty files', () => {
    expect(parseSchoolCsv('   ').errors[0]).toMatch(/empty/i);
  });
});

describe('planStageMath', () => {
  it('validates 16 teams into groups of 8 qualify 5', () => {
    const plan = planStageMath(16, 8, 5);
    expect(plan.valid).toBe(true);
    expect(plan.groupsNeeded).toBe(2);
    expect(plan.advancing).toBe(10);
  });

  it('rejects leftover teams', () => {
    expect(planStageMath(50, 8, 5).valid).toBe(false);
  });

  it('shows path from 50 to smaller stages', () => {
    // 50 cannot fill equal 8s; 48 can (6×8) → 30 advance with qualify 5
    expect(planStageMath(48, 8, 5).advancing).toBe(30);
    expect(planStageMath(30, 6, 2).advancing).toBe(10);
    expect(planStageMath(10, 5, 3).advancing).toBe(6);
  });
});
