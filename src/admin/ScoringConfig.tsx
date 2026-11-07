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
  const [busy, setBusy] = useState(false);

  const loadBonuses = async () => {
    if (!supabase || competitionId === 'demo') {
      setBonuses([
        { id: 'b1', competition_id: 'demo', name: 'Bonus Question', points: 2, active: true, sort_order: 1, description: 'Extra marks' },
        { id: 'b2', competition_id: 'demo', name: 'Speed Bonus', points: 3, active: true, sort_order: 2 },
        { id: 'b3', competition_id: 'demo', name: 'Special Question', points: 5, active: true, sort_order: 3 },
      ]);
      return;
    }
    const { data, error } = await supabase.from('bonus_types').select('*').eq('competition_id', competitionId).order('sort_order');
    if (error) setNotice(error.message);
    else setBonuses((data || []) as BonusType[]);
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
          change_summary: 'Updated scoring rules',
          payload: {
            correct_points: rules.correct_points,
            incorrect_penalty: rules.incorrect_penalty,
          },
        });
      }
    }
    setBusy(false);
    setNotice(error ? error.message : 'Scoring configuration saved.');
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
        <h2>Answer marks & penalties</h2>
        <p>These values power the Live Scoring buttons. The server resolves them — the browser cannot invent point amounts.</p>
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
          <button className="primary-btn" disabled={busy} type="submit">
            <Check size={16} /> Save scoring rules
          </button>
        </form>
      </div>

      <div className="admin-panel">
        <h2>Bonus mark types</h2>
        <p>Scorekeepers pick from this list. Inactive bonuses are hidden from Live Scoring.</p>
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
    </div>
  );
}
