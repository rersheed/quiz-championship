import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Division, Group } from '../data';

type Props = {
  supabase: SupabaseClient | null;
  competitionId: string;
  categories: Division[];
  setCategories: React.Dispatch<React.SetStateAction<Division[]>>;
  groups: Group[];
  setNotice: (v: string) => void;
  refreshAll: () => Promise<void>;
};

export default function CategoriesCrud({
  supabase,
  competitionId,
  categories,
  setCategories,
  groups,
  setNotice,
  refreshAll,
}: Props) {
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!supabase) {
      if (editId) {
        setCategories((prev) => prev.map((c) => (c.id === editId ? { ...c, name: name.trim() } : c)));
      } else {
        setCategories((prev) => [
          ...prev,
          { id: name.toLowerCase().replace(/\s+/g, '-'), name: name.trim(), competition_id: competitionId },
        ]);
      }
      setName('');
      setEditId(null);
      return setNotice(editId ? 'Category updated in demo mode.' : 'Category added in demo mode.');
    }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_category', {
      p_id: editId,
      p_competition_id: competitionId,
      p_name: name.trim(),
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(editId ? 'Category updated.' : 'Category created.');
      setName('');
      setEditId(null);
      await refreshAll();
    }
  };

  const remove = async (c: Division) => {
    const count = groups.filter((g) => g.category_id === c.id).length;
    if (!window.confirm(count ? `${c.name} has ${count} group(s). Delete only if empty of groups/schools.` : `Delete category ${c.name}?`)) return;
    if (!supabase) {
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      return;
    }
    const { error } = await supabase.rpc('delete_category', { p_category_id: c.id });
    if (error) setNotice(error.message);
    else {
      setNotice('Category deleted.');
      await refreshAll();
    }
  };

  return (
    <div className="admin-panel">
      <h2>Categories</h2>
      <p>Each category keeps independent schools, groups, scores and champions.</p>
      <form className="inline-form" onSubmit={save} style={{ gridTemplateColumns: '1fr auto auto' }}>
        <input required placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary-btn" disabled={busy} type="submit">
          {editId ? 'Save' : 'Add category'}
        </button>
        {editId && (
          <button
            className="outline-btn"
            type="button"
            onClick={() => {
              setEditId(null);
              setName('');
            }}
          >
            Cancel
          </button>
        )}
      </form>
      <div className="group-admin-grid">
        {categories.map((c) => (
          <div className="group-admin-card" key={c.id}>
            <strong>{c.name}</strong>
            <small>{groups.filter((g) => g.category_id === c.id).length} groups</small>
            <div className="quick-actions">
              <button
                className="outline-btn small"
                type="button"
                onClick={() => {
                  setEditId(c.id);
                  setName(c.name);
                }}
              >
                Edit
              </button>
              <button className="outline-btn small" type="button" onClick={() => void remove(c)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
