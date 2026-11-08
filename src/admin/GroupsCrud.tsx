import { useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Division, Group, SchoolRecord, ScoringRules, Team } from '../data';

type Props = {
  supabase: SupabaseClient | null;
  competitionId: string;
  categories: Division[];
  category: string;
  chooseCategory: (id: string) => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  teams: Record<string, Team[]>;
  schools: SchoolRecord[];
  rules: ScoringRules;
  setNotice: (v: string) => void;
  refreshAll: () => Promise<void>;
};

const STAGES = ['Opening Round', 'Quarterfinal', 'Semifinal', 'Final'];
const STATUSES = ['scheduled', 'live', 'paused', 'final'] as const;

export default function GroupsCrud({
  supabase,
  competitionId,
  categories,
  category,
  chooseCategory,
  groups,
  setGroups,
  teams,
  schools,
  rules,
  setNotice,
  refreshAll,
}: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [stage, setStage] = useState('Opening Round');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('scheduled');
  const [capacity, setCapacity] = useState(rules.opening_group_size);
  const [assignGroupId, setAssignGroupId] = useState('');
  const [assignSchoolId, setAssignSchoolId] = useState('');
  const [busy, setBusy] = useState(false);

  const categoryGroups = useMemo(() => groups.filter((g) => g.category_id === category), [groups, category]);
  const categorySchools = useMemo(
    () => schools.filter((s) => (!s.category_id || s.category_id === category) && s.active !== false),
    [schools, category],
  );

  const reset = () => {
    setEditId(null);
    setName('');
    setStage('Opening Round');
    setStatus('scheduled');
    setCapacity(rules.opening_group_size);
  };

  const saveGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!supabase) {
      if (editId) {
        setGroups((prev) =>
          prev.map((g) => (g.id === editId ? { ...g, name: name.trim(), stage, status, capacity } : g)),
        );
      } else {
        setGroups((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            competition_id: competitionId,
            category_id: category,
            name: name.trim(),
            stage,
            status,
            capacity,
          },
        ]);
      }
      reset();
      return setNotice(editId ? 'Group updated in demo mode.' : 'Group created in demo mode.');
    }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_competition_group', {
      p_id: editId,
      p_competition_id: competitionId,
      p_category_id: category,
      p_name: name.trim(),
      p_stage: stage,
      p_status: status,
      p_capacity: capacity || null,
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(editId ? 'Group updated.' : 'Group created.');
      reset();
      await refreshAll();
    }
  };

  const allocateGroups = async () => {
    if (!supabase) return setNotice('Connect Supabase to allocate groups.');
    setBusy(true);
    const { data, error } = await supabase.rpc('allocate_opening_groups', {
      p_competition_id: competitionId,
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

  const removeGroup = async (g: Group) => {
    if (!window.confirm(`Delete ${g.name} (${g.stage})? Teams are unassigned; scoring history blocks delete.`)) return;
    if (!supabase) {
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      return;
    }
    const { error } = await supabase.rpc('delete_competition_group', { p_group_id: g.id });
    if (error) setNotice(error.message);
    else {
      setNotice('Group deleted.');
      await refreshAll();
    }
  };

  const assignTeam = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignGroupId || !assignSchoolId) return;
    if (!supabase) return setNotice('Team assignment requires Supabase.');
    setBusy(true);
    const { data: teamRow, error: teamErr } = await supabase
      .from('teams')
      .select('id')
      .eq('school_id', assignSchoolId)
      .eq('category_id', category)
      .maybeSingle();
    if (teamErr || !teamRow) {
      setBusy(false);
      return setNotice(teamErr?.message || 'No team found for that school in this category.');
    }
    const { error } = await supabase.rpc('assign_team_to_group', {
      p_group_id: assignGroupId,
      p_team_id: teamRow.id,
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice('Team assigned to group.');
      setAssignSchoolId('');
      await refreshAll();
    }
  };

  const removeTeam = async (groupId: string, teamId: string, teamName: string) => {
    if (!window.confirm(`Remove ${teamName} from this group?`)) return;
    if (!supabase) return setNotice('Requires Supabase.');
    const { error } = await supabase.rpc('remove_team_from_group', { p_group_id: groupId, p_team_id: teamId });
    if (error) setNotice(error.message);
    else {
      setNotice('Team removed.');
      await refreshAll();
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-hero-row">
        <div>
          <h2>Groups</h2>
          <p>Create or edit groups manually, auto-allocate opening rounds, and assign schools to groups.</p>
        </div>
        <button className="primary-btn" type="button" disabled={busy} onClick={() => void allocateGroups()}>
          Allocate opening groups
        </button>
      </div>

      <div className="admin-toolbar">
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

      <form className="config-form entity-form" onSubmit={saveGroup}>
        <div className="entity-form-grid">
          <label>
            Group name
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Group A" />
          </label>
          <label>
            Stage
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Capacity
            <input type="number" min={2} max={16} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </label>
        </div>
        <div className="quick-actions">
          <button className="primary-btn" disabled={busy} type="submit">
            {editId ? 'Save group' : 'Create group'}
          </button>
          {editId && (
            <button className="outline-btn" type="button" onClick={reset}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <form className="inline-form" onSubmit={assignTeam} style={{ gridTemplateColumns: '1fr 1fr auto' }}>
        <label>
          Assign to group
          <select required value={assignGroupId} onChange={(e) => setAssignGroupId(e.target.value)}>
            <option value="">Select group</option>
            {categoryGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} · {g.stage}
              </option>
            ))}
          </select>
        </label>
        <label>
          School
          <select required value={assignSchoolId} onChange={(e) => setAssignSchoolId(e.target.value)}>
            <option value="">Select school</option>
            {categorySchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-btn" disabled={busy} type="submit">
          Assign team
        </button>
      </form>

      <div className="group-admin-grid">
        {categoryGroups.map((g) => (
          <div className="group-admin-card" key={g.id}>
            <strong>
              {g.name} · {g.stage}
            </strong>
            <span className={'status-pill ' + g.status}>{g.status}</span>
            <small>
              {(teams[g.id] || []).length} teams{g.capacity ? ` / ${g.capacity}` : ''}
            </small>
            <ul className="entity-mini-list">
              {(teams[g.id] || []).map((t) => (
                <li key={t.id}>
                  <span>{t.short_name}</span>
                  {g.status === 'scheduled' && (
                    <button className="text-link" type="button" onClick={() => void removeTeam(g.id, t.id, t.name)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="quick-actions">
              <button
                className="outline-btn small"
                type="button"
                onClick={() => {
                  setEditId(g.id);
                  setName(g.name);
                  setStage(g.stage);
                  setStatus((STATUSES.includes(g.status as (typeof STATUSES)[number]) ? g.status : 'scheduled') as (typeof STATUSES)[number]);
                  setCapacity(g.capacity || rules.opening_group_size);
                }}
              >
                Edit
              </button>
              <button className="outline-btn small" type="button" onClick={() => void removeGroup(g)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {!categoryGroups.length && <p className="empty-board">No groups in this category yet.</p>}
      </div>
    </div>
  );
}
