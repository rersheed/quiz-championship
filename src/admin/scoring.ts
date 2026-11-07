export type ScoringActionType = 'correct' | 'incorrect' | 'bonus' | 'correction';

export type BonusType = {
  id: string;
  competition_id: string;
  category_id?: string | null;
  stage?: string | null;
  name: string;
  points: number;
  description?: string | null;
  active: boolean;
  sort_order: number;
};

export type EffectiveScoringConfig = {
  correct_points: number;
  incorrect_penalty: number;
  score_step: number;
  max_adjustment: number;
  source: 'competition_default' | 'category_override' | 'fallback' | string;
};

export type ScoreEvent = {
  id: number;
  group_id: string;
  team_id: string;
  delta: number;
  before_points: number;
  after_points: number;
  action_type?: string | null;
  action_label?: string | null;
  configured_points?: number | null;
  created_at: string;
};

export function filterBonusesForContext(
  bonuses: BonusType[],
  competitionId: string,
  categoryId?: string | null,
  stage?: string | null,
): BonusType[] {
  return bonuses
    .filter((b) => b.competition_id === competitionId && b.active)
    .filter((b) => !b.category_id || b.category_id === categoryId)
    .filter((b) => !b.stage || b.stage === stage)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function sourceLabel(source: string): string {
  if (source === 'category_override') return 'Category override';
  if (source === 'competition_default') return 'Competition default';
  if (source === 'fallback') return 'Built-in fallback';
  return source;
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
