const router = require("express").Router();
const { supabase } = require("../config/supabase");

router.get("/", async (req, res) => {
  try {
    let q = supabase.from("doctors").select(
      "id,name,specialty,phone,email,calendar_id,active,doctor_availability(day_of_week,start_time,end_time,slot_minutes,active)"
    ).eq("active", true);
    if (req.query.clinicId) q = q.eq("clinic_id", req.query.clinicId);
    const r = await q;
    if (r.error) throw r.error;
    res.json({ doctors: r.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
