require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

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

/* =========================================================
   META WEBHOOK SIGNATURE VALIDATION
========================================================= */

function validMetaSignature(req) {
  // During development, skip signature validation if no
  // META_APP_SECRET is configured.
  if (!process.env.META_APP_SECRET) {
    return true;
  }

  const received = req.get("X-Hub-Signature-256");

  if (!received) {
    return false;
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.META_APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/* =========================================================
   PATIENT
========================================================= */

async function patientFor(phone) {
  const clinicId = process.env.DEFAULT_CLINIC_ID;

  if (!clinicId) {
    throw new Error("DEFAULT_CLINIC_ID is required.");
  }

  return appts.findOrCreatePatient(clinicId, phone);
}

/* =========================================================
   HANDLE WHATSAPP MESSAGE
========================================================= */

async function handleMessage(phone, text) {
  try {
    const clinicId = process.env.DEFAULT_CLINIC_ID;

    if (!clinicId) {
      throw new Error("DEFAULT_CLINIC_ID is required.");
    }

    console.log("👤 Patient:", phone);
    console.log("💬 Message:", text);

    // Find or create patient in Supabase
    const patient = await patientFor(phone);

    console.log("✅ Patient found:", patient.id);

    // Get clinic information
    console.log("🔎 Loading clinic information...");

    const clinicContext = await context(clinicId);

    // Ask Gemini
    console.log("🤖 Sending message to Gemini...");

    const answer = await reply(text, clinicContext);

    console.log("🤖 Gemini response:", answer);

    /* =====================================================
       HUMAN SUPPORT
    ===================================================== */

    if (answer === "HUMAN_SUPPORT") {
      console.log("👩‍⚕️ Human support requested.");

      const { error } = await supabase.from("support_tickets").insert({
        clinic_id: clinicId,
        patient_id: patient.id,
        phone,
        message: text,
        status: "open",
      });

      if (error) {
        console.error("Support ticket error:", error);
      }

      await sendText(
        phone,
        "A member of our support team will assist you shortly. 👩‍⚕️",
      );

      return;
    }

    /* =====================================================
       BOOK APPOINTMENT
    ===================================================== */

    if (answer === "BOOK_APPOINTMENT") {
      await sendText(
        phone,
        "Sure! I can help you book an appointment. 🏥\n\n" +
          "Please send me:\n" +
          "1. Specialty or doctor\n" +
          "2. Preferred date\n" +
          "3. Preferred time\n" +
          "4. Your full name\n\n" +
          "Example:\n" +
          "Cardiology, 10 Aug, 10:00 AM, John Doe",
      );

      return;
    }

    /* =====================================================
       RESCHEDULE APPOINTMENT
    ===================================================== */

    if (answer === "RESCHEDULE_APPOINTMENT") {
      const list = await appts.patientAppointments(patient.id);

      if (!list.length) {
        await sendText(
          phone,
          "I couldn't find an upcoming appointment for this number.",
        );

        return;
      }

      const appointmentsText = list
        .map((appointment, index) => {
          const doctorName = appointment.doctors?.name || "Doctor";

          const date = new Date(appointment.starts_at).toLocaleString("en-KE");

          return `${index + 1}. ${doctorName} — ${date}`;
        })
        .join("\n");

      await sendText(
        phone,
        "Your upcoming appointments:\n\n" +
          appointmentsText +
          "\n\n" +
          "Reply with the appointment number and your preferred new date/time.",
      );

      return;
    }

    /* =====================================================
       CANCEL APPOINTMENT
    ===================================================== */

    if (answer === "CANCEL_APPOINTMENT") {
      const list = await appts.patientAppointments(patient.id);

      if (!list.length) {
        await sendText(
          phone,
          "I couldn't find an upcoming appointment for this number.",
        );

        return;
      }

      const appointmentsText = list
        .map((appointment, index) => {
          const doctorName = appointment.doctors?.name || "Doctor";

          const date = new Date(appointment.starts_at).toLocaleString("en-KE");

          return `${index + 1}. ${doctorName} — ${date}`;
        })
        .join("\n");

      await sendText(
        phone,
        "Your upcoming appointments:\n\n" +
          appointmentsText +
          "\n\n" +
          "Reply with the appointment number you want to cancel.",
      );

      return;
    }

    /* =====================================================
       NORMAL AI RESPONSE
    ===================================================== */

    await sendText(phone, answer);

    console.log("✅ Reply sent to:", phone);
  } catch (error) {
    console.error(
      "❌ Message handling error:",
      error.response?.data || error.message || error,
    );

    // Try to tell the patient something went wrong
    try {
      await sendText(
        phone,
        "Sorry, I'm having trouble processing your request right now. Please try again shortly.",
      );
    } catch (sendError) {
      console.error(
        "❌ Could not send error message:",
        sendError.response?.data || sendError.message,
      );
    }
  }
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", async (req, res) => {
  try {
    await testDatabase();

    res.json({
      ok: true,
      database: "connected",
      service: "whatsapp-clinic-ai",
      ai: "Gemini",
    });
  } catch (error) {
    console.error("Health check error:", error);

    res.status(500).json({
      ok: false,
      database: "disconnected",
      error: error.message,
    });
  }
});

/* =========================================================
   WHATSAPP WEBHOOK VERIFICATION
========================================================= */

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("WhatsApp webhook verification request");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ WhatsApp webhook verified.");

    return res.status(200).send(challenge);
  }

  console.log("❌ WhatsApp webhook verification failed.");

  return res.sendStatus(403);
});

