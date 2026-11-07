import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Award,
  Check,
  Eye,
  FileSpreadsheet,
  LockKeyhole,
  LogOut,
  Settings2,
  Trophy,
  Users,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateProgressionMath,
  type Competition,
  type Division,
  type Group,
  type SchoolRecord,
  type ScoringRules,
  type Team,
} from '../data';

type Props = {
  supabase: SupabaseClient | null;
  competition: Competition;
  setCompetition: React.Dispatch<React.SetStateAction<Competition>>;
  categories: Division[];
  setCategories: React.Dispatch<React.SetStateAction<Division[]>>;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  teams: Record<string, Team[]>;
  schools: SchoolRecord[];
  setSchools: React.Dispatch<React.SetStateAction<SchoolRecord[]>>;
  rules: ScoringRules;
  setRules: React.Dispatch<React.SetStateAction<ScoringRules>>;
  category: string;
  chooseCategory: (id: string) => void;
  groupId: string;
  setGroupId: (id: string) => void;
  currentGroup?: Group;
  currentTeams: Team[];
  user: string | null;
  authorized: boolean;
  role: string | null;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  authBusy: boolean;
  authenticate: (e: FormEvent) => Promise<void>;
  signOut: () => Promise<void>;
  updateScore: (team: Team, delta: number) => Promise<void>;
  finalize: () => Promise<void>;
  setSettingsOpen: (v: boolean) => void;
  setView: (v: 'home' | 'live' | 'schools' | 'admin' | 'display') => void;
  setNotice: (v: string) => void;
  refreshAll: () => Promise<void>;
};

type AdminTab = 'scoring' | 'schools' | 'groups' | 'rules' | 'tournament';

function parseCsv(text: string): { name: string; short_name: string; city?: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();
  const start = header.includes('name') ? 1 : 0;
  return lines.slice(start).map((line) => {
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    const name = parts[0] || 'Unnamed School';
    return { name, short_name: parts[1] || name.slice(0, 24), city: parts[2] || undefined };
  });
}

