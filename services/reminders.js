const cron = require("node-cron");
const { supabase } = require("../config/supabase");
const { sendTemplate } = require("./whatsapp");

async function runReminders() {
  const now = Date.now();
  const windows = [
    { flag: "reminder_24h_sent", min: 23, max: 25 },
    { flag: "reminder_2h_sent", min: 1.5, max: 2.5 }
  ];

  for (const w of windows) {
    const r = await supabase.from("appointments").select(
      `id,starts_at,${w.flag},patients(name,phone),doctors(name)`
    ).eq("status", "booked").eq(w.flag, false)
      .gte("starts_at", new Date(now + w.min * 3600000).toISOString())
      .lte("starts_at", new Date(now + w.max * 3600000).toISOString());

    if (r.error) { console.error("Reminder query:", r.error.message); continue; }

    for (const a of r.data || []) {
      try {
        const dt = new Date(a.starts_at);
        await sendTemplate(
          a.patients.phone,
          process.env.WHATSAPP_REMINDER_TEMPLATE_NAME,
          process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE || "en_US",
          [a.patients.name || "Patient", a.doctors.name,
           dt.toLocaleDateString("en-KE"),
           dt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })]
        );
        await supabase.from("appointments")
          .update({ [w.flag]: true, updated_at: new Date().toISOString() })
          .eq("id", a.id);
      } catch (e) { console.error(`Reminder ${a.id}:`, e.message); }
    }
  }
}

function startReminders() {
  cron.schedule("* * * * *", runReminders);
  console.log("Reminder scheduler started.");
}

module.exports = { startReminders, runReminders };
