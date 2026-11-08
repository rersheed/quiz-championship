import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateProgressionMath, type Division, type Group, type ScoringRules } from '../data';
import { planStageMath } from '../lib/csv';

type Template = {
  id: string;
  stage_name: string;
  stage_order: number;
  group_size: number;
  groups_count: number;
  qualify_per_group: number;
  advance_total: number;
  allocation_method?: string;
  category_id?: string | null;
};

type Props = {
  supabase: SupabaseClient | null;
  competitionId: string;
  categories: Division[];
  category: string;
  chooseCategory: (id: string) => void;
  groups: Group[];
  rules: ScoringRules;
  currentGroup?: Group;
  setNotice: (v: string) => void;
  refreshAll: () => Promise<void>;
};

export default function RoundsCrud({
  supabase,
  competitionId,
  categories,
  category,
  chooseCategory,
  groups,
  rules,
  currentGroup,
  setNotice,
  refreshAll,
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [incomingTeams, setIncomingTeams] = useState(16);
  const [planGroupSize, setPlanGroupSize] = useState(8);
  const [planQualify, setPlanQualify] = useState(5);
  const [sourceStage, setSourceStage] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [stageName, setStageName] = useState('');
  const [stageOrder, setStageOrder] = useState(1);
  const [groupSize, setGroupSize] = useState(8);
  const [groupsCount, setGroupsCount] = useState(2);
  const [qualify, setQualify] = useState(5);
  const [allocation, setAllocation] = useState('random');
  const [busy, setBusy] = useState(false);

  const openingGroups = groups.filter((g) => g.category_id === category && g.stage === 'Opening Round');
  const mathErrors = useMemo(() => validateProgressionMath(rules, Math.max(openingGroups.length, 1)), [rules, openingGroups.length]);
  const stagePlan = useMemo(() => planStageMath(incomingTeams, planGroupSize, planQualify), [incomingTeams, planGroupSize, planQualify]);
  const categoryStages = useMemo(() => [...new Set(groups.filter((g) => g.category_id === category).map((g) => g.stage))], [groups, category]);
  const advanceTotal = groupsCount * qualify;

  const loadTemplates = async () => {
    if (!supabase || competitionId === 'demo') {
      setTemplates([
        { id: 't1', stage_name: 'Opening Round', stage_order: 1, group_size: 8, groups_count: 2, qualify_per_group: 3, advance_total: 6 },
        { id: 't2', stage_name: 'Semifinal', stage_order: 2, group_size: 6, groups_count: 1, qualify_per_group: 4, advance_total: 4 },
        { id: 't3', stage_name: 'Final', stage_order: 3, group_size: 4, groups_count: 1, qualify_per_group: 3, advance_total: 3 },
      ]);
      return;
    }
    const { data } = await supabase
      .from('stage_templates')
      .select('id,stage_name,stage_order,group_size,groups_count,qualify_per_group,advance_total,allocation_method,category_id')
      .eq('competition_id', competitionId)
      .order('stage_order');
    if (data) setTemplates(data);
  };

  useEffect(() => {
    void loadTemplates();
  }, [supabase, competitionId]);

  const resetForm = () => {
    setEditId(null);
    setStageName('');
    setStageOrder(templates.length + 1);
    setGroupSize(8);
    setGroupsCount(2);
    setQualify(5);
    setAllocation('random');
  };

  const saveTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!stageName.trim()) return;
    if (!supabase) {
      if (editId) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editId
              ? {
                  ...t,
                  stage_name: stageName.trim(),
                  stage_order: stageOrder,
                  group_size: groupSize,
                  groups_count: groupsCount,
                  qualify_per_group: qualify,
                  advance_total: advanceTotal,
                  allocation_method: allocation,
                }
              : t,
          ),
        );
      } else {
        setTemplates((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            stage_name: stageName.trim(),
            stage_order: stageOrder,
            group_size: groupSize,
            groups_count: groupsCount,
            qualify_per_group: qualify,
            advance_total: advanceTotal,
            allocation_method: allocation,
          },
        ]);
      }
      resetForm();
      return setNotice('Template saved in demo mode.');
    }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_stage_template', {
      p_id: editId,
      p_competition_id: competitionId,
      p_category_id: category || null,
      p_stage_name: stageName.trim(),
      p_stage_order: stageOrder,
      p_group_size: groupSize,
      p_groups_count: groupsCount,
      p_qualify_per_group: qualify,
      p_advance_total: advanceTotal,
      p_allocation_method: allocation,
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(editId ? 'Template updated.' : 'Template created.');
      resetForm();
      await loadTemplates();
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!window.confirm('Delete this stage template?')) return;
    if (!supabase) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    const { error } = await supabase.rpc('delete_stage_template', { p_template_id: id });
    if (error) setNotice(error.message);
    else {
      setNotice('Template deleted.');
      await loadTemplates();
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
    <div className="admin-panel">
      <div className="admin-hero-row">
        <div>
          <h2>Competition rounds</h2>
          <p>Manage stage templates (CRUD), plan progression math, and create stages.</p>
        </div>
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
      </div>

      <div className="admin-toolbar">
        <label>
          Incoming teams
          <input type="number" min={2} value={incomingTeams} onChange={(e) => setIncomingTeams(Number(e.target.value))} />
        </label>
        <label>
          Group size
          <input type="number" min={2} value={planGroupSize} onChange={(e) => setPlanGroupSize(Number(e.target.value))} />
        </label>
        <label>
          Qualify per group
          <input type="number" min={1} value={planQualify} onChange={(e) => setPlanQualify(Number(e.target.value))} />
        </label>
      </div>
      <div className={stagePlan.valid ? 'math-ok' : 'math-warning'}>
        <p>{stagePlan.message}</p>
      </div>
      {mathErrors.length ? (
        <div className="math-warning">
          {mathErrors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      ) : (
        <div className="math-ok">
          Default opening→semifinal path is valid for {openingGroups.length} opening group(s) with current rules.
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>Stage template editor</h3>
      <form className="config-form entity-form" onSubmit={saveTemplate}>
        <div className="entity-form-grid">
          <label>
            Stage name
            <input required value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Quarterfinal" />
          </label>
          <label>
            Order
            <input type="number" min={1} value={stageOrder} onChange={(e) => setStageOrder(Number(e.target.value))} />
          </label>
          <label>
            Group size
            <input type="number" min={2} value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} />
          </label>
          <label>
            Groups count
            <input type="number" min={1} value={groupsCount} onChange={(e) => setGroupsCount(Number(e.target.value))} />
          </label>
          <label>
            Qualify / group
            <input type="number" min={1} value={qualify} onChange={(e) => setQualify(Number(e.target.value))} />
          </label>
          <label>
            Advance total
            <input type="number" value={advanceTotal} readOnly />
          </label>
          <label>
            Allocation
            <select value={allocation} onChange={(e) => setAllocation(e.target.value)}>
              <option value="random">Random</option>
              <option value="seeded">Seeded</option>
              <option value="manual">Manual</option>
            </select>
          </label>
        </div>
        <div className="quick-actions">
          <button className="primary-btn" disabled={busy} type="submit">
            {editId ? 'Save template' : 'Add template'}
          </button>
          {editId && (
            <button className="outline-btn" type="button" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <div className="group-admin-grid">
        {templates.map((t) => (
          <div className="group-admin-card" key={t.id}>
            <strong>{t.stage_name}</strong>
            <small>
              {t.groups_count} × {t.group_size} · top {t.qualify_per_group} → {t.advance_total}
            </small>
            <label style={{ fontSize: 11, fontWeight: 800 }}>
              Source stage (optional)
              <select value={sourceStage} onChange={(e) => setSourceStage(e.target.value)}>
                <option value="">Unassigned teams</option>
                {categoryStages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="quick-actions">
              <button
                className="primary-btn"
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`Create ${t.stage_name} for this category using the template math?`)) return;
                  if (!supabase) return setNotice('Stage creation requires Supabase.');
                  setBusy(true);
                  const { data, error } = await supabase.rpc('create_stage_from_template', {
                    p_competition_id: competitionId,
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
              <button
                className="outline-btn small"
                type="button"
                onClick={() => {
                  setEditId(t.id);
                  setStageName(t.stage_name);
                  setStageOrder(t.stage_order);
                  setGroupSize(t.group_size);
                  setGroupsCount(t.groups_count);
                  setQualify(t.qualify_per_group);
                  setAllocation(t.allocation_method || 'random');
                }}
              >
                Edit
              </button>
              <button className="outline-btn small" type="button" onClick={() => void deleteTemplate(t.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="quick-actions" style={{ marginTop: 18 }}>
        <button
          className="outline-btn"
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Create semifinal from finalized opening groups?')) void advance('semi');
          }}
        >
          Legacy: opening → semifinal
        </button>
        <button
          className="outline-btn"
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Create grand final from finalized semifinal?')) void advance('final');
          }}
        >
          Legacy: semifinal → final
        </button>
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
              else {
                setNotice('Results approved for public official display.');
                await refreshAll();
              }
            }}
          >
            Approve official results
          </button>
        )}
      </div>
      <p style={{ marginTop: 14 }}>
        Current group: {currentGroup?.name || '—'} ({currentGroup?.status || '—'})
      </p>
    </div>
  );
}
