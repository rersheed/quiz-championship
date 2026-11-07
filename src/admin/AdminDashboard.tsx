import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Award,
  Eye,
  FileSpreadsheet,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Monitor,
  Palette,
  Radio,
  Settings2,
  Shield,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_LOGO,
  validateProgressionMath,
  type Competition,
  type Division,
  type Group,
  type ScheduleEvent,
  type SchoolRecord,
  type ScoringRules,
  type Team,
} from '../data';
import { parseSchoolCsv, planStageMath } from '../lib/csv';
import LiveScoring from './LiveScoring';
import ScoringConfig from './ScoringConfig';
import SettingsPanel from './SettingsPanel';
import './admin.css';

type AdminPage =
  | 'overview'
  | 'live'
  | 'schools'
  | 'categories'
  | 'groups'
  | 'rounds'
  | 'results'
  | 'scoring'
  | 'branding'
  | 'settings';

type Props = {
  supabase: SupabaseClient | null;
  competition: Competition;
  setCompetition: React.Dispatch<React.SetStateAction<Competition>>;
  categories: Division[];
  setCategories: React.Dispatch<React.SetStateAction<Division[]>>;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  teams: Record<string, Team[]>;
  setTeams: React.Dispatch<React.SetStateAction<Record<string, Team[]>>>;
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
  finalize: () => Promise<void>;
  setSettingsOpen: (v: boolean) => void;
  setView: (v: 'home' | 'live' | 'schools' | 'results' | 'admin' | 'display') => void;
  setNotice: (v: string) => void;
  refreshAll: () => Promise<void>;
  connection: string;
  schedule: ScheduleEvent[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>;
};

const ALL_NAV: { id: AdminPage; label: string; icon: React.ReactNode; roles: Array<'super_admin' | 'admin' | 'scorekeeper' | 'demo'> }[] = [
  { id: 'overview', label: 'Dashboard Overview', icon: <LayoutDashboard size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'live', label: 'Live Scoring', icon: <Radio size={16} />, roles: ['super_admin', 'admin', 'scorekeeper', 'demo'] },
  { id: 'schools', label: 'Schools & Teams', icon: <Users size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'categories', label: 'Categories', icon: <Shield size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'groups', label: 'Groups', icon: <Trophy size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'rounds', label: 'Competition Rounds', icon: <Award size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'results', label: 'Qualification & Results', icon: <Eye size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'scoring', label: 'Scoring Configuration', icon: <Settings2 size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'branding', label: 'Competition Branding', icon: <Palette size={16} />, roles: ['super_admin', 'admin', 'demo'] },
  { id: 'settings', label: 'Settings', icon: <Settings2 size={16} />, roles: ['super_admin', 'admin', 'demo'] },
];

export default function AdminDashboard(props: Props) {
  const {
    supabase,
    competition,
    categories,
    setCategories,
    groups,
    setGroups,
    teams,
    setTeams,
    schools,
    setSchools,
    rules,
    setRules,
    category,
    chooseCategory,
    groupId,
    setGroupId,
    currentGroup,
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
    setSettingsOpen,
    setView,
    setNotice,
    refreshAll,
    connection,
    schedule,
    setSchedule,
  } = props;

  const effectiveRole = (!supabase ? 'demo' : role || 'scorekeeper') as 'super_admin' | 'admin' | 'scorekeeper' | 'demo';
  const isScorekeeper = effectiveRole === 'scorekeeper';
  const nav = ALL_NAV.filter((item) => item.roles.includes(effectiveRole));
  const [page, setPage] = useState<AdminPage>(isScorekeeper ? 'live' : 'overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [schoolShort, setSchoolShort] = useState('');
  const [schoolCity, setSchoolCity] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ rows: { name: string; short_name: string; city?: string; line: number }[]; errors: string[] } | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [busy, setBusy] = useState(false);
  const [incomingTeams, setIncomingTeams] = useState(16);
  const [planGroupSize, setPlanGroupSize] = useState(8);
  const [planQualify, setPlanQualify] = useState(5);
  const [templates, setTemplates] = useState<{ id: string; stage_name: string; stage_order: number; group_size: number; groups_count: number; qualify_per_group: number; advance_total: number }[]>([]);
  const [sourceStage, setSourceStage] = useState('');
  const [editSchoolId, setEditSchoolId] = useState<string | null>(null);

  const logo = competition.logo_url || DEFAULT_LOGO;
  const canAdmin = !supabase || (authorized && role !== 'scorekeeper');
  const openingGroups = groups.filter((g) => g.category_id === category && g.stage === 'Opening Round');
  const mathErrors = useMemo(() => validateProgressionMath(rules, Math.max(openingGroups.length, 1)), [rules, openingGroups.length]);
  const stagePlan = useMemo(() => planStageMath(incomingTeams, planGroupSize, planQualify), [incomingTeams, planGroupSize, planQualify]);
  const categoryStages = useMemo(() => [...new Set(groups.filter((g) => g.category_id === category).map((g) => g.stage))], [groups, category]);

  useEffect(() => {
    let alive = true;
    const loadTemplates = async () => {
      if (!supabase || competition.id === 'demo') {
        if (alive) {
          setTemplates([
            { id: 't1', stage_name: 'Opening Round', stage_order: 1, group_size: 8, groups_count: 2, qualify_per_group: 3, advance_total: 6 },
            { id: 't2', stage_name: 'Semifinal', stage_order: 2, group_size: 6, groups_count: 1, qualify_per_group: 4, advance_total: 4 },
            { id: 't3', stage_name: 'Final', stage_order: 3, group_size: 4, groups_count: 1, qualify_per_group: 3, advance_total: 3 },
          ]);
        }
        return;
      }
      const { data } = await supabase
        .from('stage_templates')
        .select('id,stage_name,stage_order,group_size,groups_count,qualify_per_group,advance_total')
        .eq('competition_id', competition.id)
        .order('stage_order');
      if (alive && data) setTemplates(data);
    };
    void loadTemplates();
    return () => {
      alive = false;
    };
  }, [supabase, competition.id]);
  const filteredSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    return schools
      .filter((s) => !s.category_id || s.category_id === category)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.short_name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q));
  }, [schools, category, schoolQuery]);

  const stats = useMemo(() => {
    const active = groups.filter((g) => g.status === 'live' || g.status === 'paused').length;
    const completed = groups.filter((g) => g.status === 'final').length;
    let qualified = 0;
    let eliminated = 0;
    for (const g of groups.filter((x) => x.status === 'final')) {
      const list = [...(teams[g.id] || [])].sort((a, b) => b.score - a.score);
      const quota =
        g.stage === 'Semifinal' ? rules.semifinal_qualify : g.stage === 'Final' ? 3 : rules.opening_qualify;
      qualified += Math.min(quota, list.length);
      eliminated += Math.max(0, list.length - quota);
    }
    return {
      schools: schools.length || new Set(Object.values(teams).flat().map((t) => t.name)).size,
      categories: categories.length,
      groups: groups.length,
      active,
      completed,
      qualified,
      eliminated,
    };
  }, [schools, teams, categories, groups, rules]);

  if (!user && supabase) {
    return (
      <div className="admin-login-wrap">
        <div className="admin-login-card">
          <div className="icon-bubble"><LockKeyhole /></div>
          <h2>Administrator sign in</h2>
          <p>Sign in with your authorized IMJ competition account.</p>
          <form onSubmit={authenticate}>
            <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button className="primary-btn" disabled={authBusy}>{authBusy ? 'Signing in...' : 'Sign in'}</button>
          </form>
        </div>
      </div>
    );
  }

  if (user && !authorized) {
    return (
      <div className="admin-login-wrap">
        <div className="admin-login-card">
          <LockKeyhole size={28} />
          <h2>Access required</h2>
          <p>Signed in as {user}, but this account is not in the admins table.</p>
          <button className="outline-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  const go = (id: AdminPage) => {
    setPage(id);
    setSidebarOpen(false);
  };

  const registerSchool = async (e: FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;
    if (!supabase) {
      setSchools((prev) => [...prev, { id: crypto.randomUUID(), name: schoolName, short_name: schoolShort || schoolName.slice(0, 24), city: schoolCity || null, category_id: category, competition_id: competition.id }]);
      setSchoolName(''); setSchoolShort(''); setSchoolCity('');
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
      setSchoolName(''); setSchoolShort(''); setSchoolCity('');
      setNotice('School registered.');
      await refreshAll();
    }
  };

  const previewCsv = async (file: File) => {
    const parsed = parseSchoolCsv(await file.text());
    setCsvPreview(parsed);
    if (!parsed.rows.length) setNotice('No valid school rows found in CSV.');
  };

  const confirmCsvImport = async () => {
    if (!csvPreview?.rows.length) return;
    if (csvPreview.errors.length && !window.confirm(`${csvPreview.errors.length} validation warning(s). Import valid rows anyway?`)) return;
    const rows = csvPreview.rows;
    if (!supabase) {
      setSchools((prev) => [...prev, ...rows.map((r) => ({ id: crypto.randomUUID(), name: r.name, short_name: r.short_name, city: r.city || null, category_id: category, competition_id: competition.id }))]);
      setCsvPreview(null);
      return setNotice(`Imported ${rows.length} schools in demo mode.`);
    }
    setBusy(true);
    let ok = 0;
    const failures: string[] = [];
    for (const row of rows) {
      const { error } = await supabase.rpc('register_school', {
        p_competition_id: competition.id,
        p_category_id: category,
        p_name: row.name,
        p_short_name: row.short_name,
        p_logo_url: null,
        p_city: row.city || null,
      });
      if (error) failures.push(`${row.name}: ${error.message}`);
      else ok += 1;
    }
    setBusy(false);
    setCsvPreview(null);
    setNotice(failures.length ? `Imported ${ok}/${rows.length}. ${failures.slice(0, 3).join(' | ')}` : `Imported ${ok} schools.`);
    await refreshAll();
  };

  const allocateGroups = async () => {
    if (!supabase) return setNotice('Connect Supabase to allocate groups.');
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

  const advance = async (kind: 'semi' | 'final') => {
    if (!supabase) return setNotice('Tournament advancement requires Supabase.');
    if (mathErrors.length && kind === 'semi') return setNotice(mathErrors[0]);
    setBusy(true);
    const { error } = await supabase.rpc(kind === 'semi' ? 'advance_opening_to_semifinal' : 'advance_semifinal_to_final', {
      p_category_id: category,
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(kind === 'semi' ? 'Semifinal created.' : 'Grand final created.');
      await refreshAll();
    }
  };

  return (
    <div className={'admin-app ' + (sidebarCollapsed ? 'sidebar-collapsed' : '') + (isScorekeeper ? ' scorekeeper-mode' : '')}>
      <aside className={'admin-sidebar ' + (sidebarOpen ? 'open' : '')}>
        <div className="admin-sidebar-brand">
          <img src={logo} alt="" />
          {!sidebarCollapsed && (
            <div>
              <strong>IMJ Control</strong>
              <small>{competition.year} Championship</small>
            </div>
          )}
          <button className="admin-mobile-toggle" style={{ marginLeft: 'auto' }} onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        <button className="admin-nav-btn" type="button" onClick={() => setSidebarCollapsed((v) => !v)} title="Collapse sidebar">
          <Menu size={16} />
          {!sidebarCollapsed && (sidebarCollapsed ? 'Expand' : 'Collapse menu')}
        </button>
        {nav.map((item) => (
          <button
            key={item.id}
            className={'admin-nav-btn ' + (page === item.id ? 'active' : '')}
            type="button"
            title={item.label}
            onClick={() => {
              if (item.id === 'branding') setSettingsOpen(true);
              else if (item.id === 'results') setView('results');
              else go(item.id);
            }}
          >
            {item.icon}
            {!sidebarCollapsed && item.label}
          </button>
        ))}
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-top-left">
            <button className="admin-mobile-toggle" style={{ background: '#0F2040' }} onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={16} />
            </button>
            <img src={logo} alt="" />
            <div>
              <strong>{competition.short_title || competition.title}</strong>
              <small>{competition.year} edition</small>
            </div>
          </div>
          <div className="admin-top-right">
            <span className="admin-chip">{user || 'Demo operator'}</span>
            <span className="admin-chip">{(role || 'demo').replace('_', ' ')}</span>
            <span className={'admin-chip ' + (connection === 'live' ? 'live' : connection === 'demo' ? '' : 'offline')}>
              {connection === 'live' ? <Wifi size={14} /> : <WifiOff size={14} />} {connection}
            </span>
            <button className="outline-btn small" type="button" onClick={() => setView('live')}>
              <Eye size={14} /> Public board
            </button>
            <button className="outline-btn small" type="button" onClick={() => setView('display')}>
              <Monitor size={14} /> Projector
            </button>
            {user && (
              <button className="outline-btn small" type="button" onClick={signOut}>
                <LogOut size={14} /> Sign out
              </button>
            )}
          </div>
        </header>

        <div className="admin-content">
          {page === 'overview' && (
            <>
              <div className="admin-hero-row">
                <div>
                  <h1>Competition control centre</h1>
                  <p>Operate live scoring, manage schools and advance rounds from one dashboard.</p>
                </div>
                <div className="quick-actions">
                  <button className="primary-btn" type="button" onClick={() => go('live')}><Radio size={16} /> Open Live Scoring</button>
                  <button className="outline-btn" type="button" onClick={() => setView('live')}><Eye size={16} /> Public leaderboard</button>
                  {canAdmin && <button className="outline-btn" type="button" onClick={() => setSettingsOpen(true)}><Palette size={16} /> Branding</button>}
                </div>
              </div>
              <div className="stat-cards">
                <div className="stat-card"><span>Registered schools</span><strong>{stats.schools}</strong></div>
                <div className="stat-card"><span>Categories</span><strong>{stats.categories}</strong></div>
                <div className="stat-card"><span>Groups</span><strong>{stats.groups}</strong></div>
                <div className="stat-card"><span>Active groups</span><strong>{stats.active}</strong></div>
                <div className="stat-card"><span>Completed groups</span><strong>{stats.completed}</strong></div>
                <div className="stat-card"><span>Qualified schools</span><strong>{stats.qualified}</strong></div>
                <div className="stat-card"><span>Eliminated schools</span><strong>{stats.eliminated}</strong></div>
                <div className="stat-card"><span>Correct marks</span><strong>+{rules.correct_points ?? rules.score_step}</strong></div>
              </div>
            </>
          )}

          {page === 'live' && (
            <LiveScoring
              supabase={supabase}
              competitionId={competition.id}
              categories={categories}
              groups={groups}
              teams={teams}
              setTeams={setTeams}
              rules={rules}
              category={category}
              setCategory={chooseCategory}
              groupId={groupId}
              setGroupId={setGroupId}
              setGroups={setGroups}
              role={role}
              setNotice={setNotice}
              refreshAll={refreshAll}
            />
          )}

          {page === 'scoring' && (
            <ScoringConfig
              supabase={supabase}
              competitionId={competition.id}
              categories={categories}
              rules={rules}
              setRules={setRules}
              role={role}
              setNotice={setNotice}
            />
          )}

          {page === 'settings' && (
            <SettingsPanel
              supabase={supabase}
              competitionId={competition.id}
              role={role}
              schedule={schedule}
              setSchedule={setSchedule}
              setNotice={setNotice}
            />
          )}

          {page === 'schools' && canAdmin && (
            <div className="admin-panel">
              <div className="admin-hero-row">
                <div>
                  <h2>Schools & teams</h2>
                  <p>Register schools per category. CSV columns: name, short_name, city. Quoted commas are supported.</p>
                </div>
                <label className="outline-btn small file-btn">
                  <FileSpreadsheet size={16} /> Preview CSV
                  <input hidden type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void previewCsv(f); e.target.value = ''; }} />
                </label>
              </div>
              <div className="admin-toolbar">
                <label>Category
                  <select value={category} onChange={(e) => chooseCategory(e.target.value)}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>Search
                  <input value={schoolQuery} onChange={(e) => setSchoolQuery(e.target.value)} placeholder="Filter schools" />
                </label>
              </div>
              <form className="inline-form" onSubmit={registerSchool}>
                <input required placeholder="School name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
                <input placeholder="Short name" value={schoolShort} onChange={(e) => setSchoolShort(e.target.value)} />
                <input placeholder="City" value={schoolCity} onChange={(e) => setSchoolCity(e.target.value)} />
                <button className="primary-btn" disabled={busy} type="submit">Add school</button>
              </form>
              {csvPreview && (
                <div className="math-warning" style={{ marginTop: 12 }}>
                  <p><strong>CSV preview:</strong> {csvPreview.rows.length} valid row(s), {csvPreview.errors.length} warning(s).</p>
                  {csvPreview.errors.slice(0, 5).map((err) => <p key={err}>{err}</p>)}
                  <div className="quick-actions">
                    <button className="primary-btn" type="button" disabled={busy || !csvPreview.rows.length} onClick={() => void confirmCsvImport()}>Confirm import</button>
                    <button className="outline-btn" type="button" onClick={() => setCsvPreview(null)}>Cancel</button>
                  </div>
                </div>
              )}
              <div className="school-admin-list">
                {filteredSchools.map((s) => (
                  <div className="school-admin-row" key={s.id}>
                    <div>
                      {editSchoolId === s.id ? (
                        <form
                          className="inline-form"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!supabase) {
                              setSchools((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: schoolName || s.name, short_name: schoolShort || s.short_name, city: schoolCity || s.city } : x)));
                              setEditSchoolId(null);
                              return;
                            }
                            const { error } = await supabase.rpc('update_school', {
                              p_school_id: s.id,
                              p_name: schoolName || s.name,
                              p_short_name: schoolShort || s.short_name,
                              p_city: schoolCity || s.city || null,
                              p_logo_url: s.logo_url || null,
                            });
                            if (error) setNotice(error.message);
                            else {
                              setNotice('School updated.');
                              setEditSchoolId(null);
                              setSchoolName('');
                              setSchoolShort('');
                              setSchoolCity('');
                              await refreshAll();
                            }
                          }}
                        >
                          <input defaultValue={s.name} onChange={(e) => setSchoolName(e.target.value)} required />
                          <input defaultValue={s.short_name} onChange={(e) => setSchoolShort(e.target.value)} />
                          <input defaultValue={s.city || ''} onChange={(e) => setSchoolCity(e.target.value)} />
                          <button className="primary-btn" type="submit">Save</button>
                        </form>
                      ) : (
                        <>
                          <strong>{s.name}</strong>
                          <small>{s.short_name}{s.city ? ` · ${s.city}` : ''}{s.active === false ? ' · inactive' : ''}</small>
                        </>
                      )}
                    </div>
                    <div className="quick-actions">
                      <button
                        className="outline-btn small"
                        type="button"
                        onClick={() => {
                          setEditSchoolId(s.id);
                          setSchoolName(s.name);
                          setSchoolShort(s.short_name);
                          setSchoolCity(s.city || '');
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="outline-btn small"
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Deactivate ${s.name}? History is preserved.`)) return;
                          if (!supabase) {
                            setSchools((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: false } : x)));
                            return;
                          }
                          const { error } = await supabase.from('schools').update({ active: false }).eq('id', s.id);
                          if (error) setNotice(error.message);
                          else { setNotice('School deactivated.'); await refreshAll(); }
                        }}
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                ))}
                {!filteredSchools.length && <p className="empty-board">No schools match this filter.</p>}
              </div>
            </div>
          )}

          {page === 'categories' && canAdmin && (
            <div className="admin-panel">
              <h2>Categories</h2>
              <p>Each category keeps independent schools, groups, scores and champions.</p>
              <form className="inline-form" onSubmit={async (e) => {
                e.preventDefault();
                if (!categoryName.trim()) return;
                if (!supabase) {
                  setCategories((prev) => [...prev, { id: categoryName.toLowerCase().replace(/\s+/g, '-'), name: categoryName.trim(), competition_id: competition.id }]);
                  setCategoryName('');
                  return;
                }
                const { error } = await supabase.from('categories').insert({ competition_id: competition.id, name: categoryName.trim() });
                if (error) setNotice(error.message);
                else { setCategoryName(''); await refreshAll(); }
              }}>
                <input required placeholder="New category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
                <button className="primary-btn" type="submit">Add category</button>
              </form>
              <div className="group-admin-grid">
                {categories.map((c) => (
                  <div className="group-admin-card" key={c.id}>
                    <strong>{c.name}</strong>
                    <small>{groups.filter((g) => g.category_id === c.id).length} groups</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'groups' && canAdmin && (
            <div className="admin-panel">
              <div className="admin-hero-row">
                <div>
                  <h2>Groups</h2>
                  <p>Auto-allocate unassigned schools into opening groups of {rules.opening_group_size}.</p>
                </div>
                <button className="primary-btn" type="button" disabled={busy} onClick={allocateGroups}>Allocate opening groups</button>
              </div>
              <div className="admin-toolbar">
                <label>Category
                  <select value={category} onChange={(e) => chooseCategory(e.target.value)}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="group-admin-grid">
                {groups.filter((g) => g.category_id === category).map((g) => (
                  <div className="group-admin-card" key={g.id}>
                    <strong>{g.name} · {g.stage}</strong>
                    <span className={'status-pill ' + g.status}>{g.status}</span>
                    <small>{(teams[g.id] || []).length} teams</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {page === 'rounds' && canAdmin && (
            <div className="admin-panel">
              <h2>Competition rounds</h2>
              <p>Plan and create stages from templates. Advancement never drops teams arbitrarily.</p>
              <div className="admin-toolbar">
                <label>Incoming teams<input type="number" min={2} value={incomingTeams} onChange={(e) => setIncomingTeams(Number(e.target.value))} /></label>
                <label>Group size<input type="number" min={2} value={planGroupSize} onChange={(e) => setPlanGroupSize(Number(e.target.value))} /></label>
                <label>Qualify per group<input type="number" min={1} value={planQualify} onChange={(e) => setPlanQualify(Number(e.target.value))} /></label>
              </div>
              <div className={stagePlan.valid ? 'math-ok' : 'math-warning'}><p>{stagePlan.message}</p></div>
              {mathErrors.length ? (
                <div className="math-warning">{mathErrors.map((err) => <p key={err}>{err}</p>)}</div>
              ) : (
                <div className="math-ok">Default opening→semifinal path is valid for {openingGroups.length} opening group(s) with current rules.</div>
              )}

              <h3 style={{ marginTop: 22 }}>Stage templates</h3>
              <div className="group-admin-grid">
                {templates.map((t) => (
                  <div className="group-admin-card" key={t.id}>
                    <strong>{t.stage_name}</strong>
                    <small>{t.groups_count} × {t.group_size} · top {t.qualify_per_group} → {t.advance_total}</small>
                    <label style={{ fontSize: 11, fontWeight: 800 }}>
                      Source stage (optional)
                      <select value={sourceStage} onChange={(e) => setSourceStage(e.target.value)}>
                        <option value="">Unassigned teams</option>
                        {categoryStages.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <button
                      className="primary-btn"
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`Create ${t.stage_name} for this category using the template math?`)) return;
                        if (!supabase) return setNotice('Stage creation requires Supabase.');
                        setBusy(true);
                        const { data, error } = await supabase.rpc('create_stage_from_template', {
                          p_competition_id: competition.id,
                          p_category_id: category,
                          p_template_id: t.id,
                          p_source_stage: sourceStage || null,
                        });
                        setBusy(false);
                        if (error) setNotice(error.message);
                        else {
                          setNotice(`Created ${data} group(s) for ${t.stage_name}.`);
                          await refreshAll();
                        }
                      }}
                    >
                      Create stage
                    </button>
                  </div>
                ))}
              </div>

              <div className="quick-actions" style={{ marginTop: 18 }}>
                <button className="outline-btn" type="button" disabled={busy} onClick={() => { if (window.confirm('Create semifinal from finalized opening groups?')) void advance('semi'); }}>Legacy: opening → semifinal</button>
                <button className="outline-btn" type="button" disabled={busy} onClick={() => { if (window.confirm('Create grand final from finalized semifinal?')) void advance('final'); }}>Legacy: semifinal → final</button>
                {currentGroup?.status === 'final' && (
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!supabase) return setNotice('Approve results requires Supabase.');
                      if (!window.confirm('Publish these results as official?')) return;
                      const { error } = await supabase.rpc('approve_group_results', { p_group_id: currentGroup.id });
                      if (error) setNotice(error.message);
                      else { setNotice('Results approved for public official display.'); await refreshAll(); }
                    }}
                  >
                    Approve official results
                  </button>
                )}
              </div>
              <p style={{ marginTop: 14 }}>Current group: {currentGroup?.name || '—'} ({currentGroup?.status || '—'})</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
