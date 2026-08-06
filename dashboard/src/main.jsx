import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiFetch, clearApiKey, getApiKey, getClinicId, setApiKey, setClinicId } from "./api";
import { formatDate, formatDateTime, formatTime, initials, emptySchedule, statusLabel, toIsoFromLocalInput } from "./utils";
import "./styles.css";

const NAV = [
  { id: "overview", label: "Overview", icon: "◫" },
  { id: "appointments", label: "Appointments", icon: "▣" },
  { id: "doctors", label: "Doctors", icon: "✚" },
  { id: "faqs", label: "FAQs", icon: "?" },
  { id: "support", label: "Support", icon: "◉" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function App() {
  const [authed, setAuthed] = useState(Boolean(getApiKey()));
  const [section, setSection] = useState("overview");
  const [clinicId, setClinicIdState] = useState(getClinicId());
  const [clinic, setClinic] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const navigate = (next) => {
    setSection(next);
    setError("");
  };

  const handleLogout = () => {
    clearApiKey();
    setAuthed(false);
    setClinic(null);
    setStatus(null);
  };

  const refresh = () => setRefreshTick((value) => value + 1);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/clinic"),
      apiFetch("/api/system/status"),
    ])
      .then(([clinicData, statusData]) => {
        if (cancelled) return;
        if (clinicData?._id && !getClinicId()) {
          setClinicId(String(clinicData._id));
          setClinicIdState(String(clinicData._id));
        }
        setClinic(clinicData);
        setStatus(statusData);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.message === "UNAUTHORIZED") {
          clearApiKey();
          setAuthed(false);
        } else {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [authed, clinicId, refreshTick]);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="app-shell">
      <Sidebar section={section} setSection={navigate} clinic={clinic} onLogout={handleLogout} />
      <main className="main-content">
        <Topbar section={section} clinic={clinic} status={status} onRefresh={refresh} loading={loading} />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="content-wrap">
          {section === "overview" && <Overview clinic={clinic} onNavigate={navigate} refreshTick={refreshTick} />}
          {section === "appointments" && <Appointments clinic={clinic} refreshTick={refreshTick} onRefresh={refresh} />}
          {section === "doctors" && <Doctors clinic={clinic} refreshTick={refreshTick} />}
          {section === "faqs" && <Faqs clinic={clinic} refreshTick={refreshTick} />}
          {section === "support" && <Support clinic={clinic} refreshTick={refreshTick} />}
          {section === "settings" && <Settings clinic={clinic} status={status} onSaved={refresh} />}
        </div>
      </main>
    </div>
  );
}

