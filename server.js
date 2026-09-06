<<<<<<< HEAD
require("dotenv").config();

const express = require("express");
const path = require("path");
=======
require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

const express = require("express");
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
const crypto = require("crypto");

const { testDatabase, supabase } = require("./config/supabase");
const { sendText } = require("./services/whatsapp");
const { context, reply } = require("./services/ai");
const appts = require("./services/appointments");
const { startReminders } = require("./services/reminders");

const app = express();

app.use(express.json());

<<<<<<< HEAD
app.use(express.static(path.join(__dirname, "public")));

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

/* =========================================================
   WHATSAPP MENU
========================================================= */

const MAIN_MENU = `🏥 *Welcome to Demo Health Clinic!*

Hello 👋 and thank you for contacting us.

I'm *ClinicFlow AI*, your virtual clinic assistant. I can help you with:

1️⃣ *Book an Appointment*
2️⃣ *Reschedule an Appointment*
3️⃣ *Cancel an Appointment*
4️⃣ *Find a Doctor*
5️⃣ *Check Doctor Availability*
6️⃣ *Clinic Information*
7️⃣ *Frequently Asked Questions*
8️⃣ *Speak to Support*

💬 Reply with a number or simply tell me what you need.`;

/* =========================================================
   CONVERSATION STATE
========================================================= */

const userStates = new Map();

function setUserState(phone, state, data = {}) {
  userStates.set(phone, {
    state,
    ...data,
  });
}

function getUserState(phone) {
  return userStates.get(phone) || null;
}

function clearUserState(phone) {
  userStates.delete(phone);
}

/* =========================================================
   META WEBHOOK SIGNATURE
========================================================= */
function validMetaSignature(req) {
  return true;
}

/* =========================================================
   HELPERS
========================================================= */

async function patientFor(phone) {
  if (!process.env.DEFAULT_CLINIC_ID) {
    throw new Error("DEFAULT_CLINIC_ID is required.");
  }

  return appts.findOrCreatePatient(process.env.DEFAULT_CLINIC_ID, phone);
}

async function sendMainMenu(phone) {
  await sendText(phone, MAIN_MENU);
}

