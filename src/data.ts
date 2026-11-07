export type Team = {
  id: string;
  name: string;
  short_name: string;
  score: number;
  logo_url?: string | null;
};

export type Competition = {
  id: string;
  title: string;
  short_title: string;
  tagline: string;
  year: number;
  primary_color: string;
  secondary_color?: string | null;
  logo_url?: string | null;
  organizer_logo_url?: string | null;
  organizer?: string | null;
  slogan?: string | null;
  venue?: string | null;
  starts_at?: string | null;
};

export type Division = { id: string; name: string; competition_id: string };

export type Group = {
  id: string;
  name: string;
  category_id: string;
  stage: string;
  status: string;
  competition_id: string;
  scoring_snapshot?: Record<string, unknown> | null;
  results_approved?: boolean;
  capacity?: number | null;
};

export type SchoolRecord = {
  id: string;
  name: string;
  short_name: string;
  logo_url?: string | null;
  competition_id?: string | null;
  category_id?: string | null;
  city?: string | null;
  active?: boolean;
};

export type ScoringRules = {
  id: string;
  competition_id: string;
  category_id?: string | null;
  score_step: number;
  correct_points?: number;
  incorrect_penalty?: number;
  max_adjustment: number;
  opening_group_size: number;
  opening_qualify: number;
  semifinal_size: number;
  semifinal_qualify: number;
  final_size: number;
  tie_break_rule: string;
};

export type ScheduleEvent = {
  id: string;
  competition_id: string;
  category_id?: string | null;
  group_id?: string | null;
  title: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  sort_order: number;
};

export type StaffMember = {
  user_id: string;
  role: 'super_admin' | 'admin' | 'scorekeeper';
  email?: string;
};

export const DEFAULT_LOGO = `${import.meta.env.BASE_URL}imj-mark.png`;

export const demoCompetition: Competition = {
  id: 'demo',
  title: 'IMJ Group Annual Schools Quiz Competition',
  short_title: 'IMJ Schools Quiz',
  tagline: 'Celebrating Knowledge. Inspiring Excellence.',
  year: 2026,
  primary_color: '#3D93CF',
  secondary_color: '#0F2040',
  logo_url: DEFAULT_LOGO,
  organizer: 'IMJ Group',
  slogan: 'Celebrating Knowledge. Inspiring Excellence.',
  venue: 'Kaduna, Nigeria',
};

export const demoCategories: Division[] = [
  { id: 'primary', name: 'Primary Schools', competition_id: 'demo' },
  { id: 'secondary', name: 'Secondary Schools', competition_id: 'demo' },
];

export const demoGroups: Group[] = [
  { id: 'a', name: 'Group A', category_id: 'secondary', competition_id: 'demo', stage: 'Opening Round', status: 'live' },
  { id: 'b', name: 'Group B', category_id: 'secondary', competition_id: 'demo', stage: 'Opening Round', status: 'scheduled' },
  { id: 'c', name: 'Group A', category_id: 'primary', competition_id: 'demo', stage: 'Opening Round', status: 'scheduled' },
];

export const demoTeams: Record<string, Team[]> = {
  a: [
    { id: '1', name: 'Greenfield International Academy', short_name: 'Greenfield Academy', score: 85 },
    { id: '2', name: 'Kaduna Capital School', short_name: 'Kaduna Capital', score: 80 },
    { id: '3', name: 'Bright Future College', short_name: 'Bright Future', score: 75 },
    { id: '4', name: 'Royal Scholars Academy', short_name: 'Royal Scholars', score: 70 },
    { id: '5', name: 'Al-Hikmah Model School', short_name: 'Al-Hikmah', score: 65 },
    { id: '6', name: 'Excellence International School', short_name: 'Excellence Int’l', score: 55 },
    { id: '7', name: 'Unity Comprehensive School', short_name: 'Unity School', score: 50 },
    { id: '8', name: 'Victory Model College', short_name: 'Victory College', score: 45 },
  ],
  b: [
    { id: '9', name: 'Cedar Hills Academy', short_name: 'Cedar Hills', score: 0 },
    { id: '10', name: 'New Era College', short_name: 'New Era', score: 0 },
    { id: '11', name: 'Premier Schools', short_name: 'Premier', score: 0 },
    { id: '12', name: 'Crown Academy', short_name: 'Crown', score: 0 },
    { id: '13', name: 'Standard College', short_name: 'Standard', score: 0 },
    { id: '14', name: 'North Star School', short_name: 'North Star', score: 0 },
    { id: '15', name: 'Horizon Institute', short_name: 'Horizon', score: 0 },
    { id: '16', name: 'Golden Gate Academy', short_name: 'Golden Gate', score: 0 },
  ],
  c: [
    { id: '17', name: 'Sunshine Primary School', short_name: 'Sunshine', score: 0 },
    { id: '18', name: 'Little Stars Academy', short_name: 'Little Stars', score: 0 },
  ],
};

export const demoRules: ScoringRules = {
  id: 'demo-rules',
  competition_id: 'demo',
  score_step: 5,
  correct_points: 5,
  incorrect_penalty: 0,
  max_adjustment: 100,
  opening_group_size: 8,
  opening_qualify: 5,
  semifinal_size: 6,
  semifinal_qualify: 4,
  final_size: 4,
  tie_break_rule: 'points_then_name',
};

export const sorted = (teams: Team[]) =>
  [...teams].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

/** Opening groups × qualify must equal semifinal size; semifinal qualify must equal final size. */
export function validateProgressionMath(rules: ScoringRules, openingGroupCount: number): string[] {
  const errors: string[] = [];
  const openQualifiers = openingGroupCount * rules.opening_qualify;
  if (openQualifiers !== rules.semifinal_size) {
    errors.push(
      `Opening progression invalid: ${openingGroupCount} groups × ${rules.opening_qualify} qualifiers = ${openQualifiers}, but semifinal size is ${rules.semifinal_size}.`,
    );
  }
  if (rules.semifinal_qualify !== rules.final_size) {
    errors.push(
      `Semifinal progression invalid: ${rules.semifinal_qualify} qualifiers must equal final size ${rules.final_size}.`,
    );
  }
  if (rules.opening_qualify >= rules.opening_group_size) {
    errors.push('Opening qualify count must be less than opening group size.');
  }
  if (rules.semifinal_qualify >= rules.semifinal_size) {
    errors.push('Semifinal qualify count must be less than semifinal size.');
  }
  return errors;
}

export function qualificationQuota(teamCount: number, rules?: ScoringRules | null, stage?: string): number {
  if (rules) {
    if (stage === 'Semifinal') return rules.semifinal_qualify;
    if (stage === 'Final') return Math.min(3, rules.final_size);
    if (stage === 'Opening Round') return rules.opening_qualify;
  }
  if (teamCount >= 8) return 5;
  if (teamCount === 6) return 4;
  return Math.min(teamCount, 4);
}