function Login({ onLogin }) {
  const [apiKey, setApiKeyValue] = useState("");
  const [clinicIdValue, setClinicIdValue] = useState(getClinicId());
  const [apiUrl] = useState(import.meta.env.VITE_API_URL || "http://localhost:3000");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setChecking(true);
    setApiKey(apiKey.trim());
    if (clinicIdValue.trim()) setClinicId(clinicIdValue.trim());

    try {
      await apiFetch("/api/clinic");
      onLogin();
    } catch (err) {
      clearApiKey();
      setError(err.message === "UNAUTHORIZED" ? "Invalid admin API key." : err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand-mark large">+</div>
        <span className="eyebrow">Clinic operations</span>
        <h1>Welcome to ClinicFlow</h1>
        <p className="muted">Manage your WhatsApp AI booking assistant, doctors, appointments, FAQs, and support desk.</p>
        <form onSubmit={submit} className="stack-lg">
          <label>
            Admin API key
            <input type="password" value={apiKey} onChange={(e) => setApiKeyValue(e.target.value)} placeholder="Enter ADMIN_API_KEY" required />
          </label>
          <label>
            Clinic ID <span className="optional">optional for single-clinic setups</span>
            <input value={clinicIdValue} onChange={(e) => setClinicIdValue(e.target.value)} placeholder="MongoDB clinic ID" />
          </label>
          <div className="connection-note"><span className="status-dot online" /> API: {apiUrl}</div>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="button button-primary button-full" disabled={checking}>{checking ? "Connecting…" : "Open dashboard"}</button>
        </form>
        <p className="footnote">MVP note: the API key is stored in this browser session only. For production, replace static API-key access with proper staff authentication and role-based authorization.</p>
      </div>
    </div>
  );
}

function Sidebar({ section, setSection, clinic, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand"><div className="brand-mark">+</div><div><strong>ClinicFlow</strong><span>AI operations</span></div></div>
        <div className="clinic-mini"><span className="avatar">{initials(clinic?.name || "Clinic")}</span><div><strong>{clinic?.name || "Clinic"}</strong><span>{clinic?.timezone || "—"}</span></div></div>
      </div>
      <nav className="nav-list">
        {NAV.map((item) => (
          <button key={item.id} className={`nav-item ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}>
            <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="health-mini"><span className="status-dot online" /> System ready</div>
        <button className="nav-item logout" onClick={onLogout}><span className="nav-icon">↪</span><span>Sign out</span></button>
      </div>
    </aside>
  );
}

function Topbar({ section, clinic, status, onRefresh, loading }) {
  const label = NAV.find((item) => item.id === section)?.label || "Dashboard";
  return (
    <header className="topbar">
      <div><span className="breadcrumb">{clinic?.name || "Clinic"}</span><h2>{label}</h2></div>
      <div className="topbar-actions">
        <div className="integration-chip"><span className={`status-dot ${status?.whatsapp ? "online" : "offline"}`} /> WhatsApp</div>
        <div className="integration-chip"><span className={`status-dot ${status?.googleCalendar ? "online" : "offline"}`} /> Calendar</div>
        <button className="icon-button" onClick={onRefresh} aria-label="Refresh" title="Refresh">↻</button>
        {loading && <span className="spinner" />}
      </div>
    </header>
  );
}

function SectionHeader({ title, description, action }) {
  return <div className="section-header"><div><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}

function StatCard({ label, value, meta, icon, accent }) {
  return <div className="stat-card"><div className={`stat-icon ${accent || ""}`}>{icon}</div><div><span className="muted">{label}</span><strong>{value}</strong><small>{meta}</small></div></div>;
}

function Overview({ clinic, onNavigate, refreshTick }) {
  const [data, setData] = useState({ appointments: [], doctors: [], support: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/appointments"),
      apiFetch("/api/doctors"),
      apiFetch("/api/support?status=open"),
    ]).then(([appointments, doctors, support]) => {
      if (!cancelled) setData({ appointments: appointments || [], doctors: doctors || [], support: support || [] });
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayAppointments = data.appointments.filter((item) => new Date(item.startTime).toISOString().slice(0, 10) === todayKey && item.status !== "cancelled");
  const upcoming = data.appointments.filter((item) => new Date(item.startTime).getTime() >= now && item.status !== "cancelled").slice(0, 6);

  return <div>
    <SectionHeader title={`Good day${clinic?.name ? `, ${clinic.name}` : ""}`} description="Here is what is happening across your clinic today." action={<button className="button button-primary" onClick={() => onNavigate("appointments")}>+ New appointment</button>} />
    <div className="stats-grid">
      <StatCard label="Today's appointments" value={loading ? "…" : todayAppointments.length} meta="Scheduled for today" icon="▣" accent="teal" />
      <StatCard label="Active doctors" value={loading ? "…" : data.doctors.filter((d) => d.active).length} meta="Available for booking" icon="✚" accent="blue" />
      <StatCard label="Open support" value={loading ? "…" : data.support.length} meta="Needs human follow-up" icon="◉" accent="amber" />
      <StatCard label="Upcoming bookings" value={loading ? "…" : upcoming.length} meta="Next appointments" icon="◷" accent="purple" />
    </div>
    <div className="dashboard-grid">
      <div className="card span-2">
        <div className="card-header"><div><h3>Upcoming appointments</h3><p className="muted">Live from your booking database.</p></div><button className="text-button" onClick={() => onNavigate("appointments")}>View all →</button></div>
        {upcoming.length === 0 ? <EmptyState title="No upcoming appointments" description="New WhatsApp bookings will appear here." /> : <div className="table-wrap"><table><thead><tr><th>Patient</th><th>Doctor</th><th>Date & time</th><th>Status</th><th>Reference</th></tr></thead><tbody>{upcoming.map((item) => <tr key={item._id}><td><strong>{item.patientName}</strong><span className="table-sub">{item.patientPhone}</span></td><td>{item.doctorId?.name || "—"}<span className="table-sub">{item.doctorId?.specialty || ""}</span></td><td>{formatDateTime(item.startTime, clinic?.timezone)}</td><td><StatusBadge status={item.status} /></td><td><code>{item.bookingCode}</code></td></tr>)}</tbody></table></div>}
      </div>
      <div className="card">
        <div className="card-header"><div><h3>Assistant health</h3><p className="muted">Key service connections.</p></div></div>
        <HealthPanel />
      </div>
      <div className="card">
        <div className="card-header"><div><h3>Quick actions</h3><p className="muted">Common admin tasks.</p></div></div>
        <div className="quick-grid"><button className="quick-action" onClick={() => onNavigate("doctors")}><span>✚</span>Add doctor</button><button className="quick-action" onClick={() => onNavigate("faqs")}><span>?</span>Update FAQ</button><button className="quick-action" onClick={() => onNavigate("support")}><span>◉</span>Open support</button><button className="quick-action" onClick={() => onNavigate("settings")}><span>⚙</span>Clinic settings</button></div>
      </div>
    </div>
  </div>;
}

function HealthPanel() {
  const [status, setStatus] = useState(null);
  useEffect(() => { apiFetch("/api/system/status").then(setStatus).catch(() => {}); }, []);
  const items = [
    ["WhatsApp", status?.whatsapp],
    ["OpenAI", status?.openai],
    ["Google Calendar", status?.googleCalendar],
    ["Reminders", status?.reminders],
    ["Database", status?.database],
  ];
  return <div className="health-list">{items.map(([label, ok]) => <div className="health-row" key={label}><span>{label}</span><span className={`pill ${ok ? "pill-success" : "pill-muted"}`}>{ok ? "Connected" : "Not configured"}</span></div>)}</div>;
}

function StatusBadge({ status }) { return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>; }
function EmptyState({ title, description }) { return <div className="empty-state"><div className="empty-icon">○</div><strong>{title}</strong><p className="muted">{description}</p></div>; }
function Modal({ title, children, onClose, wide = false }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className={`modal ${wide ? "modal-wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose}>×</button></div><div className="modal-body">{children}</div></div></div>; }

function Appointments({ clinic, refreshTick, onRefresh }) {
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = () => Promise.all([apiFetch("/api/appointments"), apiFetch("/api/doctors")]).then(([a, d]) => { setAppointments(a || []); setDoctors(d || []); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { setLoading(true); load(); }, [refreshTick]);

  const filtered = useMemo(() => appointments.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || [a.patientName, a.patientPhone, a.bookingCode, a.doctorId?.name, a.doctorId?.specialty].some((v) => String(v || "").toLowerCase().includes(q));
    const matchesFilter = filter === "all" || a.status === filter;
    return matchesSearch && matchesFilter;
  }), [appointments, search, filter]);

  const cancel = async (appointment) => {
    if (!confirm(`Cancel ${appointment.bookingCode}?`)) return;
    try { await apiFetch(`/api/appointments/${appointment.bookingCode}/cancel`, { method: "POST", body: JSON.stringify({ patientPhone: appointment.patientPhone }) }); onRefresh(); } catch (err) { alert(err.message); }
  };

  return <div>
    <SectionHeader title="Appointments" description="Manage the bookings created through WhatsApp and the admin desk." action={<button className="button button-primary" onClick={() => setModal({ type: "book" })}>+ New appointment</button>} />
    <div className="toolbar"><div className="search-wrap"><span>⌕</span><input placeholder="Search patient, doctor, phone, or booking code" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All statuses</option><option value="booked">Booked</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option><option value="no_show">No show</option></select></div>
    <div className="card"><div className="table-wrap"><table><thead><tr><th>Patient</th><th>Doctor</th><th>Date & time</th><th>Status</th><th>Reference</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan="6"><div className="loading-row">Loading appointments…</div></td></tr> : filtered.length === 0 ? <tr><td colSpan="6"><EmptyState title="No appointments found" description="Try another search or create a new booking." /></td></tr> : filtered.map((item) => <tr key={item._id}><td><strong>{item.patientName}</strong><span className="table-sub">{item.patientPhone}</span></td><td>{item.doctorId?.name || "—"}<span className="table-sub">{item.doctorId?.specialty || ""}</span></td><td>{formatDateTime(item.startTime, clinic?.timezone)}</td><td><StatusBadge status={item.status} /></td><td><code>{item.bookingCode}</code></td><td><div className="row-actions">{item.status !== "cancelled" && item.status !== "completed" && <><button className="small-button" onClick={() => setModal({ type: "reschedule", appointment: item })}>Reschedule</button><button className="small-button danger" onClick={() => cancel(item)}>Cancel</button></>}</div></td></tr>)}</tbody></table></div></div>
    {modal?.type === "book" && <BookingModal clinic={clinic} doctors={doctors} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />}
    {modal?.type === "reschedule" && <RescheduleModal clinic={clinic} appointment={modal.appointment} onClose={() => setModal(null)} onDone={() => { setModal(null); onRefresh(); }} />}
  </div>;
}

function BookingModal({ clinic, doctors, onClose, onDone }) {
  const [form, setForm] = useState({ doctorId: doctors[0]?._id || "", patientName: "", patientPhone: "", patientEmail: "", date: "", time: "", reason: "" });
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const check = async () => { if (!form.doctorId || !form.date) return alert("Choose a doctor and date first."); setLoadingSlots(true); try { const data = await apiFetch("/api/availability", { method: "POST", body: JSON.stringify({ doctorId: form.doctorId, date: form.date, durationMinutes: 30, limit: 30 }) }); setSlots(data || []); } catch (err) { alert(err.message); } finally { setLoadingSlots(false); } };
  const save = async (e) => { e.preventDefault(); if (!form.time) return alert("Choose an available time."); setSaving(true); try { await apiFetch("/api/appointments", { method: "POST", body: JSON.stringify({ doctorId: form.doctorId, patientPhone: form.patientPhone, patientName: form.patientName, patientEmail: form.patientEmail || undefined, startTime: toIsoFromLocalInput(form.time, clinic?.timezone), reason: form.reason || undefined }) }); onDone(); } catch (err) { alert(err.message); } finally { setSaving(false); } };
  return <Modal title="Create appointment" onClose={onClose} wide><form onSubmit={save} className="stack-lg"><div className="form-grid two"><label>Doctor<select value={form.doctorId} onChange={(e) => update("doctorId", e.target.value)} required><option value="">Select doctor</option>{doctors.filter((d) => d.active).map((d) => <option value={d._id} key={d._id}>{d.name} · {d.specialty}</option>)}</select></label><label>Patient name<input value={form.patientName} onChange={(e) => update("patientName", e.target.value)} required /></label><label>WhatsApp phone<input value={form.patientPhone} onChange={(e) => update("patientPhone", e.target.value)} placeholder="2547…" required /></label><label>Email<input type="email" value={form.patientEmail} onChange={(e) => update("patientEmail", e.target.value)} /></label><label>Date<input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required /></label><label>Preferred time<select value={form.time} onChange={(e) => update("time", e.target.value)} required><option value="">{loadingSlots ? "Checking availability…" : slots.length ? "Select a slot" : "Check availability first"}</option>{slots.map((slot) => <option key={slot.startTime} value={slot.startTime}>{formatTime(slot.startTime, clinic?.timezone)} · {slot.doctorName}</option>)}</select></label></div><label>Reason (optional)<textarea rows="3" value={form.reason} onChange={(e) => update("reason", e.target.value)} /></label><div className="modal-footer"><button type="button" className="button button-secondary" onClick={check} disabled={loadingSlots}>Check availability</button><button className="button button-primary" disabled={saving}>{saving ? "Booking…" : "Book appointment"}</button></div></form></Modal>;
}

function RescheduleModal({ clinic, appointment, onClose, onDone }) {
  const [value, setValue] = useState(""); const [saving, setSaving] = useState(false);
  const save = async (e) => { e.preventDefault(); setSaving(true); try { await apiFetch(`/api/appointments/${appointment.bookingCode}/reschedule`, { method: "POST", body: JSON.stringify({ patientPhone: appointment.patientPhone, newStartTime: toIsoFromLocalInput(value, clinic?.timezone) }) }); onDone(); } catch (err) { alert(err.message); } finally { setSaving(false); } };
  return <Modal title={`Reschedule ${appointment.bookingCode}`} onClose={onClose}><form onSubmit={save} className="stack-lg"><div className="callout"><strong>{appointment.patientName}</strong><span>{appointment.doctorId?.name || "Doctor"} · Current: {formatDateTime(appointment.startTime, clinic?.timezone)}</span></div><label>New date & time<input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} required /></label><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Close</button><button className="button button-primary" disabled={saving}>{saving ? "Rescheduling…" : "Reschedule"}</button></div></form></Modal>;
}

function Doctors({ refreshTick }) {
  const [doctors, setDoctors] = useState([]); const [modal, setModal] = useState(null); const [loading, setLoading] = useState(true); const load = () => apiFetch("/api/doctors").then(setDoctors).catch(() => {}).finally(() => setLoading(false)); useEffect(() => { setLoading(true); load(); }, [refreshTick]);
  return <div><SectionHeader title="Doctors & calendars" description="Manage specialists, working hours, and the Google Calendar used for availability checks." action={<button className="button button-primary" onClick={() => setModal({ type: "doctor" })}>+ Add doctor</button>} /><div className="doctor-grid">{loading ? <div className="card"><div className="loading-row">Loading doctors…</div></div> : doctors.length === 0 ? <div className="card"><EmptyState title="No doctors yet" description="Add your first doctor and connect a calendar." /></div> : doctors.map((doctor) => <div className="card doctor-card" key={doctor._id}><div className="doctor-head"><div className="avatar avatar-lg">{initials(doctor.name)}</div><div><h3>{doctor.name}</h3><p className="muted">{doctor.specialty}</p></div><span className={`pill ${doctor.active ? "pill-success" : "pill-muted"}`}>{doctor.active ? "Active" : "Inactive"}</span></div><div className="doctor-meta"><div><span>Calendar</span><strong>{doctor.calendarId ? "Connected" : "Not connected"}</strong></div><div><span>Duration</span><strong>{doctor.durationMinutes} min</strong></div><div><span>Slot interval</span><strong>{doctor.slotIntervalMinutes} min</strong></div></div><div className="schedule-preview">{(doctor.workingHours || []).slice(0, 5).map((day) => <div key={day.dayOfWeek}><span>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][day.dayOfWeek - 1]}</span><strong>{day.start}–{day.end}</strong></div>)}</div><button className="button button-secondary button-full" onClick={() => setModal({ type: "doctor", doctor })}>Edit doctor</button></div>)}</div>{modal && <DoctorModal doctor={modal.doctor} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}</div>;
}

function DoctorModal({ doctor, onClose, onDone }) {
  const [form, setForm] = useState(() => ({ name: doctor?.name || "", specialty: doctor?.specialty || "", calendarId: doctor?.calendarId || "", durationMinutes: doctor?.durationMinutes || 30, slotIntervalMinutes: doctor?.slotIntervalMinutes || 30, active: doctor?.active ?? true, workingHours: (() => { const base = emptySchedule(); const current = doctor?.workingHours || []; return base.map((item) => ({ ...item, ...(current.find((d) => d.dayOfWeek === item.dayOfWeek) || {}) })); })() }));
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateDay = (index, key, value) => setForm((prev) => ({ ...prev, workingHours: prev.workingHours.map((day, i) => i === index ? { ...day, [key]: value } : day) }));
  const save = async (e) => { e.preventDefault(); setSaving(true); try { const payload = { name: form.name, specialty: form.specialty, calendarId: form.calendarId, durationMinutes: Number(form.durationMinutes), slotIntervalMinutes: Number(form.slotIntervalMinutes), active: form.active, workingHours: form.workingHours.map(({ label, ...day }) => day) }; if (doctor) await apiFetch(`/api/doctors/${doctor._id}`, { method: "PATCH", body: JSON.stringify(payload) }); else await apiFetch("/api/doctors", { method: "POST", body: JSON.stringify(payload) }); onDone(); } catch (err) { alert(err.message); } finally { setSaving(false); } };
  return <Modal title={doctor ? "Edit doctor" : "Add doctor"} onClose={onClose} wide><form onSubmit={save} className="stack-lg"><div className="form-grid two"><label>Full name<input value={form.name} onChange={(e) => update("name", e.target.value)} required /></label><label>Specialty<input value={form.specialty} onChange={(e) => update("specialty", e.target.value)} required /></label><label>Google Calendar ID<input value={form.calendarId} onChange={(e) => update("calendarId", e.target.value)} placeholder="doctor@group.calendar.google.com" /></label><label>Appointment duration (min)<input type="number" min="5" max="240" value={form.durationMinutes} onChange={(e) => update("durationMinutes", e.target.value)} /></label><label>Slot interval (min)<input type="number" min="5" max="240" value={form.slotIntervalMinutes} onChange={(e) => update("slotIntervalMinutes", e.target.value)} /></label><label className="checkbox-row"><input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} /> Accept new bookings</label></div><div><h4>Working hours</h4><div className="schedule-editor">{form.workingHours.map((day, index) => <div className="schedule-row" key={day.dayOfWeek}><div className="day-name">{day.label}</div><label className="checkbox-row"><input type="checkbox" checked={!day.closed} onChange={(e) => updateDay(index, "closed", !e.target.checked)} /> Open</label><input type="time" disabled={day.closed} value={day.start} onChange={(e) => updateDay(index, "start", e.target.value)} /><span>to</span><input type="time" disabled={day.closed} value={day.end} onChange={(e) => updateDay(index, "end", e.target.value)} /></div>)}</div></div><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save doctor"}</button></div></form></Modal>;
}

function Faqs({ refreshTick }) {
  const [faqs, setFaqs] = useState([]); const [modal, setModal] = useState(null); const [loading, setLoading] = useState(true); const load = () => apiFetch("/api/faqs").then(setFaqs).catch(() => {}).finally(() => setLoading(false)); useEffect(() => { setLoading(true); load(); }, [refreshTick]);
  const remove = async (faq) => { if (!confirm("Delete this FAQ?")) return; try { await apiFetch(`/api/faqs/${faq._id}`, { method: "DELETE" }); load(); } catch (err) { alert(err.message); } };
  return <div><SectionHeader title="FAQs" description="Keep the AI assistant's clinic policies and common answers accurate." action={<button className="button button-primary" onClick={() => setModal({})}>+ Add FAQ</button>} /><div className="faq-list">{loading ? <div className="card"><div className="loading-row">Loading FAQs…</div></div> : faqs.length === 0 ? <div className="card"><EmptyState title="No FAQs yet" description="Add clinic-specific answers for the WhatsApp assistant." /></div> : faqs.map((faq) => <div className="card faq-card" key={faq._id}><div><span className="eyebrow">FAQ</span><h3>{faq.question}</h3><p>{faq.answer}</p>{faq.keywords?.length ? <div className="tag-list">{faq.keywords.map((key) => <span className="tag" key={key}>{key}</span>)}</div> : null}</div><div className="row-actions"><button className="small-button" onClick={() => setModal(faq)}>Edit</button><button className="small-button danger" onClick={() => remove(faq)}>Delete</button></div></div>)}</div>{modal && <FaqModal faq={modal._id ? modal : null} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}</div>;
}

function FaqModal({ faq, onClose, onDone }) {
  const [form, setForm] = useState({ question: faq?.question || "", answer: faq?.answer || "", keywords: faq?.keywords?.join(", ") || "" }); const [saving, setSaving] = useState(false);
  const save = async (e) => { e.preventDefault(); setSaving(true); const payload = { question: form.question, answer: form.answer, keywords: form.keywords.split(",").map((x) => x.trim()).filter(Boolean) }; try { if (faq) await apiFetch(`/api/faqs/${faq._id}`, { method: "PATCH", body: JSON.stringify(payload) }); else await apiFetch("/api/faqs", { method: "POST", body: JSON.stringify(payload) }); onDone(); } catch (err) { alert(err.message); } finally { setSaving(false); } };
  return <Modal title={faq ? "Edit FAQ" : "Add FAQ"} onClose={onClose}><form onSubmit={save} className="stack-lg"><label>Question<input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} required /></label><label>Answer<textarea rows="6" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} required /></label><label>Keywords <span className="optional">comma separated</span><input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="hours, opening, open" /></label><div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save FAQ"}</button></div></form></Modal>;
}