function parseAppointmentDate(dateText, timeText = "") {
  let value = `${dateText} ${timeText}`.trim();

  let parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  // Try adding current year for input such as "20 August"
  if (!/\b20\d{2}\b/.test(value)) {
    value = `${value} ${new Date().getFullYear()}`;
    parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function formatAppointmentDate(date) {
  return new Date(date).toLocaleString("en-KE", {
    timeZone: process.env.GOOGLE_TIMEZONE || "Africa/Nairobi",
    dateStyle: "full",
    timeStyle: "short",
  });
}

async function bookFirstAvailableDoctor({
  clinicId,
  phone,
  patientName,
  specialty,
  startsAt,
}) {
  const doctors = await appts.findDoctorsBySpecialty(clinicId, specialty);

  if (!doctors || doctors.length === 0) {
    return {
      appointment: null,
      reason: "NO_DOCTORS",
    };
  }

  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

  const patient = await appts.findOrCreatePatient(clinicId, phone, patientName);

  for (const doctor of doctors) {
    const available = await appts.isSlotFree(
      doctor.id,
      startsAt.toISOString(),
      endsAt.toISOString(),
    );

    if (!available) {
      continue;
    }

    const appointment = await appts.createAppointment({
      clinicId,
      patientId: patient.id,
      doctorId: doctor.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      reason: `WhatsApp appointment - ${specialty}`,
    });

    return {
      appointment,
      patient,
      reason: null,
    };
  }

  return {
    appointment: null,
    reason: "NO_SLOTS",
  };
}

/* =========================================================
   HANDLE MENU OPTION
========================================================= */

async function handleMenuOption(phone, input) {
  switch (input) {
    /* ================================================
       OPTION 1 — BOOK APPOINTMENT
    ================================================ */

    case "1":
      setUserState(phone, "BOOKING_SPECIALTY");

      await sendText(
        phone,
        `📅 *Book an Appointment*

Please choose a specialty:

1️⃣ Cardiology
2️⃣ Pediatrics
3️⃣ General Medicine
4️⃣ Dermatology
5️⃣ Dental

Reply with the number of your preferred specialty.`,
      );

      return true;

    /* ================================================
       OPTION 2 — RESCHEDULE
    ================================================ */

    case "2":
      try {
        const patient = await patientFor(phone);

        const appointments = await appts.patientAppointments(patient.id);

        if (!appointments.length) {
          await sendText(
            phone,
            `You currently don't have any active appointments to reschedule.`,
          );

          return true;
        }

        const list = appointments
          .map(
            (appointment, index) =>
              `${index + 1}. ${
                appointment.doctors?.name || "Doctor"
              } — ${formatAppointmentDate(appointment.starts_at)}`,
          )
          .join("\n");

        setUserState(phone, "RESCHEDULE_SELECT", {
          appointments,
        });

        await sendText(
          phone,
          `📅 *Your Appointments*

${list}

Reply with the appointment number you want to reschedule.`,
        );
      } catch (error) {
        console.error("Reschedule error:", error);

        await sendText(
          phone,
          `Sorry, I couldn't retrieve your appointments right now.`,
        );
      }

      return true;

    /* ================================================
       OPTION 3 — CANCEL
    ================================================ */

    case "3":
      try {
        const patient = await patientFor(phone);

        const appointments = await appts.patientAppointments(patient.id);

        if (!appointments.length) {
          await sendText(
            phone,
            `You currently don't have any active appointments to cancel.`,
          );

          return true;
        }

        const list = appointments
          .map(
            (appointment, index) =>
              `${index + 1}. ${
                appointment.doctors?.name || "Doctor"
              } — ${formatAppointmentDate(appointment.starts_at)}`,
          )
          .join("\n");

        setUserState(phone, "CANCEL_SELECT", {
          appointments,
        });

        await sendText(
          phone,
          `❌ *Cancel an Appointment*

${list}

Reply with the appointment number you want to cancel.`,
        );
      } catch (error) {
        console.error("Cancel appointment error:", error);

        await sendText(
          phone,
          `Sorry, I couldn't retrieve your appointments right now.`,
        );
      }

      return true;

    /* ================================================
       OPTION 4 — FIND DOCTOR
    ================================================ */

    case "4":
      setUserState(phone, "FIND_DOCTOR");

      await sendText(
        phone,
        `👨‍⚕️ *Find a Doctor*

Tell me the specialty you are looking for.

Examples:
• Cardiology
• Pediatrics
• General Medicine
• Dermatology
• Dental`,
      );

      return true;

    /* ================================================
       OPTION 5 — DOCTOR AVAILABILITY
    ================================================ */

    case "5":
      setUserState(phone, "DOCTOR_AVAILABILITY");

      await sendText(
        phone,
        `🗓️ *Check Doctor Availability*

Please tell me:

• Specialty
• Preferred date

Example:

Cardiology tomorrow`,
      );

      return true;

    /* ================================================
       OPTION 6 — CLINIC INFORMATION
    ================================================ */

    case "6":
      setUserState(phone, "CLINIC_INFORMATION");

      await sendText(
        phone,
        `🏥 *Clinic Information*

What would you like to know?

📍 Location
🕐 Opening hours
🩺 Services
☎️ Contact information
🌐 Website`,
      );

      return true;

    /* ================================================
       OPTION 7 — FAQ
    ================================================ */

    case "7":
      setUserState(phone, "FAQ");

      await sendText(
        phone,
        `❓ *Frequently Asked Questions*

Please type your question and I'll help you.`,
      );

      return true;

    /* ================================================
       OPTION 8 — HUMAN SUPPORT
    ================================================ */

    case "8":
      try {
        const patient = await patientFor(phone);

        await supabase.from("support_tickets").insert({
          clinic_id: process.env.DEFAULT_CLINIC_ID,
          patient_id: patient.id,
          phone,
          message: "Patient requested human support.",
          status: "open",
        });
      } catch (error) {
        console.error("Support ticket error:", error.message);
      }

      await sendText(
        phone,
        `👩‍⚕️ *Human Support*

Your request has been sent to our support team.

Please describe what you need help with.`,
      );

      return true;

    default:
      return false;
  }
}

/* =========================================================
   HANDLE CONVERSATION STATE
========================================================= */

async function handleConversationState(phone, text, userState) {
  const state = userState.state;
  const input = text.trim().toLowerCase();

  /* ================================================
     BOOKING SPECIALTY
  ================================================ */

  if (state === "BOOKING_SPECIALTY") {
    const specialties = {
      1: "Cardiology",
      2: "Pediatrics",
      3: "General Medicine",
      4: "Dermatology",
      5: "Dental",
    };

    const specialty = specialties[input];

    if (!specialty) {
      await sendText(
        phone,
        `Please choose a specialty by replying with:

1 — Cardiology
2 — Pediatrics
3 — General Medicine
4 — Dermatology
5 — Dental`,
      );

      return true;
    }

    setUserState(phone, "BOOKING_DETAILS", {
      specialty,
    });

    await sendText(
      phone,
      `✅ *${specialty}* selected.

Please send your appointment details in exactly this format:

👤 Full name
📅 Preferred date
🕐 Preferred time

Example:

John Doe
20 August 2026
10:00 AM`,
    );

    return true;
  }

  /* ================================================
     BOOKING DETAILS
  ================================================ */

  if (state === "BOOKING_DETAILS") {
    try {
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 3) {
        await sendText(
          phone,
          `Please send all three details on separate lines:

John Doe
20 August 2026
10:00 AM`,
        );

        return true;
      }

      const patientName = lines[0];
      const dateText = lines[1];
      const timeText = lines.slice(2).join(" ");

      const specialty = userState.specialty;

      if (!specialty) {
        clearUserState(phone);

        await sendText(
          phone,
          `Your booking session expired. Please reply *1* to start again.`,
        );

        return true;
      }

      const startsAt = parseAppointmentDate(dateText, timeText);

      if (!startsAt) {
        await sendText(
          phone,
          `I couldn't understand that date or time.

Please try again using:

John Doe
20 August 2026
10:00 AM`,
        );

        return true;
      }

      if (startsAt.getTime() <= Date.now()) {
        await sendText(phone, `Please choose a future date and time.`);

        return true;
      }

      await sendText(
        phone,
        `⏳ Checking *${specialty}* doctor availability...`,
      );

      const result = await bookFirstAvailableDoctor({
        clinicId: process.env.DEFAULT_CLINIC_ID,
        phone,
        patientName,
        specialty,
        startsAt,
      });

      if (result.reason === "NO_DOCTORS") {
        clearUserState(phone);

        await sendText(
          phone,
          `Sorry, we couldn't find a *${specialty}* doctor at this clinic.

Reply *1* to start another appointment booking.`,
        );

        return true;
      }

      if (result.reason === "NO_SLOTS") {
        setUserState(phone, "BOOKING_NEW_TIME", {
          specialty,
          patientName,
        });

        await sendText(
          phone,
          `❌ No *${specialty}* doctor is available at that time.

Please send another preferred date and time.

Example:

21 August 2026 2:00 PM`,
        );

        return true;
      }

      clearUserState(phone);

      const appointment = result.appointment;

      await sendText(
        phone,
        `✅ *Appointment Confirmed!*

👤 *Patient:* ${patientName}
👨‍⚕️ *Doctor:* ${appointment.doctors?.name || "Assigned Doctor"}
🩺 *Specialty:* ${specialty}
📅 *Date & Time:* ${formatAppointmentDate(appointment.starts_at)}

Your appointment has been successfully booked. 🏥`,
      );

      return true;
    } catch (error) {
      console.error("Booking error:", error);

      await sendText(
        phone,
        `❌ Sorry, I couldn't complete your appointment booking.

Please reply *1* and try again.`,
      );

      return true;
    }
  }

  /* ================================================
     BOOKING NEW TIME
  ================================================ */

  if (state === "BOOKING_NEW_TIME") {
    try {
      const startsAt = parseAppointmentDate(text);

      if (!startsAt) {
        await sendText(
          phone,
          `I couldn't understand that date and time.

Please send something like:

21 August 2026 2:00 PM`,
        );

        return true;
      }

      if (startsAt.getTime() <= Date.now()) {
        await sendText(phone, `Please choose a future date and time.`);

        return true;
      }

      const result = await bookFirstAvailableDoctor({
        clinicId: process.env.DEFAULT_CLINIC_ID,
        phone,
        patientName: userState.patientName,
        specialty: userState.specialty,
        startsAt,
      });

      if (result.reason === "NO_SLOTS") {
        await sendText(
          phone,
          `❌ That time is also unavailable.

Please send another date and time.`,
        );

        return true;
      }

      if (result.reason === "NO_DOCTORS") {
        clearUserState(phone);

        await sendText(phone, `Sorry, no matching doctor could be found.`);

        return true;
      }

      clearUserState(phone);

      const appointment = result.appointment;

      await sendText(
        phone,
        `✅ *Appointment Confirmed!*

👤 *Patient:* ${userState.patientName}
👨‍⚕️ *Doctor:* ${appointment.doctors?.name || "Assigned Doctor"}
🩺 *Specialty:* ${userState.specialty}
📅 *Date & Time:* ${formatAppointmentDate(appointment.starts_at)}

Your appointment has been successfully booked.`,
      );

      return true;
    } catch (error) {
      console.error("New booking time error:", error);

      await sendText(
        phone,
        `Sorry, something went wrong while checking that time.

Please try another date and time.`,
      );

      return true;
    }
  }

  /* ================================================
     RESCHEDULE SELECT
  ================================================ */

  if (state === "RESCHEDULE_SELECT") {
    const index = Number(input) - 1;
    const appointment = userState.appointments?.[index];

    if (!appointment) {
      await sendText(phone, `Please reply with a valid appointment number.`);

      return true;
    }

    setUserState(phone, "RESCHEDULE_NEW_TIME", {
      appointmentId: appointment.id,
    });

    await sendText(
      phone,
      `Please send the new appointment date and time.

Example:

21 August 2026 2:00 PM`,
    );

    return true;
  }

  /* ================================================
     RESCHEDULE NEW TIME
  ================================================ */

  if (state === "RESCHEDULE_NEW_TIME") {
    try {
      const startsAt = parseAppointmentDate(text);

      if (!startsAt) {
        await sendText(
          phone,
          `I couldn't understand that date and time. Please try again.`,
        );

        return true;
      }

      const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

      const appointment = await appts.rescheduleAppointment({
        appointmentId: userState.appointmentId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });

      clearUserState(phone);

      await sendText(
        phone,
        `✅ Your appointment has been rescheduled to:

📅 ${formatAppointmentDate(appointment.starts_at)}`,
      );

      return true;
    } catch (error) {
      console.error("Reschedule error:", error);

      await sendText(
        phone,
        `❌ ${error.message}

Please try another date and time.`,
      );

      return true;
    }
  }

  /* ================================================
     CANCEL SELECT
  ================================================ */

  if (state === "CANCEL_SELECT") {
    const index = Number(input) - 1;
    const appointment = userState.appointments?.[index];

    if (!appointment) {
      await sendText(phone, `Please reply with a valid appointment number.`);

      return true;
    }

    await appts.cancelAppointment(appointment.id);

    clearUserState(phone);

    await sendText(
      phone,
      `✅ Your appointment has been cancelled successfully.`,
    );

    return true;
  }

  /* ================================================
     FIND DOCTOR
  ================================================ */

  if (state === "FIND_DOCTOR") {
    clearUserState(phone);

    const clinicContext = await context(process.env.DEFAULT_CLINIC_ID);

    const answer = await reply(
      `The patient is looking for this type of doctor:

${text}

Please provide doctors matching this specialty using ONLY the clinic information provided.`,
      clinicContext,
    );

    await sendText(phone, answer);

    return true;
  }

  /* ================================================
     DOCTOR AVAILABILITY
  ================================================ */

  if (state === "DOCTOR_AVAILABILITY") {
    clearUserState(phone);

    const clinicContext = await context(process.env.DEFAULT_CLINIC_ID);

    const answer = await reply(
      `The patient wants to check doctor availability.

Request:
${text}

Only provide availability that exists in the clinic data. Never invent appointment times.`,
      clinicContext,
    );

    await sendText(phone, answer);

    return true;
  }

  /* ================================================
     CLINIC INFORMATION
  ================================================ */

  if (state === "CLINIC_INFORMATION") {
    clearUserState(phone);

    const clinicContext = await context(process.env.DEFAULT_CLINIC_ID);

    const answer = await reply(
      `The patient wants clinic information.

Question:
${text}

Answer using only the clinic information provided.`,
      clinicContext,
    );

    await sendText(phone, answer);

    return true;
  }

  /* ================================================
     FAQ
  ================================================ */

  if (state === "FAQ") {
    clearUserState(phone);

    const clinicContext = await context(process.env.DEFAULT_CLINIC_ID);

    const answer = await reply(
      `Answer this patient FAQ using only the clinic information provided:

${text}`,
      clinicContext,
    );

    await sendText(phone, answer);

    return true;
  }

  return false;
=======
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
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
}

/* =========================================================
   HANDLE WHATSAPP MESSAGE
========================================================= */

async function handleMessage(phone, text) {
<<<<<<< HEAD
  const input = text.trim().toLowerCase();

  /* ================================================
     MENU COMMANDS
  ================================================ */

  if (input === "menu" || input === "home" || input === "start") {
    clearUserState(phone);

    await sendMainMenu(phone);

    return;
  }

  /* ================================================
     GREETING
  ================================================ */

  if (input === "hi" || input === "hello" || input === "hey") {
    clearUserState(phone);

    await sendMainMenu(phone);

    return;
  }

  /* ================================================
     CHECK ACTIVE STATE
  ================================================ */

  const userState = getUserState(phone);

  if (userState) {
    const handled = await handleConversationState(phone, text, userState);

    if (handled) {
      return;
    }
  }

  /* ================================================
     MAIN MENU OPTIONS
  ================================================ */

  if (["1", "2", "3", "4", "5", "6", "7", "8"].includes(input)) {
    const handled = await handleMenuOption(phone, input);

    if (handled) {
      return;
    }
  }

  /* ================================================
     NORMAL AI RESPONSE
  ================================================ */

  try {
    const clinicContext = await context(process.env.DEFAULT_CLINIC_ID);

    const answer = await reply(text, clinicContext);

    await sendText(phone, answer);
  } catch (error) {
    console.error("AI response error:", error);

    await sendText(
      phone,
      `Sorry, I couldn't process your request right now.

Reply *menu* to see the available options.`,
    );
=======
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
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
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
<<<<<<< HEAD
    });
  } catch (error) {
=======
      ai: "Gemini",
    });
  } catch (error) {
    console.error("Health check error:", error);

>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
    res.status(500).json({
      ok: false,
      database: "disconnected",
      error: error.message,
    });
  }
});

