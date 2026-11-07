import { useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScoringRules } from '../data';
import { type BonusType } from './scoring';

type Props = {
  supabase: SupabaseClient | null;
  competitionId: string;
  categories: { id: string; name: string }[];
  rules: ScoringRules;
  setRules: React.Dispatch<React.SetStateAction<ScoringRules>>;
  role: string | null;
  setNotice: (v: string) => void;
};

export default function ScoringConfig({ supabase, competitionId, categories, rules, setRules, role, setNotice }: Props) {
  const canEdit = !supabase || role === 'super_admin' || role === 'admin';
  const [bonuses, setBonuses] = useState<BonusType[]>([]);
  const [bonusName, setBonusName] = useState('');
  const [bonusPoints, setBonusPoints] = useState(2);
  const [bonusDesc, setBonusDesc] = useState('');
  const [scopeCategory, setScopeCategory] = useState('');
  const [scopeStage, setScopeStage] = useState('');
  const [busy, setBusy] = useState(false);
  const [audits, setAudits] = useState<{ id: number; change_summary: string; payload: Record<string, unknown>; created_at: string }[]>([]);
  const [reason, setReason] = useState('');

  const loadBonuses = async () => {
    if (!supabase || competitionId === 'demo') {
      setBonuses([
        { id: 'b1', competition_id: 'demo', name: 'Bonus Question', points: 2, active: true, sort_order: 1, description: 'Extra marks' },
        { id: 'b2', competition_id: 'demo', name: 'Speed Bonus', points: 3, active: true, sort_order: 2 },
        { id: 'b3', competition_id: 'demo', name: 'Special Question', points: 5, active: true, sort_order: 3 },
      ]);
      setAudits([]);
      return;
    }
    const [bonusRes, auditRes] = await Promise.all([
      supabase.from('bonus_types').select('*').eq('competition_id', competitionId).order('sort_order'),
      supabase.from('scoring_config_audits').select('id,change_summary,payload,created_at').eq('competition_id', competitionId).order('created_at', { ascending: false }).limit(20),
    ]);
    if (bonusRes.error) setNotice(bonusRes.error.message);
    else setBonuses((bonusRes.data || []) as BonusType[]);
    if (auditRes.data) setAudits(auditRes.data as typeof audits);
  };

  useEffect(() => {
    void loadBonuses();
  }, [supabase, competitionId]);

  const saveRules = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setNotice('Scorekeepers cannot change scoring configuration.');
      return;
    }
    if (!supabase) {
      setNotice('Scoring configuration saved in demo mode.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('scoring_rules')
      .update({
        correct_points: rules.correct_points,
        incorrect_penalty: rules.incorrect_penalty,
        score_step: rules.correct_points,
        max_adjustment: rules.max_adjustment,
        opening_group_size: rules.opening_group_size,
        opening_qualify: rules.opening_qualify,
        semifinal_size: rules.semifinal_size,
        semifinal_qualify: rules.semifinal_qualify,
        final_size: rules.final_size,
        tie_break_rule: rules.tie_break_rule,
      })
      .eq('id', rules.id);
    if (!error) {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (uid) {
        await supabase.from('scoring_config_audits').insert({
          competition_id: competitionId,
          actor_id: uid,
          change_summary: reason.trim() || 'Updated scoring rules',
          payload: {
            correct_points: rules.correct_points,
            incorrect_penalty: rules.incorrect_penalty,
            max_adjustment: rules.max_adjustment,
            reason: reason.trim() || null,
          },
        });
      }
    }
    setBusy(false);
    setReason('');
    setNotice(error ? error.message : 'Scoring configuration saved.');
    await loadBonuses();
  };

  const addBonus = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit || !bonusName.trim()) return;
    if (!supabase) {
      setBonuses((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          competition_id: competitionId,
          category_id: scopeCategory || null,
          name: bonusName.trim(),
          points: bonusPoints,
          description: bonusDesc || null,
          active: true,
          sort_order: prev.length + 1,
        },
      ]);
      setBonusName('');
      setBonusDesc('');
      setNotice('Bonus type added in demo mode.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('bonus_types').insert({
      competition_id: competitionId,
      category_id: scopeCategory || null,
      stage: scopeStage || null,
      name: bonusName.trim(),
      points: bonusPoints,
      description: bonusDesc || null,
      active: true,
      sort_order: bonuses.length + 1,
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setBonusName('');
      setBonusDesc('');
      setNotice('Bonus type created.');
      await loadBonuses();
    }
  };

  const toggleBonus = async (bonus: BonusType) => {
    if (!canEdit) return;
    if (!supabase) {
      setBonuses((prev) => prev.map((b) => (b.id === bonus.id ? { ...b, active: !b.active } : b)));
      return;
    }
    const { error } = await supabase.from('bonus_types').update({ active: !bonus.active }).eq('id', bonus.id);
    if (error) setNotice(error.message);
    else await loadBonuses();
  };

  const removeBonus = async (id: string) => {
    if (!canEdit) return;
    if (!supabase) {
      setBonuses((prev) => prev.filter((b) => b.id !== id));
      return;
    }
    const { error } = await supabase.from('bonus_types').delete().eq('id', id);
    if (error) setNotice(error.message);
    else await loadBonuses();
  };

  if (!canEdit) {
    return (
      <div className="admin-panel">
        <h2>Scoring Configuration</h2>
        <p>Only administrators can change scoring rules. Scorekeepers may apply approved actions in Live Scoring.</p>
      </div>
    );
  }

  return (
    <div className="config-grid">
      <div className="admin-panel">
        <h2>A. Standard scoring</h2>
        <p>Effective values are resolved server-side. Live groups lock a snapshot when they go live so past actions keep their meaning.</p>
        <div className="config-banner">
          <span>Preview Correct +{rules.correct_points ?? rules.score_step}</span>
          <span>{(rules.incorrect_penalty ?? 0) > 0 ? `Penalty −${rules.incorrect_penalty}` : 'No penalty'}</span>
          <span>Max ±{rules.max_adjustment}</span>
        </div>
        <form className="config-form" onSubmit={saveRules}>
          <label>
            Correct answer marks
            <input
              type="number"
              min={1}
              max={100}
              value={rules.correct_points ?? rules.score_step}
              onChange={(e) =>
                setRules((r) => ({
                  ...r,
                  correct_points: Number(e.target.value),
                  score_step: Number(e.target.value),
                }))
              }
            />
          </label>
          <label>
            Incorrect answer penalty
            <input
              type="number"
              min={0}
              max={100}
              value={rules.incorrect_penalty ?? 0}
              onChange={(e) => setRules((r) => ({ ...r, incorrect_penalty: Number(e.target.value) }))}
            />
          </label>
          <small style={{ color: '#6b7a90' }}>Use 0 for no penalty. Live Scoring will show “No penalty” instead of −0.</small>
          <label>
            Max adjustment per action
            <input
              type="number"
              min={1}
              max={100}
              value={rules.max_adjustment}
              onChange={(e) => setRules((r) => ({ ...r, max_adjustment: Number(e.target.value) }))}
            />
          </label>
          <label>
            Reason for change
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional audit note" />
          </label>
          <button className="primary-btn" disabled={busy} type="submit">
            <Check size={16} /> Save scoring rules
          </button>
        </form>
      </div>

      <div className="admin-panel">
        <h2>B. Bonus marks</h2>
        <p>Scorekeepers pick from this list. Inactive bonuses are hidden from Live Scoring. Historical awards remain in the audit trail.</p>
        <form className="config-form" onSubmit={addBonus}>
          <label>
            Bonus name
            <input value={bonusName} onChange={(e) => setBonusName(e.target.value)} placeholder="Bonus Question" required />
          </label>
          <label>
            Points
            <input type="number" min={1} max={100} value={bonusPoints} onChange={(e) => setBonusPoints(Number(e.target.value))} />
          </label>
          <label>
            Category scope (optional)
            <select value={scopeCategory} onChange={(e) => setScopeCategory(e.target.value)}>
              <option value="">Entire competition</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stage scope (optional)
            <select value={scopeStage} onChange={(e) => setScopeStage(e.target.value)}>
              <option value="">Any stage</option>
              <option value="Opening Round">Opening Round</option>
              <option value="Semifinal">Semifinal</option>
              <option value="Final">Final</option>
            </select>
          </label>
          <label>
            Description
            <input value={bonusDesc} onChange={(e) => setBonusDesc(e.target.value)} placeholder="Optional" />
          </label>
          <button className="primary-btn" disabled={busy} type="submit">
            <Plus size={16} /> Add bonus type
          </button>
        </form>
        <div style={{ marginTop: 16 }}>
          {bonuses.map((b) => (
            <div className="bonus-admin-row" key={b.id}>
              <div>
                <strong>
                  {b.name} · +{b.points}
                </strong>
                <small style={{ display: 'block', color: '#6b7a90' }}>
                  {b.active ? 'Active' : 'Disabled'}
                  {b.category_id ? ' · category scoped' : ' · competition-wide'}
                  {b.description ? ` · ${b.description}` : ''}
                </small>
              </div>
              <div className="quick-actions">
                <button className="outline-btn small" type="button" onClick={() => toggleBonus(b)}>
                  {b.active ? 'Disable' : 'Enable'}
                </button>
                <button className="outline-btn small" type="button" onClick={() => removeBonus(b.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
        <h2>D. Audit history</h2>
        <p>Rule changes are recorded with actor, summary, payload and timestamp.</p>
        <div className="activity-list">
          {audits.map((a) => (
            <div className="activity-item" key={a.id}>
              <span>
                <strong>{a.change_summary}</strong>
                <small style={{ display: 'block', color: '#6b7a90' }}>{JSON.stringify(a.payload)}</small>
              </span>
              <span>{new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
          {!audits.length && <p className="empty-board">No configuration changes recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}
