import { useMemo, useState, type FormEvent } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Division, SchoolRecord } from '../data';
import { parseSchoolCsv } from '../lib/csv';
import ImageField from './ImageField';

type Props = {
  supabase: SupabaseClient | null;
  competitionId: string;
  categories: Division[];
  category: string;
  chooseCategory: (id: string) => void;
  schools: SchoolRecord[];
  setSchools: React.Dispatch<React.SetStateAction<SchoolRecord[]>>;
  setNotice: (v: string) => void;
  refreshAll: () => Promise<void>;
};

export default function SchoolsCrud({
  supabase,
  competitionId,
  categories,
  category,
  chooseCategory,
  schools,
  setSchools,
  setNotice,
  refreshAll,
}: Props) {
  const [schoolName, setSchoolName] = useState('');
  const [schoolShort, setSchoolShort] = useState('');
  const [schoolCity, setSchoolCity] = useState('');
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [schoolQuery, setSchoolQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{
    rows: { name: string; short_name: string; city?: string; line: number }[];
    errors: string[];
  } | null>(null);

  const filtered = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    return schools
      .filter((s) => !s.category_id || s.category_id === category)
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.short_name.toLowerCase().includes(q) ||
          (s.city || '').toLowerCase().includes(q),
      );
  }, [schools, category, schoolQuery]);

  const resetForm = () => {
    setSchoolName('');
    setSchoolShort('');
    setSchoolCity('');
    setSchoolLogo(null);
    setEditId(null);
  };

  const saveSchool = async (e: FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;

    if (!supabase) {
      if (editId) {
        setSchools((prev) =>
          prev.map((x) =>
            x.id === editId
              ? {
                  ...x,
                  name: schoolName.trim(),
                  short_name: (schoolShort || schoolName).trim(),
                  city: schoolCity || null,
                  logo_url: schoolLogo,
                }
              : x,
          ),
        );
      } else {
        setSchools((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: schoolName.trim(),
            short_name: (schoolShort || schoolName).trim(),
            city: schoolCity || null,
            logo_url: schoolLogo,
            category_id: category,
            competition_id: competitionId,
            active: true,
          },
        ]);
      }
      resetForm();
      return setNotice(editId ? 'School updated in demo mode.' : 'School added in demo mode.');
    }

    setBusy(true);
    if (editId) {
      const { error } = await supabase.rpc('update_school', {
        p_school_id: editId,
        p_name: schoolName.trim(),
        p_short_name: (schoolShort || schoolName).trim(),
        p_city: schoolCity.trim() || null,
        p_logo_url: schoolLogo,
      });
      setBusy(false);
      if (error) return setNotice(error.message);
      setNotice('School updated.');
    } else {
      const { error } = await supabase.rpc('register_school', {
        p_competition_id: competitionId,
        p_category_id: category,
        p_name: schoolName.trim(),
        p_short_name: (schoolShort || schoolName).trim(),
        p_logo_url: schoolLogo,
        p_city: schoolCity.trim() || null,
      });
      setBusy(false);
      if (error) return setNotice(error.message);
      setNotice('School registered.');
    }
    resetForm();
    await refreshAll();
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
      setSchools((prev) => [
        ...prev,
        ...rows.map((r) => ({
          id: crypto.randomUUID(),
          name: r.name,
          short_name: r.short_name,
          city: r.city || null,
          category_id: category,
          competition_id: competitionId,
          active: true,
        })),
      ]);
      setCsvPreview(null);
      return setNotice(`Imported ${rows.length} schools in demo mode.`);
    }
    setBusy(true);
    let ok = 0;
    const failures: string[] = [];
    for (const row of rows) {
      const { error } = await supabase.rpc('register_school', {
        p_competition_id: competitionId,
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

  return (
    <div className="admin-panel">
      <div className="admin-hero-row">
        <div>
          <h2>Schools & teams</h2>
          <p>Create, edit, deactivate schools. Upload logos for leaderboards and certificates. CSV: name, short_name, city.</p>
        </div>
        <label className="outline-btn small file-btn">
          <FileSpreadsheet size={16} /> Preview CSV
          <input
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void previewCsv(f);
              e.target.value = '';
            }}
          />
        </label>
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
        <label>
          Search
          <input value={schoolQuery} onChange={(e) => setSchoolQuery(e.target.value)} placeholder="Filter schools" />
        </label>
      </div>

      <form className="config-form entity-form" onSubmit={saveSchool}>
        <div className="entity-form-grid">
          <label>
            School name
            <input required placeholder="School name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
          </label>
          <label>
            Short name
            <input placeholder="Short name" value={schoolShort} onChange={(e) => setSchoolShort(e.target.value)} />
          </label>
          <label>
            City
            <input placeholder="City" value={schoolCity} onChange={(e) => setSchoolCity(e.target.value)} />
          </label>
          <ImageField
            supabase={supabase}
            label="School logo"
            folder={`schools/${competitionId}`}
            value={schoolLogo}
            onChange={setSchoolLogo}
            setNotice={setNotice}
            disabled={busy}
          />
        </div>
        <div className="quick-actions">
          <button className="primary-btn" disabled={busy} type="submit">
            {editId ? 'Save school' : 'Add school'}
          </button>
          {editId && (
            <button className="outline-btn" type="button" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {csvPreview && (
        <div className="math-warning" style={{ marginTop: 12 }}>
          <p>
            <strong>CSV preview:</strong> {csvPreview.rows.length} valid row(s), {csvPreview.errors.length} warning(s).
          </p>
          {csvPreview.errors.slice(0, 5).map((err) => (
            <p key={err}>{err}</p>
          ))}
          <div className="quick-actions">
            <button className="primary-btn" type="button" disabled={busy || !csvPreview.rows.length} onClick={() => void confirmCsvImport()}>
              Confirm import
            </button>
            <button className="outline-btn" type="button" onClick={() => setCsvPreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="school-admin-list">
        {filtered.map((s) => (
          <div className="school-admin-row" key={s.id}>
            <div className="school-admin-main">
              <div className="entity-thumb">{s.logo_url ? <img src={s.logo_url} alt="" /> : <span>{s.short_name.slice(0, 2)}</span>}</div>
              <div>
                <strong>{s.name}</strong>
                <small>
                  {s.short_name}
                  {s.city ? ` · ${s.city}` : ''}
                  {s.active === false ? ' · inactive' : ''}
                </small>
              </div>
            </div>
            <div className="quick-actions">
              <button
                className="outline-btn small"
                type="button"
                onClick={() => {
                  setEditId(s.id);
                  setSchoolName(s.name);
                  setSchoolShort(s.short_name);
                  setSchoolCity(s.city || '');
                  setSchoolLogo(s.logo_url || null);
                }}
              >
                Edit
              </button>
              {s.active === false ? (
                <button
                  className="outline-btn small"
                  type="button"
                  onClick={async () => {
                    if (!supabase) {
                      setSchools((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: true } : x)));
                      return;
                    }
                    const { error } = await supabase.from('schools').update({ active: true }).eq('id', s.id);
                    if (error) setNotice(error.message);
                    else {
                      setNotice('School reactivated.');
                      await refreshAll();
                    }
                  }}
                >
                  Reactivate
                </button>
              ) : (
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
                    else {
                      setNotice('School deactivated.');
                      await refreshAll();
                    }
                  }}
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
        {!filtered.length && <p className="empty-board">No schools match this filter.</p>}
      </div>
    </div>
  );
}