/* =========================================================
<<<<<<< HEAD
   META WEBHOOK VERIFICATION
=======
   WHATSAPP WEBHOOK VERIFICATION
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
========================================================= */

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

<<<<<<< HEAD
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ WhatsApp webhook verified");
=======
  console.log("WhatsApp webhook verification request");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ WhatsApp webhook verified.");
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac

    return res.status(200).send(challenge);
  }

<<<<<<< HEAD
  console.log("❌ WhatsApp webhook verification failed");
=======
  console.log("❌ WhatsApp webhook verification failed.");
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac

  return res.sendStatus(403);
});

/* =========================================================
   WHATSAPP WEBHOOK
========================================================= */

app.post("/webhook", async (req, res) => {
  console.log("=================================");
  console.log("📩 WHATSAPP WEBHOOK RECEIVED");
<<<<<<< HEAD
  console.log(JSON.stringify(req.body, null, 2));
  console.log("=================================");

  // Respond immediately so Meta does not time out.
  res.sendStatus(200);

  try {
    if (!validMetaSignature(req)) {
      console.error("❌ Invalid Meta webhook signature");
=======
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
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
      return;
    }

    const entry = req.body?.entry?.[0];
<<<<<<< HEAD
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages?.length) {
      console.log("ℹ️ Webhook event contains no messages.");
=======

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
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
      return;
    }

    const message = value.messages[0];

<<<<<<< HEAD
    if (message.type !== "text") {
      console.log("ℹ️ Message is not text.");
      return;
    }

    const phone = message.from;
    const text = message.text?.body;

    if (!phone || !text) {
      console.log("⚠️ Missing phone or message text.");
      return;
    }

    console.log("📱 FROM:", phone);
    console.log("💬 TEXT:", text);

    await handleMessage(phone, text);

    console.log("✅ Message processed successfully.");
  } catch (error) {
    console.error("❌ Message handling error:", error);
=======
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
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
  }
});