/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post("/webhook", async (req, res) => {
  console.log("=================================");
  console.log("📩 WHATSAPP WEBHOOK RECEIVED");
  console.log("=================================");

  console.log(JSON.stringify(req.body, null, 2));

  /*
   * IMPORTANT:
   * Respond to Meta immediately.
   */
  res.sendStatus(200);

  try {
    /* =====================================================
       OPTIONAL META SIGNATURE CHECK
    ===================================================== */

    if (!validMetaSignature(req)) {
      console.log("❌ Invalid Meta webhook signature.");
      return;
    }

    const entry = req.body?.entry?.[0];

    const change = entry?.changes?.[0];

    const value = change?.value;

    if (!value) {
      console.log("No webhook value found.");
      return;
    }

    /* =====================================================
       IGNORE STATUS UPDATES
    ===================================================== */

    if (!value.messages || !value.messages.length) {
      console.log("No incoming WhatsApp messages.");
      return;
    }

    const message = value.messages[0];

    console.log("📨 Message:", message);

    /* =====================================================
       ONLY PROCESS TEXT MESSAGES FOR NOW
    ===================================================== */

    if (message.type !== "text") {
      console.log("Message type not supported:", message.type);

      return;
    }

    /* =====================================================
       GET PATIENT NUMBER
    ===================================================== */

    const from = message.from;

    const text = message.text?.body?.trim();

    if (!from) {
      console.log("❌ No sender phone number found.");
      return;
    }

    if (!text) {
      console.log("❌ Empty message.");
      return;
    }

    console.log("📱 FROM:", from);
    console.log("💬 TEXT:", text);

    /* =====================================================
       PROCESS MESSAGE
    ===================================================== */

    await handleMessage(from, text);

    console.log("✅ WhatsApp message processed successfully.");
  } catch (error) {
    console.error(
      "❌ Webhook processing error:",
      error.response?.data || error.message || error,
    );
  }
});

/* =========================================================
   API ROUTES
========================================================= */

app.use("/api/appointments", require("./routes/appointments"));

app.use("/api/doctors", require("./routes/doctors"));

app.use("/api/clinics", require("./routes/clinics"));

/* =========================================================
   ROOT ROUTE
========================================================= */

app.get("/", (req, res) => {
  res.json({
    service: "WhatsApp Clinic AI",
    status: "running",
    ai: "Google Gemini",
    whatsapp: "WhatsApp Cloud API",
    database: "Supabase",
  });
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, async () => {
  console.log("=================================");
  console.log("🏥 ClinicFlow AI");
  console.log("=================================");
  console.log(`🚀 API listening on port ${PORT}`);
  console.log(`🤖 AI: Google Gemini`);
  console.log(`💬 WhatsApp: Cloud API`);
  console.log(`🗄️ Database: Supabase`);
  console.log("=================================");

  try {
    await testDatabase();

    console.log("✅ Supabase connected.");

    startReminders();

    console.log("⏰ Appointment reminders started.");
  } catch (error) {
    console.error("❌ Startup database error:", error.message);
  }
});

console.log("SUPABASE URL:", process.env.SUPABASE_URL);
console.log("SUPABASE KEY LOADED:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