function Support({ refreshTick }) {
  const [tickets, setTickets] = useState([]); const [filter, setFilter] = useState("open"); const [loading, setLoading] = useState(true); const load = () => apiFetch(`/api/support?status=${filter}`).then(setTickets).catch(() => {}).finally(() => setLoading(false)); useEffect(() => { setLoading(true); load(); }, [filter, refreshTick]);
  const updateStatus = async (ticket, status) => { try { await apiFetch(`/api/support/${ticket._id}`, { method: "PATCH", body: JSON.stringify({ status }) }); load(); } catch (err) { alert(err.message); } };
  return <div><SectionHeader title="Human support" description="Review patients who asked to speak with the clinic team or need manual help." action={<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>} /><div className="support-grid">{loading ? <div className="card"><div className="loading-row">Loading support tickets…</div></div> : tickets.length === 0 ? <div className="card"><EmptyState title="No support tickets" description="You're all caught up for this status." /></div> : tickets.map((ticket) => <div className="card support-card" key={ticket._id}><div className="support-top"><div className="avatar">{initials(ticket.patientPhone)}</div><div><h3>{ticket.patientPhone}</h3><span className="muted">Created {formatDateTime(ticket.createdAt, undefined)}</span></div><StatusBadge status={ticket.status} /></div><p>{ticket.summary}</p><div className="support-actions">{ticket.status === "open" && <button className="small-button" onClick={() => updateStatus(ticket, "in_progress")}>Start handling</button>}{ticket.status !== "resolved" && <button className="small-button success" onClick={() => updateStatus(ticket, "resolved")}>Mark resolved</button>}</div></div>)}</div></div>;
}

