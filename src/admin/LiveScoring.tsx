import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sorted, type Group, type ScoringRules, type Team } from '../data';
import {
  filterBonusesForContext,
  newRequestId,
  sourceLabel,
  type BonusType,
  type EffectiveScoringConfig,
  type ScoreEvent,
} from './scoring';

type Props = {
  supabase: SupabaseClient | null;
  competitionId: string;
  categories: { id: string; name: string }[];
  groups: Group[];
  teams: Record<string, Team[]>;
  setTeams: React.Dispatch<React.SetStateAction<Record<string, Team[]>>>;
  rules: ScoringRules;
  category: string;
  setCategory: (id: string) => void;
  groupId: string;
  setGroupId: (id: string) => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  role: string | null;
  setNotice: (v: string) => void;
  refreshAll: () => Promise<void>;
};

export default function LiveScoring({
  supabase,
  competitionId,
  categories,
  groups,
  teams,
  setTeams,
  rules,
  category,
  setCategory,
  groupId,
  setGroupId,
  setGroups,
  role,
  setNotice,
  refreshAll,
}: Props) {
  const [bonuses, setBonuses] = useState<BonusType[]>([]);
  const [config, setConfig] = useState<EffectiveScoringConfig>({
    correct_points: rules.correct_points ?? rules.score_step,
    incorrect_penalty: rules.incorrect_penalty ?? 0,
    score_step: rules.score_step,
    max_adjustment: rules.max_adjustment,
    source: 'competition_default',
  });
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [bonusOpenFor, setBonusOpenFor] = useState<string | null>(null);
  const [lastByTeam, setLastByTeam] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const categoryGroups = groups.filter((g) => g.category_id === category);
  const stages = [...new Set(categoryGroups.map((g) => g.stage))];
  const [stage, setStage] = useState(categoryGroups[0]?.stage || 'Opening Round');
  const stageGroups = categoryGroups.filter((g) => g.stage === stage);
  const currentGroup = groups.find((g) => g.id === groupId) || stageGroups[0];
  const ranking = sorted(teams[currentGroup?.id || ''] || []);
  const activeBonuses = useMemo(
    () => filterBonusesForContext(bonuses, competitionId, category, currentGroup?.stage),
    [bonuses, competitionId, category, currentGroup?.stage],
  );

  useEffect(() => {
    if (!stageGroups.length) return;
    if (!stageGroups.some((g) => g.id === groupId)) setGroupId(stageGroups[0].id);
  }, [stage, category, stageGroups, groupId, setGroupId]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!supabase || competitionId === 'demo') {
        setBonuses([
          { id: 'b1', competition_id: 'demo', name: 'Bonus Question', points: 2, active: true, sort_order: 1 },
          { id: 'b2', competition_id: 'demo', name: 'Speed Bonus', points: 3, active: true, sort_order: 2 },
          { id: 'b3', competition_id: 'demo', name: 'Special Question', points: 5, active: true, sort_order: 3 },
        ]);
        setConfig({
          correct_points: rules.correct_points ?? rules.score_step,
          incorrect_penalty: rules.incorrect_penalty ?? 0,
          score_step: rules.score_step,
          max_adjustment: rules.max_adjustment,
          source: 'competition_default',
        });
        return;
      }
      const [bonusRes, cfgRes, evRes] = await Promise.all([
        supabase.from('bonus_types').select('*').eq('competition_id', competitionId).order('sort_order'),
        supabase.rpc('resolve_scoring_config', {
          p_competition_id: competitionId,
          p_category_id: category,
          p_stage: currentGroup?.stage || null,
        }),
        currentGroup
          ? supabase
              .from('score_events')
              .select('id,group_id,team_id,delta,before_points,after_points,action_type,action_label,configured_points,created_at')
              .eq('group_id', currentGroup.id)
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] as ScoreEvent[] }),
      ]);
      if (!alive) return;
      if (bonusRes.data) setBonuses(bonusRes.data as BonusType[]);
      const snap = (currentGroup as Group & { scoring_snapshot?: EffectiveScoringConfig | null })?.scoring_snapshot;
      if (snap && typeof snap === 'object' && 'correct_points' in (snap as object)) {
        setConfig({ ...(snap as EffectiveScoringConfig), source: 'locked_snapshot' });
        setLocked(true);
      } else if (cfgRes.data?.[0]) {
        setConfig(cfgRes.data[0] as EffectiveScoringConfig);
        setLocked(false);
      }
      if (evRes.data) {
        setEvents(evRes.data as ScoreEvent[]);
        const map: Record<string, string> = {};
        for (const ev of evRes.data as ScoreEvent[]) {
          if (!map[ev.team_id]) {
            map[ev.team_id] = `${ev.action_label || ev.action_type || 'Update'} (${ev.delta > 0 ? '+' : ''}${ev.delta})`;
          }
        }
        setLastByTeam(map);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [supabase, competitionId, category, currentGroup?.id, currentGroup?.stage, rules]);

  const setStatus = async (status: 'scheduled' | 'live' | 'paused' | 'final') => {
    if (!currentGroup) return;
    if (!supabase) {
      setGroups((g) => g.map((x) => (x.id === currentGroup.id ? { ...x, status } : x)));
      return;
    }
    const { error } = await supabase.rpc('set_group_status', { p_group_id: currentGroup.id, p_status: status });
    if (error) setNotice(error.message);
    else {
      setNotice(`Group marked ${status}.`);
      await refreshAll();
    }
  };

  const applyAction = async (team: Team, action: 'correct' | 'incorrect' | 'bonus', bonusId?: string) => {
    if (!currentGroup) return;
    if (currentGroup.status === 'final') {
      setNotice('This group is finalized. Scoring is locked.');
      return;
    }
    if (currentGroup.status !== 'live') {
      setNotice('Group must be live before scoring.');
      return;
    }
    const key = `${team.id}:${action}:${bonusId || ''}`;
    if (busyKey) return;
    setBusyKey(key);
    setBonusOpenFor(null);

    if (!supabase) {
      let delta = 0;
      let label = '';
      if (action === 'correct') {
        delta = config.correct_points;
        label = 'Correct answer';
      } else if (action === 'incorrect') {
        if (!config.incorrect_penalty) {
          setNotice('No penalty is configured for incorrect answers.');
          setBusyKey(null);
          return;
        }
        delta = -config.incorrect_penalty;
        label = 'Incorrect answer';
      } else {
        const bonus = activeBonuses.find((b) => b.id === bonusId);
        if (!bonus) {
          setBusyKey(null);
          return;
        }
        if (bonus.points >= 5 && !window.confirm(`Award ${bonus.name} (+${bonus.points}) to ${team.short_name}?`)) {
          setBusyKey(null);
          return;
        }
        delta = bonus.points;
        label = bonus.name;
      }
      setTeams((prev) => ({
        ...prev,
        [currentGroup.id]: (prev[currentGroup.id] || []).map((t) =>
          t.id === team.id ? { ...t, score: Math.max(0, t.score + delta) } : t,
        ),
      }));
      setLastByTeam((m) => ({ ...m, [team.id]: `${label} (${delta > 0 ? '+' : ''}${delta})` }));
      setFlashId(team.id);
      setSaveMsg('Saved');
      window.setTimeout(() => setSaveMsg(''), 1200);
      setBusyKey(null);
      return;
    }

    if (action === 'bonus') {
      const bonus = activeBonuses.find((b) => b.id === bonusId);
      if (bonus && bonus.points >= 5 && !window.confirm(`Award ${bonus.name} (+${bonus.points}) to ${team.short_name}?`)) {
        setBusyKey(null);
        return;
      }
    }

    const requestId = newRequestId();
    const { data, error } = await supabase.rpc('apply_scoring_action', {
      p_group_id: currentGroup.id,
      p_team_id: team.id,
      p_action_type: action,
      p_bonus_type_id: bonusId || null,
      p_client_request_id: requestId,
    });
    if (error) {
      setNotice(error.message);
      await refreshAll();
    } else {
      setTeams((prev) => ({
        ...prev,
        [currentGroup.id]: (prev[currentGroup.id] || []).map((t) => (t.id === team.id ? { ...t, score: Number(data) } : t)),
      }));
      setFlashId(team.id);
      setSaveMsg('Saved');
      window.setTimeout(() => setSaveMsg(''), 1200);
      const { data: ev } = await supabase
        .from('score_events')
        .select('id,group_id,team_id,delta,before_points,after_points,action_type,action_label,configured_points,created_at')
        .eq('group_id', currentGroup.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (ev) {
        setEvents(ev as ScoreEvent[]);
        const latest = (ev as ScoreEvent[]).find((e) => e.team_id === team.id);
        if (latest) {
          setLastByTeam((m) => ({
            ...m,
            [team.id]: `${latest.action_label || latest.action_type} (${latest.delta > 0 ? '+' : ''}${latest.delta})`,
          }));
        }
      }
    }
    setBusyKey(null);
  };

  const canManageStatus = !supabase || role === 'super_admin' || role === 'admin';

  return (
    <div className="admin-panel">
      <div className="admin-hero-row">
        <div>
          <h2>Live Scoring</h2>
          <p>Award correct answers, penalties, and configured bonuses. Values are resolved securely on the server.</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <label>
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              const first = groups.find((g) => g.category_id === e.target.value);
              if (first) {
                setStage(first.stage);
                setGroupId(first.id);
              }
            }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stage
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              const first = categoryGroups.find((g) => g.stage === e.target.value);
              if (first) setGroupId(first.id);
            }}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Group
          <select value={currentGroup?.id || ''} onChange={(e) => setGroupId(e.target.value)}>
            {stageGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <span className={'status-pill ' + (currentGroup?.status || 'scheduled')}>{currentGroup?.status || 'scheduled'}</span>
        <span className="admin-chip">{ranking.length} schools</span>
      </div>

      <div className="config-banner">
        <span>Correct +{config.correct_points}</span>
        <span>{config.incorrect_penalty > 0 ? `Penalty −${config.incorrect_penalty}` : 'No penalty'}</span>
        <span>
          Bonus → {activeBonuses.slice(0, 3).map((b) => `${b.name} +${b.points}`).join(' · ') || 'none'}
        </span>
        <span>Rules: {locked ? 'Locked for this live group' : sourceLabel(config.source)}</span>
        {saveMsg && <span className="admin-chip live">{saveMsg}</span>}
      </div>

      {canManageStatus && (
        <div className="quick-actions" style={{ marginBottom: 16 }}>
          <button className="outline-btn small" type="button" onClick={() => setStatus('live')} disabled={currentGroup?.status === 'live'}>
            Go live
          </button>
          <button className="outline-btn small" type="button" onClick={() => setStatus('paused')} disabled={currentGroup?.status !== 'live'}>
            Pause
          </button>
          <button className="outline-btn small" type="button" onClick={() => setStatus('final')} disabled={currentGroup?.status === 'final'}>
            Finalize
          </button>
          {(currentGroup?.status === 'live' || currentGroup?.status === 'paused') && (
            <button
              className="outline-btn small"
              type="button"
              onClick={async () => {
                const reason = window.prompt('Documented reason required to refresh locked scoring rules for this live group:');
                if (!reason?.trim()) return;
                if (!supabase) {
                  setConfig({
                    correct_points: rules.correct_points ?? rules.score_step,
                    incorrect_penalty: rules.incorrect_penalty ?? 0,
                    score_step: rules.score_step,
                    max_adjustment: rules.max_adjustment,
                    source: 'competition_default',
                  });
                  setLocked(true);
                  setNotice('Demo: scoring snapshot refreshed.');
                  return;
                }
                const { data, error } = await supabase.rpc('relock_group_scoring', {
                  p_group_id: currentGroup.id,
                  p_reason: reason.trim(),
                });
                if (error) setNotice(error.message);
                else {
                  if (data) {
                    setConfig({
                      correct_points: Number(data.correct_points),
                      incorrect_penalty: Number(data.incorrect_penalty),
                      score_step: Number(data.score_step ?? data.correct_points),
                      max_adjustment: Number(data.max_adjustment ?? 100),
                      source: String(data.source || 'locked_snapshot'),
                    });
                    setLocked(true);
                  }
                  setNotice('Scoring rules relocked for this group.');
                  await refreshAll();
                }
              }}
            >
              Relock scoring (exception)
            </button>
          )}
        </div>
      )}

      <table className="score-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>School</th>
            <th>Score</th>
            <th>Last action</th>
            <th>Controls</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((t, i) => {
            const busy = busyKey?.startsWith(t.id);
            return (
              <tr key={t.id} className={'score-row ' + (flashId === t.id ? 'flash' : '')}>
                <td className="score-rank">{String(i + 1).padStart(2, '0')}</td>
                <td>
                  <div className="score-school">
                    {t.logo_url ? <img src={t.logo_url} alt="" /> : <span className="ph"><GraduationCap size={20} /></span>}
                    <div>
                      <strong>{t.short_name}</strong>
                      <small>{t.name}</small>
                    </div>
                  </div>
                </td>
                <td className="score-value">{t.score}</td>
                <td className="last-action">{lastByTeam[t.id] || '—'}</td>
                <td>
                  <div className="score-controls">
                    <button
                      className={'score-btn correct ' + (busy ? 'busy' : '')}
                      disabled={Boolean(busyKey) || currentGroup?.status !== 'live'}
                      onClick={() => applyAction(t, 'correct')}
                    >
                      {busy && busyKey === `${t.id}:correct:` ? <Loader2 className="spin" size={16} /> : `Correct +${config.correct_points}`}
                    </button>
                    {config.incorrect_penalty > 0 ? (
                      <button
                        className={'score-btn penalty ' + (busy ? 'busy' : '')}
                        disabled={Boolean(busyKey) || currentGroup?.status !== 'live'}
                        onClick={() => applyAction(t, 'incorrect')}
                      >
                        Penalty −{config.incorrect_penalty}
                      </button>
                    ) : (
                      <button className="score-btn penalty" disabled title="No penalty configured">
                        No penalty
                      </button>
                    )}
                    <div className="bonus-wrap">
                      <button
                        className="score-btn bonus"
                        disabled={Boolean(busyKey) || currentGroup?.status !== 'live' || !activeBonuses.length}
                        onClick={() => setBonusOpenFor(bonusOpenFor === t.id ? null : t.id)}
                      >
                        Bonus
                      </button>
                      {bonusOpenFor === t.id && (
                        <div className="bonus-menu">
                          {activeBonuses.map((b) => (
                            <button key={b.id} type="button" onClick={() => applyAction(t, 'bonus', b.id)}>
                              <span>{b.name}</span>
                              <strong>+{b.points}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!ranking.length && <div className="empty-board">No schools in this group yet.</div>}

      <div style={{ marginTop: 22 }}>
        <h3>Recent scoring activity</h3>
        <p style={{ color: '#6b7a90', fontSize: 12, marginTop: 0 }}>
          Administrators can undo the latest action for a team (applies the inverse adjustment as a correction).
        </p>
        <div className="activity-list">
          {events.map((ev, index) => {
            const team = ranking.find((t) => t.id === ev.team_id) || Object.values(teams).flat().find((t) => t.id === ev.team_id);
            const canUndo = canManageStatus && index === 0 && currentGroup && currentGroup.status !== 'final' && ev.action_type !== 'correction';
            return (
              <div className="activity-item" key={ev.id}>
                <span>
                  <strong>{team?.short_name || 'Team'}</strong> · {ev.action_label || ev.action_type} ({ev.delta > 0 ? '+' : ''}
                  {ev.delta})
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {ev.before_points} → {ev.after_points}
                  {canUndo && (
                    <button
                      className="outline-btn small"
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={async () => {
                        if (!currentGroup || !window.confirm(`Undo ${ev.action_label || 'this action'} for ${team?.short_name || 'team'}?`)) return;
                        setBusyKey(`undo:${ev.id}`);
                        if (!supabase) {
                          setTeams((prev) => ({
                            ...prev,
                            [currentGroup.id]: (prev[currentGroup.id] || []).map((t) =>
                              t.id === ev.team_id ? { ...t, score: Math.max(0, t.score - ev.delta) } : t,
                            ),
                          }));
                          setBusyKey(null);
                          return;
                        }
                        const { error } = await supabase.rpc('adjust_score', {
                          p_group_id: currentGroup.id,
                          p_team_id: ev.team_id,
                          p_delta: -ev.delta,
                        });
                        if (error) setNotice(error.message);
                        else {
                          setNotice('Correction applied.');
                          await refreshAll();
                          const { data: evs } = await supabase
                            .from('score_events')
                            .select('id,group_id,team_id,delta,before_points,after_points,action_type,action_label,configured_points,created_at')
                            .eq('group_id', currentGroup.id)
                            .order('created_at', { ascending: false })
                            .limit(20);
                          if (evs) setEvents(evs as ScoreEvent[]);
                        }
                        setBusyKey(null);
                      }}
                    >
                      Undo
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {!events.length && <p className="empty-board">No scoring events for this group yet.</p>}
        </div>
      </div>
    </div>
  );
}