export default function AdminCentre(props: Props) {
  const {
    supabase,
    competition,
    categories,
    setCategories,
    groups,
    teams,
    schools,
    setSchools,
    rules,
    setRules,
    category,
    chooseCategory,
    currentGroup,
    setGroupId,
    currentTeams,
    user,
    authorized,
    role,
    email,
    setEmail,
    password,
    setPassword,
    authBusy,
    authenticate,
    signOut,
    updateScore,
    finalize,
    setSettingsOpen,
    setView,
    setNotice,
    refreshAll,
  } = props;

  const [tab, setTab] = useState<AdminTab>('scoring');
  const [schoolName, setSchoolName] = useState('');
  const [schoolShort, setSchoolShort] = useState('');
  const [schoolCity, setSchoolCity] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedGroups = groups.filter((g) => g.category_id === category);
  const openingGroups = selectedGroups.filter((g) => g.stage === 'Opening Round');
  const mathErrors = useMemo(
    () => validateProgressionMath(rules, Math.max(openingGroups.length, 1)),
    [rules, openingGroups.length],
  );
  const categorySchools = schools.filter(
    (s) => !s.category_id || s.category_id === category || !category,
  );
  const canAdmin = !supabase || (authorized && role !== 'scorekeeper');
  const canScore = !supabase || authorized;

  const registerSchool = async (e: FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;
    if (!supabase) {
      setSchools((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: schoolName,
          short_name: schoolShort || schoolName.slice(0, 24),
          city: schoolCity || null,
          category_id: category,
          competition_id: competition.id,
        },
      ]);
      setSchoolName('');
      setSchoolShort('');
      setSchoolCity('');
      setNotice('School added in demo mode.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('register_school', {
      p_competition_id: competition.id,
      p_category_id: category,
      p_name: schoolName.trim(),
      p_short_name: (schoolShort || schoolName).trim(),
      p_logo_url: null,
      p_city: schoolCity.trim() || null,
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setSchoolName('');
      setSchoolShort('');
      setSchoolCity('');
      setNotice('School registered.');
      await refreshAll();
    }
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      setNotice('No rows found in CSV.');
      return;
    }
    if (!supabase) {
      setSchools((prev) => [
        ...prev,
        ...rows.map((r) => ({
          id: crypto.randomUUID(),
          name: r.name,
          short_name: r.short_name,
          city: r.city || null,
          category_id: category,
          competition_id: competition.id,
        })),
      ]);
      setNotice(`Imported ${rows.length} schools in demo mode.`);
      return;
    }
    setBusy(true);
    let ok = 0;
    for (const row of rows) {
      const { error } = await supabase.rpc('register_school', {
        p_competition_id: competition.id,
        p_category_id: category,
        p_name: row.name,
        p_short_name: row.short_name,
        p_logo_url: null,
        p_city: row.city || null,
      });
      if (!error) ok += 1;
    }
    setBusy(false);
    setNotice(`Imported ${ok} of ${rows.length} schools.`);
    await refreshAll();
  };

  const deleteSchool = async (id: string) => {
    if (!supabase) {
      setSchools((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    const { error } = await supabase.from('schools').delete().eq('id', id);
    if (error) setNotice(error.message);
    else {
      setNotice('School deleted.');
      await refreshAll();
    }
  };

  const addCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    if (!supabase) {
      const id = categoryName.toLowerCase().replace(/\s+/g, '-');
      setCategories((prev) => [...prev, { id, name: categoryName.trim(), competition_id: competition.id }]);
      setCategoryName('');
      setNotice('Category added in demo mode.');
      return;
    }
    const { error } = await supabase.from('categories').insert({
      competition_id: competition.id,
      name: categoryName.trim(),
    });
    if (error) setNotice(error.message);
    else {
      setCategoryName('');
      setNotice('Category created.');
      await refreshAll();
    }
  };

  const allocateGroups = async () => {
    if (!supabase) {
      setNotice('Demo mode: connect Supabase to allocate groups.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('allocate_opening_groups', {
      p_competition_id: competition.id,
      p_category_id: category,
      p_group_size: rules.opening_group_size,
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(`Allocated ${data} opening group(s).`);
      await refreshAll();
    }
  };

  const setStatus = async (status: 'scheduled' | 'live' | 'final') => {
    if (!currentGroup) return;
    if (!supabase) {
      props.setGroups((g) => g.map((v) => (v.id === currentGroup.id ? { ...v, status } : v)));
      return;
    }
    const { error } = await supabase.rpc('set_group_status', {
      p_group_id: currentGroup.id,
      p_status: status,
    });
    if (error) setNotice(error.message);
    else {
      setNotice(`Group marked ${status}.`);
      await refreshAll();
    }
  };

  const saveRules = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setNotice('Rules updated in demo mode.');
      return;
    }
    const { error } = await supabase
      .from('scoring_rules')
      .update({
        score_step: rules.score_step,
        max_adjustment: rules.max_adjustment,
        opening_group_size: rules.opening_group_size,
        opening_qualify: rules.opening_qualify,
        semifinal_size: rules.semifinal_size,
        semifinal_qualify: rules.semifinal_qualify,
        final_size: rules.final_size,
        tie_break_rule: rules.tie_break_rule,
      })
      .eq('id', rules.id);
    if (error) setNotice(error.message);
    else setNotice('Scoring rules saved.');
  };

  const advance = async (kind: 'semi' | 'final') => {
    if (!supabase) {
      setNotice('Demo mode: tournament advancement requires Supabase.');
      return;
    }
    if (mathErrors.length && kind === 'semi') {
      setNotice(mathErrors[0]);
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc(
      kind === 'semi' ? 'advance_opening_to_semifinal' : 'advance_semifinal_to_final',
      { p_category_id: category },
    );
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(kind === 'semi' ? 'Semifinal created from validated qualifiers.' : 'Grand final created.');
      await refreshAll();
    }
  };

  if (!user && supabase) {
    return (
      <div className="auth-card">
        <div className="icon-bubble">
          <LockKeyhole />
        </div>
        <h2>Administrator sign in</h2>
        <p>Sign in with an authorized scorekeeper or administrator account.</p>
        <form onSubmit={authenticate}>
          <label>
            Email
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
          </label>
          <label>
            Password
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
          </label>
          <button className="primary-btn" disabled={authBusy}>
            {authBusy ? 'Signing in...' : 'Sign in'} <ArrowRight size={17} />
          </button>
        </form>
      </div>
    );
  }

  if (user && !authorized) {
    return (
      <div className="auth-card">
        <LockKeyhole size={32} />
        <h2>Administrator access required</h2>
        <p>
          You are signed in as {user}, but this account has not been added to the admins table by an authorized
          database owner.
        </p>
        <button className="outline-btn" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="admin-banner">
        <div>
          <span className="eyebrow light">{supabase ? 'AUTHORIZED OPERATIONS' : 'INTERACTIVE DEMONSTRATION'}</span>
          <h2>{supabase ? 'Competition management' : 'Explore the scoring control centre'}</h2>
          <p>
            {supabase
              ? 'Score securely, manage schools and groups, and advance rounds with mathematical validation.'
              : 'You can change scores and explore admin tools. Demo changes are not saved online.'}
          </p>
        </div>
        {user && (
          <button className="glass-btn" onClick={signOut}>
            <LogOut size={17} /> Sign out
          </button>
        )}
      </div>

      <div className="admin-tabs">
        {(
          [
            ['scoring', 'Scorekeeper'],
            ['schools', 'Schools'],
            ['groups', 'Groups'],
            ['rules', 'Rules'],
            ['tournament', 'Tournament'],
          ] as [AdminTab, string][]
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} type="button">
            {label}
          </button>
        ))}
      </div>

      {tab === 'scoring' && (
        <div className="admin-layout">
          <div className="control-panel">
            <h3>Scorekeeper panel</h3>
            <p>Choose a category and group to update scores.</p>
            <div className="selector-row admin-selectors">
              <label>
                Category
                <select value={category} onChange={(e) => chooseCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Group
                <select value={currentGroup?.id || ''} onChange={(e) => setGroupId(e.target.value)}>
                  {selectedGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {g.stage}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="score-list">
              {currentTeams.map((t, i) => (
                <div className="score-entry" key={t.id}>
                  <span className="score-index">{i + 1}</span>
                  <div className="score-name">
                    {t.short_name}
                    <small>{t.name}</small>
                  </div>
                  <div className="score-actions">
                    <button
                      aria-label={'Deduct from ' + t.name}
                      disabled={!canScore || currentGroup?.status === 'final'}
                      onClick={() => updateScore(t, -rules.score_step)}
                    >
                      −{rules.score_step}
                    </button>
                    <strong>{t.score}</strong>
                    <button
                      aria-label={'Add to ' + t.name}
                      disabled={!canScore || currentGroup?.status === 'final'}
                      onClick={() => updateScore(t, rules.score_step)}
                    >
                      +{rules.score_step}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="admin-actions-row">
              {canAdmin && (
                <>
                  <button className="outline-btn" disabled={!currentGroup || currentGroup.status === 'live'} onClick={() => setStatus('live')}>
                    Go live
                  </button>
                  <button className="finalize-btn" onClick={finalize} disabled={Boolean(supabase && currentGroup?.status === 'final')}>
                    <Award size={17} />
                    {currentGroup?.status === 'final' ? 'Results finalized' : 'Finalize group results'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="admin-aside">
            <div className="side-card">
              <h3>Round details</h3>
              <div className="detail-row">
                <span>Competition</span>
                <strong>{competition.year}</strong>
              </div>
              <div className="detail-row">
                <span>Stage</span>
                <strong>{currentGroup?.stage || '—'}</strong>
              </div>
              <div className="detail-row">
                <span>Teams</span>
                <strong>{currentTeams.length}</strong>
              </div>
              <div className="detail-row">
                <span>Qualification</span>
                <strong>Top {rules.opening_qualify}</strong>
              </div>
              <div className="detail-row">
                <span>Result status</span>
                <strong>{currentGroup?.status || '—'}</strong>
              </div>
            </div>
            <div className="side-card">
              <h3>Quick preview</h3>
              <p>See how spectators view the current group ranking.</p>
              <button className="outline-btn block" onClick={() => setView('live')}>
                <Eye size={17} /> Preview public leaderboard
              </button>
            </div>
            <div className="side-card">
              <h3>Competition branding</h3>
              <p>Change identity, logos, colours and tagline.</p>
              <button className="outline-btn block" onClick={() => setSettingsOpen(true)} disabled={!canAdmin && Boolean(supabase)}>
                <Settings2 size={17} /> Branding studio
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'schools' && canAdmin && (
        <div className="admin-panel-card">
          <div className="panel-head">
            <div>
              <h3>
                <Users size={18} /> School registration
              </h3>
              <p>Register schools per category. CSV columns: name, short_name, city.</p>
            </div>
            <label className="outline-btn small file-btn">
              <FileSpreadsheet size={16} /> Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importCsv(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <form className="inline-form" onSubmit={registerSchool}>
            <input required placeholder="School name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
            <input placeholder="Short name" value={schoolShort} onChange={(e) => setSchoolShort(e.target.value)} />
            <input placeholder="City" value={schoolCity} onChange={(e) => setSchoolCity(e.target.value)} />
            <button className="primary-btn" disabled={busy} type="submit">
              Add school
            </button>
          </form>
          <div className="school-admin-list">
            {categorySchools.map((s) => (
              <div className="school-admin-row" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.short_name}
                    {s.city ? ` · ${s.city}` : ''}
                  </small>
                </div>
                <button className="outline-btn small" type="button" onClick={() => deleteSchool(s.id)}>
                  Delete
                </button>
              </div>
            ))}
            {!categorySchools.length && <p className="empty-board">No schools registered for this category yet.</p>}
          </div>
        </div>
      )}

      {tab === 'groups' && canAdmin && (
        <div className="admin-panel-card">
          <div className="panel-head">
            <div>
              <h3>Categories & groups</h3>
              <p>Create categories and auto-allocate unassigned schools into opening groups of {rules.opening_group_size}.</p>
            </div>
            <button className="primary-btn" type="button" disabled={busy} onClick={allocateGroups}>
              Allocate opening groups
            </button>
          </div>
          <form className="inline-form" onSubmit={addCategory}>
            <input required placeholder="New category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
            <button className="outline-btn" type="submit">
              Add category
            </button>
          </form>
          <div className="group-admin-grid">
            {selectedGroups.map((g) => (
              <div className="group-admin-card" key={g.id}>
                <strong>
                  {g.name} · {g.stage}
                </strong>
                <span className={'round-status ' + (g.status === 'live' ? 'status-live' : '')}>{g.status}</span>
                <small>{(teams[g.id] || []).length} teams</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'rules' && canAdmin && (
        <div className="admin-panel-card">
          <h3>Configurable scoring & qualification rules</h3>
          <p>Rules are category-aware when configured. Defaults match the published championship format.</p>
          <form className="brand-form" onSubmit={saveRules}>
            <div className="rules-grid">
              <label>
                Score step
                <input type="number" min={1} max={50} value={rules.score_step} onChange={(e) => setRules((r) => ({ ...r, score_step: Number(e.target.value) }))} />
              </label>
              <label>
                Max adjustment
                <input type="number" min={1} max={500} value={rules.max_adjustment} onChange={(e) => setRules((r) => ({ ...r, max_adjustment: Number(e.target.value) }))} />
              </label>
              <label>
                Opening group size
                <input type="number" min={2} max={16} value={rules.opening_group_size} onChange={(e) => setRules((r) => ({ ...r, opening_group_size: Number(e.target.value) }))} />
              </label>
              <label>
                Opening qualify
                <input type="number" min={1} value={rules.opening_qualify} onChange={(e) => setRules((r) => ({ ...r, opening_qualify: Number(e.target.value) }))} />
              </label>
              <label>
                Semifinal size
                <input type="number" min={2} value={rules.semifinal_size} onChange={(e) => setRules((r) => ({ ...r, semifinal_size: Number(e.target.value) }))} />
              </label>
              <label>
                Semifinal qualify
                <input type="number" min={1} value={rules.semifinal_qualify} onChange={(e) => setRules((r) => ({ ...r, semifinal_qualify: Number(e.target.value) }))} />
              </label>
              <label>
                Final size
                <input type="number" min={2} value={rules.final_size} onChange={(e) => setRules((r) => ({ ...r, final_size: Number(e.target.value) }))} />
              </label>
              <label>
                Tie-break rule
                <select value={rules.tie_break_rule} onChange={(e) => setRules((r) => ({ ...r, tie_break_rule: e.target.value }))}>
                  <option value="points_then_name">Points then school name</option>
                  <option value="manual_review">Manual review</option>
                  <option value="replay">Replay / playoff</option>
                </select>
              </label>
            </div>
            <button className="primary-btn" type="submit">
              <Check size={16} /> Save rules
            </button>
          </form>
        </div>
      )}

      {tab === 'tournament' && canAdmin && (
        <div className="admin-panel-card">
          <h3>
            <Trophy size={18} /> Tournament progression
          </h3>
          <p>
            Advancement never drops teams arbitrarily. Opening groups × opening qualify must equal semifinal size;
            semifinal qualify must equal final size.
          </p>
          {mathErrors.length ? (
            <div className="math-warning">
              {mathErrors.map((err) => (
                <p key={err}>{err}</p>
              ))}
              <p>
                Tip: with 5 qualifiers per opening group and a 6-school semifinal, use a configuration that multiplies
                cleanly (for example 2 groups × 3 = 6), or adjust the published quotas before advancing.
              </p>
            </div>
          ) : (
            <div className="math-ok">Progression math is currently valid for {openingGroups.length} opening group(s).</div>
          )}
          <div className="admin-actions-row">
            <button className="primary-btn" type="button" disabled={busy} onClick={() => advance('semi')}>
              Advance opening → semifinal
            </button>
            <button className="outline-btn" type="button" disabled={busy} onClick={() => advance('final')}>
              Advance semifinal → final
            </button>
          </div>
          <div className="detail-row">
            <span>Podium</span>
            <strong>1st Champion · 2nd First Runner-Up · 3rd Second Runner-Up</strong>
          </div>
        </div>
      )}
    </>
  );
}