function Settings({ clinic, status, onSaved }) {
  const [form, setForm] = useState(() => ({ name: clinic?.name || "", phone: clinic?.phone || "", address: clinic?.address || "", website: clinic?.website || "", timezone: clinic?.timezone || "Africa/Nairobi", openingHours: clinic?.openingHours || [] })); const [saving, setSaving] = useState(false);
  useEffect(() => { if (clinic) setForm({ name: clinic.name || "", phone: clinic.phone || "", address: clinic.address || "", website: clinic.website || "", timezone: clinic.timezone || "Africa/Nairobi", openingHours: clinic.openingHours || [] }); }, [clinic]);
  const save = async (e) => { e.preventDefault(); setSaving(true); try { await apiFetch("/api/clinic", { method: "PATCH", body: JSON.stringify(form) }); onSaved(); alert("Clinic settings saved."); } catch (err) { alert(err.message); } finally { setSaving(false); } };
  const addHours = () => setForm((prev) => ({ ...prev, openingHours: [...prev.openingHours, { dayOfWeek: prev.openingHours.length + 1, open: "08:00", close: "17:00", closed: false }] }));
  const updateHours = (index, key, value) => setForm((prev) => ({ ...prev, openingHours: prev.openingHours.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  return <div><SectionHeader title="Clinic settings" description="Update the information the WhatsApp assistant uses for location, opening hours, and patient-facing answers." /><div className="settings-grid"><form className="card stack-lg" onSubmit={save}><div className="card-header"><div><h3>Clinic information</h3><p className="muted">Shown to patients when they ask where or when you're open.</p></div></div><div className="form-grid two"><label>Clinic name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label><label className="span-2">Address<textarea rows="3" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required /></label><label>Website<input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label><label>Timezone<input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Africa/Nairobi" /></label></div><div><div className="inline-heading"><h4>Opening hours</h4><button type="button" className="text-button" onClick={addHours}>+ Add day</button></div><div className="hours-list">{form.openingHours.map((item, index) => <div className="hours-row" key={`${item.dayOfWeek}-${index}`}><input type="number" min="1" max="7" value={item.dayOfWeek} onChange={(e) => updateHours(index, "dayOfWeek", Number(e.target.value))} /><select value={item.closed ? "closed" : "open"} onChange={(e) => updateHours(index, "closed", e.target.value === "closed")}><option value="open">Open</option><option value="closed">Closed</option></select><input type="time" disabled={item.closed} value={item.open} onChange={(e) => updateHours(index, "open", e.target.value)} /><span>to</span><input type="time" disabled={item.closed} value={item.close} onChange={(e) => updateHours(index, "close", e.target.value)} /></div>)}</div></div><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save clinic settings"}</button></form><div className="stack-lg"><div className="card"><div className="card-header"><div><h3>Integration status</h3><p className="muted">Live configuration checks from the backend.</p></div></div><div className="health-list">{[["Database", status?.database], ["WhatsApp Cloud API", status?.whatsapp], ["OpenAI", status?.openai], ["Google Calendar", status?.googleCalendar], ["Reminder templates", status?.reminders]].map(([label, ok]) => <div className="health-row" key={label}><span>{label}</span><span className={`pill ${ok ? "pill-success" : "pill-muted"}`}>{ok ? "Ready" : "Needs setup"}</span></div>)}</div></div><div className="card callout-card"><div className="brand-mark">+</div><h3>How the patient flow works</h3><p className="muted">Patients message your WhatsApp number. The AI checks real doctor schedules and Google Calendar availability, creates bookings, syncs the event, then the reminder worker sends approved WhatsApp reminder templates before the appointment.</p></div></div></div></div>;
}

createRoot(document.getElementById("root")).render(<App />);
