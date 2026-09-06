const router = require("express").Router();
const { supabase } = require("../config/supabase");

router.get("/:id", async (req, res) => {
  try {
    const clinic = await supabase.from("clinics").select("*").eq("id", req.params.id).single();
    const faqs = await supabase.from("faqs").select("*").eq("clinic_id", req.params.id).eq("active", true);
    if (clinic.error) throw clinic.error;
    if (faqs.error) throw faqs.error;
    res.json({ clinic: clinic.data, faqs: faqs.data || [] });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
module.exports = router;
