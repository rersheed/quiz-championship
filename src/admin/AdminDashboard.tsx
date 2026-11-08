import { useMemo, useState, type FormEvent } from 'react';
import {
  Award,
  Eye,
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
  type Competition,
  type Division,
  type Group,
  type ScheduleEvent,
  type SchoolRecord,
  type ScoringRules,
  type Team,
} from '../data';
import CategoriesCrud from './CategoriesCrud';
import GroupsCrud from './GroupsCrud';
import LiveScoring from './LiveScoring';
import RoundsCrud from './RoundsCrud';
import SchoolsCrud from './SchoolsCrud';
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

  const logo = competition.logo_url || DEFAULT_LOGO;
  const canAdmin = !supabase || (authorized && role !== 'scorekeeper');

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
            <SchoolsCrud
              supabase={supabase}
              competitionId={competition.id}
              categories={categories}
              category={category}
              chooseCategory={chooseCategory}
              schools={schools}
              setSchools={setSchools}
              setNotice={setNotice}
              refreshAll={refreshAll}
            />
          )}

          {page === 'categories' && canAdmin && (
            <CategoriesCrud
              supabase={supabase}
              competitionId={competition.id}
              categories={categories}
              setCategories={setCategories}
              groups={groups}
              setNotice={setNotice}
              refreshAll={refreshAll}
            />
          )}

          {page === 'groups' && canAdmin && (
            <GroupsCrud
              supabase={supabase}
              competitionId={competition.id}
              categories={categories}
              category={category}
              chooseCategory={chooseCategory}
              groups={groups}
              setGroups={setGroups}
              teams={teams}
              schools={schools}
              rules={rules}
              setNotice={setNotice}
              refreshAll={refreshAll}
            />
          )}

          {page === 'rounds' && canAdmin && (
            <RoundsCrud
              supabase={supabase}
              competitionId={competition.id}
              categories={categories}
              category={category}
              chooseCategory={chooseCategory}
              groups={groups}
              rules={rules}
              currentGroup={currentGroup}
              setNotice={setNotice}
              refreshAll={refreshAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}
