import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleHelp,
  Crown,
  GraduationCap,
  LayoutDashboard,
  Medal,
  Menu,
  Monitor,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import AdminDashboard from './admin/AdminDashboard';
import ResultsArchive from './components/ResultsArchive';
import {
  DEFAULT_LOGO,
  demoCategories,
  demoCompetition,
  demoGroups,
  demoRules,
  demoTeams,
  qualificationQuota,
  sorted,
  type Competition,
  type Division,
  type Group,
  type ScheduleEvent,
  type SchoolRecord,
  type ScoringRules,
  type Team,
} from './data';
import { supabase } from './lib/supabase';

type View = 'home' | 'live' | 'schools' | 'results' | 'admin' | 'display';

function Brand({ competition, small = false }: { competition: Competition; small?: boolean }) {
  const logo = competition.logo_url || DEFAULT_LOGO;
  return (
    <div className={'brand ' + (small ? 'brand-small' : '')}>
      <div className="brandmark has-logo">
        <img src={logo} alt="IMJ Group logo" />
      </div>
      <div className="brandcopy">
        <strong>
          IMJ <span>GROUP</span>
        </strong>
        <small>QUIZ CHAMPIONSHIP</small>
      </div>
    </div>
  );
}

function App() {
  const [competition, setCompetition] = useState<Competition>(demoCompetition);
  const [categories, setCategories] = useState<Division[]>(demoCategories);
  const [groups, setGroups] = useState<Group[]>(demoGroups);
  const [teams, setTeams] = useState<Record<string, Team[]>>(demoTeams);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([]);
  const [rules, setRules] = useState<ScoringRules>(demoRules);
  const [category, setCategory] = useState('secondary');
  const [groupId, setGroupId] = useState('a');
  const [view, setView] = useState<View>('home');
  const [user, setUser] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState(supabase ? 'connecting' : 'demo');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prevRanks = useRef<Record<string, number>>({});

  const selectedGroups = groups.filter((g) => g.category_id === category);
  const currentGroup = groups.find((g) => g.id === groupId) || selectedGroups[0];
  const currentTeams = sorted(teams[currentGroup?.id] || []);
  const liveCount = groups.filter((g) => g.status === 'live').length;
  const activeCategory = categories.find((c) => c.id === category);
  const totalSchools = useMemo(() => new Set(Object.values(teams).flat().map((t) => t.name)).size, [teams]);

  const applyLeaderboard = useCallback((rows: { group_id: string; team_id: string; name: string; short_name: string; score: number }[]) => {
    const next: Record<string, Team[]> = {};
    for (const row of rows) {
      (next[row.group_id] ||= []).push({
        id: row.team_id,
        name: row.name,
        short_name: row.short_name,
        score: row.score,
      });
    }
    setTeams(next);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!supabase || competition.id === 'demo') return;
    const [grps, entries, schoolRows, ruleRows] = await Promise.all([
      supabase.from('competition_groups').select('*').eq('competition_id', competition.id),
      supabase.from('leaderboard_entries').select('group_id,team_id,name,short_name,score').eq('competition_id', competition.id),
      supabase.from('schools').select('*').eq('competition_id', competition.id).order('name'),
      supabase.from('scoring_rules').select('*').eq('competition_id', competition.id).limit(1),
    ]);
    if (grps.data) setGroups(grps.data as Group[]);
    if (entries.data) applyLeaderboard(entries.data);
    if (schoolRows.data) setSchools(schoolRows.data as SchoolRecord[]);
    if (ruleRows.data?.[0]) setRules(ruleRows.data[0] as ScoringRules);
  }, [applyLeaderboard, competition.id]);

  useEffect(() => {
    if (!supabase) {
      setSchools(
        Object.values(demoTeams)
          .flat()
          .map((t) => ({
            id: t.id,
            name: t.name,
            short_name: t.short_name,
            category_id: t.id <= '8' || (t.id >= '9' && t.id <= '16') ? 'secondary' : 'primary',
            competition_id: 'demo',
          })),
      );
      return;
    }
    let alive = true;
    const load = async () => {
      const { data: competitions, error: ce } = await supabase!
        .from('competitions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (ce) {
        if (alive) setNotice('Unable to load the Supabase competition. Check the database migration and project configuration.');
        setLoading(false);
        return;
      }
      if (!competitions?.length) {
        if (alive) {
          setLoading(false);
          setNotice('Database connected. Create a competition using SQL or the management dashboard.');
        }
        return;
      }
      const comp = competitions[0] as Competition;
      const [cats, grps, entries, schoolRows, ruleRows, scheduleRows] = await Promise.all([
        supabase!.from('categories').select('*').eq('competition_id', comp.id),
        supabase!.from('competition_groups').select('*').eq('competition_id', comp.id),
        supabase!.from('leaderboard_entries').select('group_id,team_id,name,short_name,score').eq('competition_id', comp.id),
        supabase!.from('schools').select('*').eq('competition_id', comp.id).order('name'),
        supabase!.from('scoring_rules').select('*').eq('competition_id', comp.id).limit(1),
        supabase!.from('schedule_events').select('*').eq('competition_id', comp.id).order('sort_order'),
      ]);
      if (!alive) return;
      setCompetition(comp);
      if (cats.data?.length) {
        setCategories(cats.data as Division[]);
        setCategory(cats.data[0].id);
      }
      if (grps.data?.length) {
        setGroups(grps.data as Group[]);
        setGroupId(grps.data[0].id);
      }
      if (entries.data) applyLeaderboard(entries.data);
      if (schoolRows.data) setSchools(schoolRows.data as SchoolRecord[]);
      if (ruleRows.data?.[0]) setRules(ruleRows.data[0] as ScoringRules);
      if (scheduleRows.data) setSchedule(scheduleRows.data as ScheduleEvent[]);
      setLoading(false);
      if (grps.error || entries.error) setNotice('Some competition information could not be loaded.');
    };
    load();
    const auth = supabase.auth.onAuthStateChange((_ev, s) => setUser(s?.user.email || null));
    supabase.auth.getUser().then(({ data }) => setUser(data.user?.email || null));
    return () => {
      alive = false;
      auth.data.subscription.unsubscribe();
    };
  }, [applyLeaderboard]);

  useEffect(() => {
    if (!supabase || !user) {
      setAuthorized(false);
      setRole(null);
      return;
    }
    const client = supabase;
    client.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const result = await client.from('admins').select('user_id,role').eq('user_id', data.user.id).maybeSingle();
      setAuthorized(Boolean(result.data));
      setRole(result.data?.role || null);
    });
  }, [user]);

  useEffect(() => {
    const client = supabase;
    if (!client || competition.id === 'demo') return;
    setConnection('connecting');
    let retryTimer: number | undefined;
    const channel = client
      .channel('live-' + competition.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, async () => {
        const { data } = await client
          .from('leaderboard_entries')
          .select('group_id,team_id,name,short_name,score')
          .eq('competition_id', competition.id);
        if (data) applyLeaderboard(data);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_groups' }, async () => {
        const { data } = await client.from('competition_groups').select('*').eq('competition_id', competition.id);
        if (data) setGroups(data as Group[]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('offline');
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => {
            void client.removeChannel(channel);
            setConnection('connecting');
            void refreshAll();
          }, 2500);
        } else setConnection('connecting');
      });
    return () => {
      window.clearTimeout(retryTimer);
      void client.removeChannel(channel);
    };
  }, [applyLeaderboard, competition.id, refreshAll]);

  const chooseCategory = (id: string) => {
    setCategory(id);
    const found = groups.find((g) => g.category_id === id);
    if (found) setGroupId(found.id);
  };

  const authenticate = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setNotice('Demo mode: connect Supabase to enable administrator login.');
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) setNotice(error.message);
    else setPassword('');
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setAuthorized(false);
    setRole(null);
    setView('home');
  };

  const finalize = async () => {
    if (!currentGroup) return;
    if (!supabase) {
      setGroups((g) => g.map((v) => (v.id === currentGroup.id ? { ...v, status: v.status === 'final' ? 'live' : 'final' } : v)));
      return;
    }
    const { error } = await supabase.rpc('finalize_group', { p_group_id: currentGroup.id });
    if (error) setNotice(error.message);
  };

  const saveBrand = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) {
      setSettingsOpen(false);
      setNotice('Brand settings preview updated in demo mode.');
      return;
    }
    if (!authorized || role === 'scorekeeper') return;
    const { error } = await supabase
      .from('competitions')
      .update({
        title: competition.title,
        short_title: competition.short_title,
        tagline: competition.tagline,
        slogan: competition.slogan || competition.tagline,
        primary_color: competition.primary_color,
        secondary_color: competition.secondary_color,
        logo_url: competition.logo_url,
        organizer_logo_url: competition.organizer_logo_url,
        organizer: competition.organizer,
        venue: competition.venue,
        year: competition.year,
      })
      .eq('id', competition.id);
    setNotice(error ? error.message : 'Branding saved successfully.');
    if (!error) setSettingsOpen(false);
  };

  const nav = [
    ['home', 'Overview'],
    ['live', 'Live leaderboard'],
    ['schools', 'Schools'],
    ['results', 'Results'],
    ['admin', 'Control centre'],
  ] as [View, string][];

  if (view === 'admin') {
    return (
      <>
        {notice && (
          <div className="toast" role="alert">
            {notice}
            <button aria-label="Dismiss" onClick={() => setNotice('')}>
              <X size={15} />
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading">
            <RefreshCw className="spin" /> Loading championship...
          </div>
        ) : (
          <AdminDashboard
            supabase={supabase}
            competition={competition}
            setCompetition={setCompetition}
            categories={categories}
            setCategories={setCategories}
            groups={groups}
            setGroups={setGroups}
            teams={teams}
            setTeams={setTeams}
            schools={schools}
            setSchools={setSchools}
            rules={rules}
            setRules={setRules}
            category={category}
            chooseCategory={chooseCategory}
            groupId={groupId}
            setGroupId={setGroupId}
            currentGroup={currentGroup}
            currentTeams={currentTeams}
            user={user}
            authorized={authorized}
            role={role}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            authBusy={authBusy}
            authenticate={authenticate}
            signOut={signOut}
            finalize={finalize}
            setSettingsOpen={setSettingsOpen}
            setView={setView}
            setNotice={setNotice}
            refreshAll={refreshAll}
            connection={connection}
          />
        )}
        {settingsOpen && (
          <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2>Competition branding</h2>
                <button aria-label="Close" onClick={() => setSettingsOpen(false)}>
                  <X />
                </button>
              </div>
              <form onSubmit={saveBrand} className="brand-form">
                <label>
                  Official competition title
                  <input value={competition.title} onChange={(e) => setCompetition((c) => ({ ...c, title: e.target.value }))} required />
                </label>
                <label>
                  Short title
                  <input value={competition.short_title} onChange={(e) => setCompetition((c) => ({ ...c, short_title: e.target.value }))} required />
                </label>
                <label>
                  Tagline / slogan
                  <input
                    value={competition.slogan || competition.tagline}
                    onChange={(e) => setCompetition((c) => ({ ...c, slogan: e.target.value, tagline: e.target.value }))}
                  />
                </label>
                <label>
                  Organizer
                  <input value={competition.organizer || ''} onChange={(e) => setCompetition((c) => ({ ...c, organizer: e.target.value }))} />
                </label>
                <label>
                  Venue
                  <input value={competition.venue || ''} onChange={(e) => setCompetition((c) => ({ ...c, venue: e.target.value }))} />
                </label>
                <label>
                  Year
                  <input type="number" value={competition.year} onChange={(e) => setCompetition((c) => ({ ...c, year: Number(e.target.value) }))} />
                </label>
                <label>
                  Competition logo URL
                  <input type="url" placeholder="https://..." value={competition.logo_url || ''} onChange={(e) => setCompetition((c) => ({ ...c, logo_url: e.target.value }))} />
                </label>
                <label>
                  Brand accent colour
                  <input type="color" value={competition.primary_color} onChange={(e) => setCompetition((c) => ({ ...c, primary_color: e.target.value }))} />
                </label>
                <button className="primary-btn" type="submit">
                  <Check size={16} /> Save branding
                </button>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={'site ' + (view === 'display' ? 'display-site' : '')} style={{ '--gold': competition.primary_color || '#3D93CF' } as CSSProperties}>
      {view !== 'display' && (
        <>
          <div className="topline">
            <span>
              <span className="topdot" /> OFFICIAL COMPETITION PLATFORM
            </span>
            <span>
              {competition.year} EDITION <span className="topline-slash">/</span> {(competition.venue || 'KADUNA, NIGERIA').toUpperCase()}
            </span>
          </div>
          <header className="header container">
            <button className="brand-button" onClick={() => setView('home')} aria-label="Home">
              <Brand competition={competition} />
            </button>
            <nav className={mobileMenu ? 'nav open' : 'nav'}>
              {nav.map(([id, label]) => (
                <button
                  key={id}
                  className={view === id ? 'active' : ''}
                  onClick={() => {
                    setView(id);
                    setMobileMenu(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="header-actions">
              <button className="outline-btn small" onClick={() => setView('display')}>
                <Monitor size={16} /> Display mode
              </button>
              <button className="menu-btn" aria-label="Menu" onClick={() => setMobileMenu(!mobileMenu)}>
                {mobileMenu ? <X /> : <Menu />}
              </button>
            </div>
          </header>
        </>
      )}
      {notice && (
        <div className="toast" role="alert">
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading">
          <RefreshCw className="spin" /> Loading championship...
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.main key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            {view === 'home' && (
              <>
                <section className="hero">
                  <div className="hero-art hero-art-one" />
                  <div className="hero-art hero-art-two" />
                  <div className="container hero-inner">
                    <div className="hero-copy">
                      <div className="eyebrow light">
                        <Sparkles size={15} /> THE {competition.year} ANNUAL CHAMPIONSHIP
                      </div>
                      <div className="hero-line" />
                      <h1>
                        Where young minds <em>rise to greatness.</em>
                      </h1>
                      <p>
                        {competition.slogan || competition.tagline} Join us as brilliant schools battle for the ultimate academic glory.
                      </p>
                      <div className="hero-buttons">
                        <button className="primary-btn" onClick={() => setView('live')}>
                          <Radio size={18} /> Watch live standings <ArrowRight size={18} />
                        </button>
                        <button className="glass-btn" onClick={() => setView('schools')}>
                          <Users size={18} /> Explore schools
                        </button>
                      </div>
                      <div className="hero-meta">
                        <span>
                          <CalendarDays size={17} /> {competition.year} Edition
                        </span>
                        <span>
                          <Shield size={17} /> {competition.venue || 'Kaduna, Nigeria'}
                        </span>
                        {competition.organizer && (
                          <span>
                            <Trophy size={17} /> {competition.organizer}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hero-visual">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="trophy-glow" />
                      <Trophy className="giant-trophy" strokeWidth={1.2} />
                      <div className="floating-card">
                        <Crown size={24} />
                        <div>
                          <strong>THE CHAMPIONS</strong>
                          <small>Knowledge · Excellence · Victory</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="stats-section container">
                  <div className="stats-grid">
                    <Stat icon={<GraduationCap />} label="Participating schools" value={Math.max(totalSchools, schools.length)} />
                    <Stat icon={<Users />} label="Competition categories" value={categories.length} />
                    <Stat icon={<LayoutDashboard />} label="Competition groups" value={groups.length} />
                    <Stat icon={<Radio />} label="Live sessions" value={liveCount} />
                  </div>
                </section>
                <section className="section container">
                  <div className="section-head">
                    <div>
                      <div className="eyebrow">THE COMPETITION</div>
                      <h2>Explore the championship</h2>
                      <p>Stay on top of every stage, from the opening rounds to the grand final.</p>
                    </div>
                    <button className="text-link" onClick={() => setView('live')}>
                      View live leaderboard <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="feature-grid">
                    <button className="feature-card feature-dark" onClick={() => setView('live')}>
                      <div className="feature-icon">
                        <Radio />
                      </div>
                      <span className="live-chip">
                        <span /> LIVE COVERAGE
                      </span>
                      <h3>Live Leaderboard</h3>
                      <p>Follow scores and rankings as they happen in real time.</p>
                      <span className="feature-link">
                        Watch now <ArrowRight size={17} />
                      </span>
                    </button>
                    <button className="feature-card" onClick={() => setView('schools')}>
                      <div className="feature-icon">
                        <GraduationCap />
                      </div>
                      <h3>Participating Schools</h3>
                      <p>Meet the schools competing for this year's top honours.</p>
                      <span className="feature-link">
                        View schools <ArrowRight size={17} />
                      </span>
                    </button>
                    <button className="feature-card" onClick={() => setView('display')}>
                      <div className="feature-icon">
                        <Monitor />
                      </div>
                      <h3>Championship Display</h3>
                      <p>Immersive, big-screen competition results and standings.</p>
                      <span className="feature-link">
                        Open display <ArrowRight size={17} />
                      </span>
                    </button>
                  </div>
                </section>
                {!!schedule.length && (
                  <section className="section container">
                    <div className="section-head">
                      <div>
                        <div className="eyebrow">SCHEDULE</div>
                        <h2>Competition timetable</h2>
                        <p>Key sessions for the {competition.year} championship.</p>
                      </div>
                    </div>
                    <div className="schedule-list">
                      {schedule.map((ev) => (
                        <div className="schedule-item" key={ev.id}>
                          <div>
                            <strong>{ev.title}</strong>
                            <p>{ev.description}</p>
                          </div>
                          <div className="schedule-meta">
                            <span>{ev.starts_at ? new Date(ev.starts_at).toLocaleString() : 'TBA'}</span>
                            <small>{ev.location || competition.venue || 'Venue TBA'}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <section className="cta-section container">
                  <div>
                    <div className="eyebrow light">LEARNING THROUGH COMPETITION</div>
                    <h2>
                      Excellence starts with <em>curiosity.</em>
                    </h2>
                    <p>Celebrating the ambition, determination and incredible potential of every competing student.</p>
                  </div>
                  <Trophy size={118} strokeWidth={0.8} />
                </section>
              </>
            )}

            {view === 'live' && (
              <div className="container page">
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      <Radio size={15} /> LIVE COMPETITION COVERAGE
                    </div>
                    <h1>Championship leaderboard</h1>
                    <p>Real-time standings, live scores and the race to qualification.</p>
                  </div>
                  <button className="outline-btn" onClick={() => setView('display')}>
                    <Monitor size={18} /> Open full-screen display
                  </button>
                </div>
                <div className="selector-row">
                  <label>
                    Category{' '}
                    <select value={category} onChange={(e) => chooseCategory(e.target.value)}>
                      {categories.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Group{' '}
                    <select value={currentGroup?.id || ''} onChange={(e) => setGroupId(e.target.value)}>
                      {selectedGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} · {g.stage}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className={'connection ' + (connection === 'live' ? 'online' : '')}>
                    {connection === 'live' ? <Wifi size={16} /> : connection === 'demo' ? <CircleHelp size={16} /> : <WifiOff size={16} />}{' '}
                    {connection === 'demo' ? 'Preview data' : connection === 'live' ? 'Live connection' : connection === 'connecting' ? 'Connecting...' : 'Disconnected'}
                  </span>
                </div>
                <Leaderboard
                  teams={currentTeams}
                  group={currentGroup}
                  competition={competition}
                  category={activeCategory?.name || ''}
                  rules={rules}
                  prevRanks={prevRanks}
                />
                <div className="hint">
                  <Shield size={17} /> Scores are provisional until the group results have been finalized by an administrator.
                </div>
              </div>
            )}

            {view === 'schools' && (
              <div className="container page">
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">OUR PARTICIPANTS</div>
                    <h1>Competing schools</h1>
                    <p>Meet the talented schools taking part in the championship.</p>
                  </div>
                </div>
                <div className="school-grid">
                  {(schools.length
                    ? schools
                    : Object.values(teams)
                        .flat()
                        .filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i)
                        .map((t) => ({ id: t.id, name: t.name, short_name: t.short_name, logo_url: t.logo_url }))
                  ).map((t) => (
                    <div className="school-card" key={t.id}>
                      <div className="school-logo">{t.logo_url ? <img src={t.logo_url} alt="" /> : <GraduationCap size={25} />}</div>
                      <div>
                        <h3>{t.name}</h3>
                        <small>{'city' in t && t.city ? t.city : 'Registered participant'}</small>
                      </div>
                      <Check size={18} className="school-check" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'results' && (
              <ResultsArchive competition={competition} categories={categories} groups={groups} teams={teams} rules={rules} />
            )}

            {view === 'display' && (
              <div className="display-screen">
                <div className="display-top">
                  <Brand competition={competition} small />
                  <div className="display-topright">
                    <span className="display-year">{competition.year} CHAMPIONSHIP</span>
                    <button onClick={() => setView('live')}>
                      <X size={22} />
                    </button>
                  </div>
                </div>
                <div className="display-heading">
                  <div className="eyebrow light">
                    <span className="pulse-dot" /> LIVE SCOREBOARD
                  </div>
                  <h1>{activeCategory?.name || 'Championship'}</h1>
                  <p>
                    {currentGroup?.stage || 'Opening Round'} <span>•</span> {currentGroup?.name || 'Group A'}
                  </p>
                </div>
                <div className="display-ranking">
                  <Leaderboard
                    teams={currentTeams}
                    group={currentGroup}
                    competition={competition}
                    category={activeCategory?.name || ''}
                    rules={rules}
                    prevRanks={prevRanks}
                    compact
                  />
                </div>
                <div className="display-bottom">
                  <span>KNOWLEDGE · EXCELLENCE · VICTORY</span>
                  <span>{currentGroup?.status === 'final' ? 'OFFICIAL RESULTS' : 'PROVISIONAL SCORES'}</span>
                </div>
              </div>
            )}
          </motion.main>
        </AnimatePresence>
      )}
      {view !== 'display' && (
        <footer className="footer">
          <div className="container footer-inner">
            <Brand competition={competition} small />
            <span>
              © {competition.year} {competition.short_title}. All rights reserved.
            </span>
            <span>Made for the next generation of champions.</span>
          </div>
        </footer>
      )}
      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Competition branding</h2>
              <button aria-label="Close" onClick={() => setSettingsOpen(false)}>
                <X />
              </button>
            </div>
            <form onSubmit={saveBrand} className="brand-form">
              <label>
                Official competition title
                <input value={competition.title} onChange={(e) => setCompetition((c) => ({ ...c, title: e.target.value }))} required />
              </label>
              <label>
                Short title
                <input value={competition.short_title} onChange={(e) => setCompetition((c) => ({ ...c, short_title: e.target.value }))} required />
              </label>
              <label>
                Tagline / slogan
                <input
                  value={competition.slogan || competition.tagline}
                  onChange={(e) => setCompetition((c) => ({ ...c, slogan: e.target.value, tagline: e.target.value }))}
                />
              </label>
              <label>
                Organizer
                <input value={competition.organizer || ''} onChange={(e) => setCompetition((c) => ({ ...c, organizer: e.target.value }))} />
              </label>
              <label>
                Venue
                <input value={competition.venue || ''} onChange={(e) => setCompetition((c) => ({ ...c, venue: e.target.value }))} />
              </label>
              <label>
                Year
                <input type="number" value={competition.year} onChange={(e) => setCompetition((c) => ({ ...c, year: Number(e.target.value) }))} />
              </label>
              <label>
                Competition logo URL
                <input type="url" placeholder="https://..." value={competition.logo_url || ''} onChange={(e) => setCompetition((c) => ({ ...c, logo_url: e.target.value }))} />
              </label>
              <label>
                Organizer logo URL
                <input
                  type="url"
                  placeholder="https://..."
                  value={competition.organizer_logo_url || ''}
                  onChange={(e) => setCompetition((c) => ({ ...c, organizer_logo_url: e.target.value }))}
                />
              </label>
              <label>
                Brand accent colour
                <input type="color" value={competition.primary_color} onChange={(e) => setCompetition((c) => ({ ...c, primary_color: e.target.value }))} />
              </label>
              <label>
                Secondary colour
                <input
                  type="color"
                  value={competition.secondary_color || '#0F2040'}
                  onChange={(e) => setCompetition((c) => ({ ...c, secondary_color: e.target.value }))}
                />
              </label>
              <button className="primary-btn" type="submit">
                <Check size={16} /> Save branding
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-icon">{icon}</div>
      <div>
        <strong>{value.toLocaleString()}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Leaderboard({
  teams,
  group,
  competition,
  category,
  rules,
  prevRanks,
  compact = false,
}: {
  teams: Team[];
  group?: Group;
  competition: Competition;
  category: string;
  rules: ScoringRules;
  prevRanks: React.MutableRefObject<Record<string, number>>;
  compact?: boolean;
}) {
  const quota = qualificationQuota(teams.length, rules, group?.stage);
  const ranks: Record<string, number> = {};
  teams.forEach((t, i) => {
    ranks[t.id] = i;
  });

  useEffect(() => {
    prevRanks.current = ranks;
  });

  return (
    <div className={'board ' + (compact ? 'board-compact' : '')}>
      <div className="board-head">
        <div className="board-head-title">
          <div className="board-symbol">
            <Trophy size={22} />
          </div>
          <div>
            <h2>
              {group?.name || 'Group'} <span>·</span> {group?.stage || 'Opening Round'}
            </h2>
            <p>
              {category} · {competition.year} Championship
            </p>
          </div>
        </div>
        <div className={'round-status ' + (group?.status === 'live' ? 'status-live' : '')}>
          <span className="status-dot" />
          {group?.status === 'final' ? 'FINAL RESULTS' : group?.status === 'live' ? 'LIVE NOW' : 'SCHEDULED'}
        </div>
      </div>
      <div className="board-labels">
        <span>RANK / SCHOOL</span>
        <span>SCORE</span>
      </div>
      <div className="board-list">
        {teams.length ? (
          teams.map((t, i) => {
            const prev = prevRanks.current[t.id];
            const overtook = typeof prev === 'number' && prev > i;
            const dropped = typeof prev === 'number' && prev < i;
            return (
              <motion.div
                layout
                key={t.id}
                transition={{ type: 'spring', stiffness: 250, damping: 27 }}
                className={
                  'rank-row ' +
                  (i === 0 ? 'rank-first ' : '') +
                  (group?.status === 'final' && i < quota ? 'rank-qualified ' : '') +
                  (overtook ? 'rank-overtake ' : '') +
                  (dropped ? 'rank-drop ' : '')
                }
              >
                <div className="rank-position">{i === 0 ? <Crown size={21} fill="currentColor" /> : String(i + 1).padStart(2, '0')}</div>
                <div className="team-emblem">{t.logo_url ? <img src={t.logo_url} alt="" /> : <GraduationCap size={compact ? 22 : 21} />}</div>
                <div className="rank-school">
                  <strong>{t.short_name || t.name}</strong>
                  <span>
                    {group?.status === 'final'
                      ? group.stage === 'Final'
                        ? i === 0
                          ? 'CHAMPION'
                          : i === 1
                            ? 'FIRST RUNNER-UP'
                            : i === 2
                              ? 'SECOND RUNNER-UP'
                              : 'FINALIST'
                        : i < quota
                          ? 'QUALIFIED'
                          : 'ELIMINATED'
                      : overtook
                        ? 'MOVING UP'
                        : i === 0
                          ? 'CURRENT LEADER'
                          : i < quota
                            ? 'QUALIFYING ZONE'
                            : t.name}
                  </span>
                </div>
                {i === 0 && (
                  <span className="leader-tag">
                    <Medal size={13} /> LEADER
                  </span>
                )}
                <motion.strong key={t.score} initial={{ scale: 1.18, color: '#d5ac5c' }} animate={{ scale: 1, color: 'currentColor' }} className="rank-score">
                  {t.score}
                </motion.strong>
              </motion.div>
            );
          })
        ) : (
          <div className="empty-board">No teams are registered in this group yet.</div>
        )}
      </div>
      <div className="board-foot">
        <div>
          <Shield size={15} /> {group?.status === 'final' ? 'Official finalized results' : 'Live scores subject to verification'}
        </div>
        <div>
          <span className="tiny-green" />
          {teams.length} TEAMS · TOP {quota} QUALIFY
        </div>
      </div>
    </div>
  );
}

export default App;
