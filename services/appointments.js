const { supabase } = require("../config/supabase");
const calendar = require("./calendar");

async function findOrCreatePatient(clinicId, phone, name = null) {
  const existing = await supabase.from("patients").select("*")
    .eq("clinic_id", clinicId).eq("phone", phone).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const created = await supabase.from("patients")
    .insert({ clinic_id: clinicId, phone, name }).select().single();
  if (created.error) throw created.error;
  return created.data;
}

async function getDoctor(doctorId) {
  const r = await supabase.from("doctors").select("*").eq("id", doctorId).single();
  if (r.error) throw r.error;
  return r.data;
}

async function isSlotFree(doctorId, startsAt, endsAt, ignoreId = null) {
  let q = supabase.from("appointments").select("id")
    .eq("doctor_id", doctorId)
    .in("status", ["booked", "confirmed"])
    .lt("starts_at", endsAt).gt("ends_at", startsAt);
  if (ignoreId) q = q.neq("id", ignoreId);
  const r = await q;
  if (r.error) throw r.error;
  return !r.data?.length;
}

async function createAppointment({ clinicId, patientId, doctorId, startsAt, endsAt, reason }) {
  if (!await isSlotFree(doctorId, startsAt, endsAt)) {
    throw new Error("That appointment slot is already booked.");
  }

  const d = await getDoctor(doctorId);
  let event = null;

  if (process.env.GOOGLE_CALENDAR_ENABLED === "true" && d.calendar_id) {
    event = await calendar.createEvent({
      calendarId: d.calendar_id,
      summary: `Clinic appointment - ${d.name}`,
      description: reason || "Clinic appointment",
      start: startsAt, end: endsAt,
      timeZone: process.env.GOOGLE_TIMEZONE || "Africa/Nairobi"
    });
  }

  const r = await supabase.from("appointments").insert({
    clinic_id: clinicId, patient_id: patientId, doctor_id: doctorId,
    starts_at: startsAt, ends_at: endsAt, reason: reason || null,
    status: "booked", calendar_event_id: event?.id || null
  }).select("*, doctors(name,specialty), patients(name,phone)").single();

  if (r.error) throw r.error;
  return r.data;
}

async function cancelAppointment(id) {
  const current = await supabase.from("appointments")
    .select("*, doctors(calendar_id)").eq("id", id).single();
  if (current.error) throw current.error;
  const a = current.data;

  if (a.calendar_event_id && a.doctors?.calendar_id) {
    await calendar.deleteEvent({
      calendarId: a.doctors.calendar_id, eventId: a.calendar_event_id
    }).catch(() => {});
  }

  const r = await supabase.from("appointments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (r.error) throw r.error;
  return r.data;
}

async function rescheduleAppointment({ appointmentId, startsAt, endsAt }) {
  const current = await supabase.from("appointments")
    .select("*, doctors(calendar_id)").eq("id", appointmentId).single();
  if (current.error) throw current.error;
  const a = current.data;

  if (!await isSlotFree(a.doctor_id, startsAt, endsAt, appointmentId)) {
    throw new Error("The new appointment slot is already booked.");
  }

  if (a.calendar_event_id && a.doctors?.calendar_id) {
    await calendar.updateEvent({
      calendarId: a.doctors.calendar_id, eventId: a.calendar_event_id,
      start: startsAt, end: endsAt,
      timeZone: process.env.GOOGLE_TIMEZONE || "Africa/Nairobi"
    });
  }

  const r = await supabase.from("appointments").update({
    starts_at: startsAt, ends_at: endsAt, status: "booked",
    reminder_24h_sent: false, reminder_2h_sent: false,
    updated_at: new Date().toISOString()
  }).eq("id", appointmentId)
    .select("*, doctors(name,specialty), patients(name,phone)").single();

  if (r.error) throw r.error;
  return r.data;
}

async function patientAppointments(patientId) {
  const r = await supabase.from("appointments")
    .select("*, doctors(name,specialty)")
    .eq("patient_id", patientId)
    .in("status", ["booked", "confirmed"])
    .order("starts_at", { ascending: true });
  if (r.error) throw r.error;
  return r.data || [];
}

module.exports = { findOrCreatePatient, getDoctor, isSlotFree, createAppointment, cancelAppointment, rescheduleAppointment, patientAppointments };
