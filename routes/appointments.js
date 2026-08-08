const router = require("express").Router();
const { supabase } = require("../config/supabase");
const a = require("../services/appointments");

router.get("/", async (req, res) => {
  try {
    let q = supabase.from("appointments").select(
      "*,patients(name,phone),doctors(name,specialty)"
    ).order("starts_at", { ascending: true });
    if (req.query.clinicId) q = q.eq("clinic_id", req.query.clinicId);
    const r = await q;
    if (r.error) throw r.error;
    res.json({ appointments: r.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/", async (req, res) => {
  try {
    res.status(201).json({ appointment: await a.createAppointment(req.body) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch("/:id/cancel", async (req, res) => {
  try { res.json({ appointment: await a.cancelAppointment(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch("/:id/reschedule", async (req, res) => {
  try {
    res.json({ appointment: await a.rescheduleAppointment({
      appointmentId: req.params.id,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt
    })});
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
