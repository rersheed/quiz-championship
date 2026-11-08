import { useEffect, useState, type FormEvent } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduleEvent } from '../data';
import ImageField from './ImageField';

type StaffRow = { user_id: string; email: string; role: string; created_at: string };
type Sponsor = {
  id: string;
  name: string;
  logo_url?: string | null;
  website_url?: string | null;
  tier: string;
  sort_order: number;
  active: boolean;
};

type Props = {
  supabase: SupabaseClient | null;
  competitionId: string;
  role: string | null;
  schedule: ScheduleEvent[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>;
  setNotice: (v: string) => void;
};

export default function SettingsPanel({ supabase, competitionId, role, schedule, setSchedule, setNotice }: Props) {
  const isSuper = !supabase || role === 'super_admin';
  const canAdmin = !supabase || role === 'super_admin' || role === 'admin';
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [email, setEmail] = useState('');
  const [staffRole, setStaffRole] = useState('scorekeeper');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [location, setLocation] = useState('');
  const [editScheduleId, setEditScheduleId] = useState<string | null>(null);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorTier, setSponsorTier] = useState('partner');
  const [sponsorLogo, setSponsorLogo] = useState<string | null>(null);
  const [sponsorWebsite, setSponsorWebsite] = useState('');
  const [editSponsorId, setEditSponsorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase || competitionId === 'demo') {
      setStaff([{ user_id: 'demo', email: 'demo@imj.local', role: 'super_admin', created_at: new Date().toISOString() }]);
      setSponsors([
        { id: '1', name: 'IMJ Group', tier: 'title', sort_order: 1, active: true, logo_url: null },
        { id: '2', name: 'Education Partner', tier: 'gold', sort_order: 2, active: true, logo_url: null },
      ]);
      return;
    }
    const [staffRes, sponsorRes, scheduleRes] = await Promise.all([
      supabase.rpc('list_staff'),
      supabase.from('sponsors').select('*').eq('competition_id', competitionId).order('sort_order'),
      supabase.from('schedule_events').select('*').eq('competition_id', competitionId).order('sort_order'),
    ]);
    if (staffRes.data) setStaff(staffRes.data as StaffRow[]);
    if (sponsorRes.data) setSponsors(sponsorRes.data as Sponsor[]);
    if (scheduleRes.data) setSchedule(scheduleRes.data as ScheduleEvent[]);
    if (staffRes.error) setNotice(staffRes.error.message);
  };

  useEffect(() => {
    void load();
  }, [supabase, competitionId]);

  const assignStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!isSuper) return setNotice('Only super administrators can assign staff.');
    if (!supabase) {
      setStaff((prev) => [...prev, { user_id: crypto.randomUUID(), email, role: staffRole, created_at: new Date().toISOString() }]);
      setEmail('');
      return setNotice('Staff assigned in demo mode.');
    }
    setBusy(true);
    const { error } = await supabase.rpc('assign_staff', { p_email: email.trim(), p_role: staffRole });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setEmail('');
      setNotice('Staff role assigned.');
      await load();
    }
  };

  const removeStaff = async (userId: string) => {
    if (!isSuper) return;
    if (!supabase) {
      setStaff((prev) => prev.filter((s) => s.user_id !== userId));
      return;
    }
    const { error } = await supabase.rpc('remove_staff', { p_user_id: userId });
    if (error) setNotice(error.message);
    else {
      setNotice('Staff removed.');
      await load();
    }
  };

  const resetScheduleForm = () => {
    setEditScheduleId(null);
    setTitle('');
    setWhen('');
    setLocation('');
  };

  const saveSchedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdmin || !title.trim()) return;
    if (!supabase) {
      if (editScheduleId) {
        setSchedule((prev) =>
          prev.map((ev) =>
            ev.id === editScheduleId
              ? { ...ev, title: title.trim(), starts_at: when || null, location: location || null }
              : ev,
          ),
        );
      } else {
        setSchedule((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            competition_id: competitionId,
            title: title.trim(),
            starts_at: when || null,
            location: location || null,
            sort_order: prev.length + 1,
          },
        ]);
      }
      resetScheduleForm();
      return setNotice('Schedule item saved in demo mode.');
    }
    setBusy(true);
    const payload = {
      title: title.trim(),
      starts_at: when ? new Date(when).toISOString() : null,
      location: location || null,
    };
    const { error } = editScheduleId
      ? await supabase.from('schedule_events').update(payload).eq('id', editScheduleId)
      : await supabase.from('schedule_events').insert({
          competition_id: competitionId,
          ...payload,
          sort_order: schedule.length + 1,
        });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      resetScheduleForm();
      setNotice(editScheduleId ? 'Schedule item updated.' : 'Schedule item saved.');
      await load();
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!canAdmin) return;
    if (!supabase) {
      setSchedule((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    const { error } = await supabase.from('schedule_events').delete().eq('id', id);
    if (error) setNotice(error.message);
    else await load();
  };

  const resetSponsorForm = () => {
    setEditSponsorId(null);
    setSponsorName('');
    setSponsorTier('partner');
    setSponsorLogo(null);
    setSponsorWebsite('');
  };

  const saveSponsor = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdmin || !sponsorName.trim()) return;
    if (!supabase) {
      if (editSponsorId) {
        setSponsors((prev) =>
          prev.map((s) =>
            s.id === editSponsorId
              ? {
                  ...s,
                  name: sponsorName.trim(),
                  tier: sponsorTier,
                  logo_url: sponsorLogo,
                  website_url: sponsorWebsite || null,
                }
              : s,
          ),
        );
      } else {
        setSponsors((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: sponsorName.trim(),
            tier: sponsorTier,
            sort_order: prev.length + 1,
            active: true,
            logo_url: sponsorLogo,
            website_url: sponsorWebsite || null,
          },
        ]);
      }
      resetSponsorForm();
      return setNotice('Sponsor saved in demo mode.');
    }
    setBusy(true);
    const payload = {
      name: sponsorName.trim(),
      tier: sponsorTier,
      logo_url: sponsorLogo,
      website_url: sponsorWebsite.trim() || null,
      active: true,
    };
    const { error } = editSponsorId
      ? await supabase.from('sponsors').update(payload).eq('id', editSponsorId)
      : await supabase.from('sponsors').insert({
          competition_id: competitionId,
          ...payload,
          sort_order: sponsors.length + 1,
        });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      resetSponsorForm();
      setNotice(editSponsorId ? 'Sponsor updated.' : 'Sponsor saved.');
      await load();
    }
  };

  const deleteSponsor = async (id: string) => {
    if (!canAdmin) return;
    if (!supabase) {
      setSponsors((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    const { error } = await supabase.from('sponsors').delete().eq('id', id);
    if (error) setNotice(error.message);
    else await load();
  };

  const toLocalInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="config-grid">
      <div className="admin-panel">
        <h2>Staff & permissions</h2>
        <p>Create the Auth user in Supabase first, then assign a role here. Scorekeepers can score; only admins change configuration.</p>
        {isSuper ? (
          <form className="config-form" onSubmit={assignStaff}>
            <label>
              User email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="scorekeeper@example.com" />
            </label>
            <label>
              Role
              <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
                <option value="scorekeeper">Scorekeeper</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </label>
            <button className="primary-btn" disabled={busy} type="submit">
              <UserPlus size={16} /> Assign staff
            </button>
          </form>
        ) : (
          <p>Only super administrators can assign or remove staff.</p>
        )}
        <div style={{ marginTop: 16 }}>
          {staff.map((s) => (
            <div className="bonus-admin-row" key={s.user_id}>
              <div>
                <strong>{s.email}</strong>
                <small style={{ display: 'block', color: '#6b7a90' }}>{s.role.replace('_', ' ')}</small>
              </div>
              {isSuper && (
                <button className="outline-btn small" type="button" onClick={() => removeStaff(s.user_id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panel">
        <h2>Competition schedule</h2>
        <p>Create, edit, or remove homepage schedule items.</p>
        {canAdmin && (
          <form className="config-form" onSubmit={saveSchedule}>
            <label>
              Title
              <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opening ceremony" />
            </label>
            <label>
              Starts at
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label>
              Location
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main Hall" />
            </label>
            <div className="quick-actions">
              <button className="primary-btn" disabled={busy} type="submit">
                {editScheduleId ? 'Save schedule item' : 'Add schedule item'}
              </button>
              {editScheduleId && (
                <button className="outline-btn" type="button" onClick={resetScheduleForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
        <div style={{ marginTop: 16 }}>
          {schedule.map((ev) => (
            <div className="bonus-admin-row" key={ev.id}>
              <div>
                <strong>{ev.title}</strong>
                <small style={{ display: 'block', color: '#6b7a90' }}>
                  {ev.starts_at ? new Date(ev.starts_at).toLocaleString() : 'TBA'}
                  {ev.location ? ` · ${ev.location}` : ''}
                </small>
              </div>
              {canAdmin && (
                <div className="quick-actions">
                  <button
                    className="outline-btn small"
                    type="button"
                    onClick={() => {
                      setEditScheduleId(ev.id);
                      setTitle(ev.title);
                      setWhen(toLocalInput(ev.starts_at));
                      setLocation(ev.location || '');
                    }}
                  >
                    Edit
                  </button>
                  <button className="outline-btn small" type="button" onClick={() => deleteSchedule(ev.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panel" style={{ gridColumn: '1 / -1' }}>
        <h2>Sponsors & partners</h2>
        <p>Full sponsor CRUD with logo upload for the public Sponsors section.</p>
        {canAdmin && (
          <form className="config-form entity-form" onSubmit={saveSponsor}>
            <div className="entity-form-grid">
              <label>
                Sponsor name
                <input required placeholder="Sponsor name" value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} />
              </label>
              <label>
                Tier
                <select value={sponsorTier} onChange={(e) => setSponsorTier(e.target.value)}>
                  <option value="title">Title</option>
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                  <option value="partner">Partner</option>
                </select>
              </label>
              <label>
                Website
                <input type="url" placeholder="https://..." value={sponsorWebsite} onChange={(e) => setSponsorWebsite(e.target.value)} />
              </label>
              <ImageField
                supabase={supabase}
                label="Sponsor logo"
                folder={`sponsors/${competitionId}`}
                value={sponsorLogo}
                onChange={setSponsorLogo}
                setNotice={setNotice}
                disabled={busy}
              />
            </div>
            <div className="quick-actions">
              <button className="primary-btn" disabled={busy} type="submit">
                {editSponsorId ? 'Save sponsor' : 'Add sponsor'}
              </button>
              {editSponsorId && (
                <button className="outline-btn" type="button" onClick={resetSponsorForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
        <div className="group-admin-grid" style={{ marginTop: 12 }}>
          {sponsors.map((s) => (
            <div className="group-admin-card" key={s.id}>
              <div className="entity-thumb wide">{s.logo_url ? <img src={s.logo_url} alt="" /> : <span>{s.name.slice(0, 2)}</span>}</div>
              <strong>{s.name}</strong>
              <small>{s.tier}</small>
              {canAdmin && (
                <div className="quick-actions">
                  <button
                    className="outline-btn small"
                    type="button"
                    onClick={() => {
                      setEditSponsorId(s.id);
                      setSponsorName(s.name);
                      setSponsorTier(s.tier);
                      setSponsorLogo(s.logo_url || null);
                      setSponsorWebsite(s.website_url || '');
                    }}
                  >
                    Edit
                  </button>
                  <button className="outline-btn small" type="button" onClick={() => deleteSponsor(s.id)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
