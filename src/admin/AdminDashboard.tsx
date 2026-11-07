import { useMemo, useState, type FormEvent } from 'react';
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
  type SchoolRecord,
  type ScoringRules,
  type Team,
} from '../data';
import LiveScoring from './LiveScoring';
import ScoringConfig from './ScoringConfig';
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
};

const NAV: { id: AdminPage; label: string; icon: React.ReactNode; soon?: boolean }[] = [
  { id: 'overview', label: 'Dashboard Overview', icon: <LayoutDashboard size={16} /> },
  { id: 'live', label: 'Live Scoring', icon: <Radio size={16} /> },
  { id: 'schools', label: 'Schools & Teams', icon: <Users size={16} /> },
  { id: 'categories', label: 'Categories', icon: <Shield size={16} /> },
  { id: 'groups', label: 'Groups', icon: <Trophy size={16} /> },
  { id: 'rounds', label: 'Competition Rounds', icon: <Award size={16} /> },
  { id: 'results', label: 'Qualification & Results', icon: <Eye size={16} /> },
  { id: 'scoring', label: 'Scoring Configuration', icon: <Settings2 size={16} /> },
  { id: 'branding', label: 'Competition Branding', icon: <Palette size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings2 size={16} />, soon: true },
];

function parseCsv(text: string): { name: string; short_name: string; city?: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const start = lines[0].toLowerCase().includes('name') ? 1 : 0;
  return lines.slice(start).map((line) => {
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    const name = parts[0] || 'Unnamed School';
    return { name, short_name: parts[1] || name.slice(0, 24), city: parts[2] };
  });
}

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
  } = props;

  const [page, setPage] = useState<AdminPage>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [schoolShort, setSchoolShort] = useState('');
  const [schoolCity, setSchoolCity] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [busy, setBusy] = useState(false);

  const logo = competition.logo_url || DEFAULT_LOGO;
  const canAdmin = !supabase || (authorized && role !== 'scorekeeper');
  const openingGroups = groups.filter((g) => g.category_id === category && g.stage === 'Opening Round');
  const mathErrors = useMemo(() => validateProgressionMath(rules, Math.max(openingGroups.length, 1)), [rules, openingGroups.length]);

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

  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (!rows.length) return setNotice('No rows found in CSV.');
    if (!supabase) {
      setSchools((prev) => [...prev, ...rows.map((r) => ({ id: crypto.randomUUID(), name: r.name, short_name: r.short_name, city: r.city || null, category_id: category, competition_id: competition.id }))]);
      return setNotice(`Imported ${rows.length} schools in demo mode.`);
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
    <div className="admin-app">
      <aside className={'admin-sidebar ' + (sidebarOpen ? 'open' : '')}>
        <div className="admin-sidebar-brand">
          <img src={logo} alt="" />
          <div>
            <strong>IMJ Control</strong>
            <small>{competition.year} Championship</small>
          </div>
          <button className="admin-mobile-toggle" style={{ marginLeft: 'auto' }} onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={'admin-nav-btn ' + (page === item.id ? 'active' : '')}
            type="button"
            onClick={() => {
              if (item.soon) setNotice('Settings module is in development.');
              else if (item.id === 'branding') setSettingsOpen(true);
              else if (item.id === 'results') setView('results');
              else go(item.id);
            }}
          >
            {item.icon}
            {item.label}
            {item.soon && <span className="soon">SOON</span>}
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

          {page === 'schools' && canAdmin && (
            <div className="admin-panel">
              <div className="admin-hero-row">
                <div>
                  <h2>Schools & teams</h2>
                  <p>Register schools per category. CSV columns: name, short_name, city.</p>
                </div>
                <label className="outline-btn small file-btn">
                  <FileSpreadsheet size={16} /> Import CSV
                  <input hidden type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ''; }} />
                </label>
              </div>
              <div className="admin-toolbar">
                <label>Category
                  <select value={category} onChange={(e) => chooseCategory(e.target.value)}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <form className="inline-form" onSubmit={registerSchool}>
                <input required placeholder="School name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
                <input placeholder="Short name" value={schoolShort} onChange={(e) => setSchoolShort(e.target.value)} />
                <input placeholder="City" value={schoolCity} onChange={(e) => setSchoolCity(e.target.value)} />
                <button className="primary-btn" disabled={busy} type="submit">Add school</button>
              </form>
              <div className="school-admin-list">
                {schools.filter((s) => !s.category_id || s.category_id === category).map((s) => (
                  <div className="school-admin-row" key={s.id}>
                    <div><strong>{s.name}</strong><small>{s.short_name}{s.city ? ` · ${s.city}` : ''}</small></div>
                  </div>
                ))}
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
              <p>Advancement is blocked unless qualifier math is exact. No arbitrary eliminations.</p>
              {mathErrors.length ? (
                <div className="math-warning">{mathErrors.map((err) => <p key={err}>{err}</p>)}</div>
              ) : (
                <div className="math-ok">Progression math is valid for {openingGroups.length} opening group(s).</div>
              )}
              <div className="quick-actions">
                <button className="primary-btn" type="button" disabled={busy} onClick={() => advance('semi')}>Advance opening → semifinal</button>
                <button className="outline-btn" type="button" disabled={busy} onClick={() => advance('final')}>Advance semifinal → final</button>
              </div>
              <p style={{ marginTop: 14 }}>Current group: {currentGroup?.name || '—'} ({currentGroup?.status || '—'})</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