/* =========================================================
   API ROUTES
========================================================= */

app.use("/api/appointments", require("./routes/appointments"));

app.use("/api/doctors", require("./routes/doctors"));

app.use("/api/clinics", require("./routes/clinics"));

/* =========================================================
<<<<<<< HEAD
=======
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
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
   START SERVER
========================================================= */

app.listen(PORT, async () => {
  console.log("=================================");
<<<<<<< HEAD
  console.log(`🚀 ClinicFlow API listening on port ${PORT}`);
=======
  console.log("🏥 ClinicFlow AI");
  console.log("=================================");
  console.log(`🚀 API listening on port ${PORT}`);
  console.log(`🤖 AI: Google Gemini`);
  console.log(`💬 WhatsApp: Cloud API`);
  console.log(`🗄️ Database: Supabase`);
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
  console.log("=================================");

  try {
    await testDatabase();

<<<<<<< HEAD
    console.log("✅ Supabase connected");

    startReminders();

    console.log("✅ Appointment reminders started");
=======
    console.log("✅ Supabase connected.");

    startReminders();

    console.log("⏰ Appointment reminders started.");
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
  } catch (error) {
    console.error("❌ Startup database error:", error.message);
  }
});
<<<<<<< HEAD
=======

console.log("SUPABASE URL:", process.env.SUPABASE_URL);
console.log("SUPABASE KEY LOADED:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
>>>>>>> bdc32ff64f0b65326607727bb04f664f1f478cac
