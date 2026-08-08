require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const crypto = require("crypto");
const { testDatabase, supabase } = require("./config/supabase");
const { sendText } = require("./services/whatsapp");
const { context, reply } = require("./services/ai");
const appts = require("./services/appointments");
const { startReminders } = require("./services/reminders");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function validMetaSignature(req) {
  if (!process.env.META_APP_SECRET) return true;
  const received = req.get("X-Hub-Signature-256");
  if (!received) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", process.env.META_APP_SECRET)
    .update(JSON.stringify(req.body)).digest("hex");
  return received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function patientFor(phone) {
  if (!process.env.DEFAULT_CLINIC_ID) throw new Error("DEFAULT_CLINIC_ID is required.");
  return appts.findOrCreatePatient(process.env.DEFAULT_CLINIC_ID, phone);
}

async function handleMessage(phone, text) {
  const clinicId = process.env.DEFAULT_CLINIC_ID;
  const patient = await patientFor(phone);
  const ctx = await context(clinicId);
  const answer = await reply(text, ctx);

  if (answer === "HUMAN_SUPPORT") {
    await supabase.from("support_tickets").insert({
      clinic_id: clinicId, patient_id: patient.id, phone, message: text, status: "open"
    });
    return sendText(phone, "A member of our support team will assist you shortly. 👩‍⚕️");
  }

  if (answer === "BOOK_APPOINTMENT") {
    return sendText(phone,
      "Sure. Send the specialty, preferred date, preferred time and your full name. Example: Cardiology, 10 Aug, 10:00 AM, John Doe."
    );
  }

  if (answer === "RESCHEDULE_APPOINTMENT") {
    const list = await appts.patientAppointments(patient.id);
    if (!list.length) return sendText(phone, "I couldn't find an upcoming appointment for this number.");
    return sendText(phone, "Your appointments:\n" +
      list.map((x,i) => `${i+1}. ${x.doctors.name} — ${new Date(x.starts_at).toLocaleString("en-KE")}`).join("\n") +
      "\n\nTell me which one you want to reschedule and the new date/time.");
  }

  if (answer === "CANCEL_APPOINTMENT") {
    const list = await appts.patientAppointments(patient.id);
    if (!list.length) return sendText(phone, "I couldn't find an upcoming appointment for this number.");
    return sendText(phone, "Your appointments:\n" +
      list.map((x,i) => `${i+1}. ${x.doctors.name} — ${new Date(x.starts_at).toLocaleString("en-KE")}`).join("\n") +
      "\n\nReply with the appointment number you want to cancel.");
  }

  return sendText(phone, answer);
}

app.get("/health", async (req,res) => {
  try {
    await testDatabase();
    res.json({ ok:true, database:"connected", service:"whatsapp-clinic-ai" });
  } catch(e) { res.status(500).json({ ok:false, database:"disconnected", error:e.message }); }
});

app.get("/webhook", (req,res) => {
  if (req.query["hub.mode"] === "subscribe" &&
      req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req,res) => {
  if (!validMetaSignature(req)) return res.sendStatus(403);
  res.sendStatus(200);
  try {
    for (const entry of req.body.entry || []) {
      for (const change of entry.changes || []) {
        for (const msg of change.value?.messages || []) {
          if (msg.type === "text") await handleMessage(msg.from, msg.text.body);
        }
      }
    }
  } catch(e) { console.error("Webhook error:", e.message); }
});

app.use("/api/appointments", require("./routes/appointments"));
app.use("/api/doctors", require("./routes/doctors"));
app.use("/api/clinics", require("./routes/clinics"));

app.listen(PORT, async () => {
  console.log(`API listening on port ${PORT}`);
  try { await testDatabase(); startReminders(); }
  catch(e) { console.error("Startup database error:", e.message); }
});
