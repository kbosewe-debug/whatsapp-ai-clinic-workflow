require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");
const cron = require("node-cron");
const path = require("path");

const { processIncomingMessage } = require("./services/openai");
const {
  sendTextMessage,
  sendTemplateMessage,
  verifyWebhookSignature,
} = require("./services/whatsapp");
const { connectDatabase, getDefaultClinic } = require("./services/db");
const {
  getAvailableSlots,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
} = require("./services/appointments");
const { runReminderJob } = require("./services/reminders");

const Clinic = require("./models/Clinic");
const Doctor = require("./models/Doctor");
const Appointment = require("./models/Appointment");
const Faq = require("./models/Faq");
const SupportRequest = require("./models/SupportRequest");

const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-api-key"],
  }),
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    return res.status(500).json({
      error: "ADMIN_API_KEY is not configured.",
    });
  }

  if (req.headers["x-admin-api-key"] !== expected) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  next();
}

function getClinicIdFromRequest(req) {
  return (
    req.query.clinicId || req.body.clinicId || process.env.DEFAULT_CLINIC_ID
  );
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "whatsapp-ai-bot",
    timestamp: new Date().toISOString(),
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// -------------------------
// Dashboard configuration endpoints
// -------------------------
app.get("/api/clinic", adminAuth, async (req, res) => {
  try {
    const clinicId = getClinicIdFromRequest(req);
    const clinic = clinicId
      ? await Clinic.findById(clinicId).lean()
      : await getDefaultClinic();

    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }

    res.json(clinic);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch clinic." });
  }
});

app.patch("/api/clinic", adminAuth, async (req, res) => {
  try {
    const clinicId = getClinicIdFromRequest(req);
    if (!clinicId) {
      return res.status(400).json({ error: "clinicId is required." });
    }

    const allowedFields = [
      "name",
      "phone",
      "address",
      "website",
      "timezone",
      "openingHours",
      "active",
    ];

    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) =>
        allowedFields.includes(key),
      ),
    );

    const clinic = await Clinic.findByIdAndUpdate(clinicId, updates, {
      new: true,
      runValidators: true,
    });

    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }

    res.json(clinic);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to update clinic.",
      details: error.message,
    });
  }
});

app.get("/api/system/status", adminAuth, async (_req, res) => {
  res.json({
    database: mongoose.connection.readyState === 1,
    openai: Boolean(process.env.OPENAI_API_KEY),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
    ),
    googleCalendar:
      String(process.env.GOOGLE_CALENDAR_ENABLED).toLowerCase() === "true" &&
      Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64),
    reminders: Boolean(process.env.WHATSAPP_REMINDER_TEMPLATE_NAME),
  });
});

// -------------------------
// WhatsApp webhook verification
// -------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// -------------------------
// WhatsApp incoming webhook
// -------------------------
app.post("/webhook", (req, res) => {
  if (process.env.META_APP_SECRET && req.rawBody) {
    const signature = req.headers["x-hub-signature-256"];

    if (
      !verifyWebhookSignature(
        req.rawBody,
        signature,
        process.env.META_APP_SECRET,
      )
    ) {
      return res.status(401).json({ error: "Invalid webhook signature." });
    }
  }

  // Acknowledge Meta quickly. Process the message asynchronously.
  res.sendStatus(200);

  processIncomingMessage(req.body).catch((error) => {
    console.error("WhatsApp message processing failed:", error);
  });
});

// -------------------------
// Admin / integration API
// -------------------------
app.get("/api/doctors", adminAuth, async (req, res) => {
  try {
    const clinicId = getClinicIdFromRequest(req);
    const filter = clinicId ? { clinicId } : {};

    const doctors = await Doctor.find(filter).sort({ name: 1 }).lean();

    res.json(doctors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch doctors." });
  }
});

app.post("/api/doctors", adminAuth, async (req, res) => {
  try {
    const doctor = await Doctor.create(req.body);
    res.status(201).json(doctor);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to create doctor.",
      details: error.message,
    });
  }
});

app.patch("/api/doctors/:id", adminAuth, async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found." });
    }

    res.json(doctor);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to update doctor.",
      details: error.message,
    });
  }
});

app.post("/api/availability", adminAuth, async (req, res) => {
  try {
    const { clinicId, doctorId, specialty, date, durationMinutes, limit } =
      req.body;

    const clinic = await Clinic.findById(
      clinicId || process.env.DEFAULT_CLINIC_ID,
    );

    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }

    const results = await getAvailableSlots({
      clinic,
      doctorId,
      specialty,
      date,
      durationMinutes,
      limit,
    });

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to check availability.",
      details: error.message,
    });
  }
});

app.post("/api/appointments", adminAuth, async (req, res) => {
  try {
    const appointment = await createAppointment(req.body);
    res.status(201).json(appointment);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to create appointment.",
      details: error.message,
    });
  }
});

app.get("/api/appointments", adminAuth, async (req, res) => {
  try {
    const filter = {};

    if (req.query.clinicId) filter.clinicId = req.query.clinicId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.patientPhone) filter.patientPhone = req.query.patientPhone;
    if (req.query.doctorId) filter.doctorId = req.query.doctorId;

    const appointments = await Appointment.find(filter)
      .populate("doctorId", "name specialty")
      .sort({ startTime: 1 })
      .limit(500)
      .lean();

    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch appointments." });
  }
});

app.get("/api/appointments/:bookingCode", adminAuth, async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      bookingCode: req.params.bookingCode.toUpperCase(),
    })
      .populate("doctorId", "name specialty")
      .populate("clinicId", "name phone address timezone")
      .lean();

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found." });
    }

    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch appointment." });
  }
});

app.post(
  "/api/appointments/:bookingCode/reschedule",
  adminAuth,
  async (req, res) => {
    try {
      const appointment = await rescheduleAppointment({
        bookingCode: req.params.bookingCode,
        newStartTime: req.body.newStartTime,
        patientPhone: req.body.patientPhone,
      });

      res.json(appointment);
    } catch (error) {
      console.error(error);
      res.status(400).json({
        error: "Failed to reschedule appointment.",
        details: error.message,
      });
    }
  },
);

app.post(
  "/api/appointments/:bookingCode/cancel",
  adminAuth,
  async (req, res) => {
    try {
      const appointment = await cancelAppointment({
        bookingCode: req.params.bookingCode,
        patientPhone: req.body.patientPhone,
      });

      res.json(appointment);
    } catch (error) {
      console.error(error);
      res.status(400).json({
        error: "Failed to cancel appointment.",
        details: error.message,
      });
    }
  },
);

app.get("/api/faqs", adminAuth, async (req, res) => {
  try {
    const clinicId = getClinicIdFromRequest(req);
    const faqs = await Faq.find(clinicId ? { clinicId } : {})
      .sort({ createdAt: -1 })
      .lean();

    res.json(faqs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch FAQs." });
  }
});

app.post("/api/faqs", adminAuth, async (req, res) => {
  try {
    const faq = await Faq.create(req.body);
    res.status(201).json(faq);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to create FAQ.",
      details: error.message,
    });
  }
});

app.patch("/api/faqs/:id", adminAuth, async (req, res) => {
  try {
    const faq = await Faq.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!faq) {
      return res.status(404).json({ error: "FAQ not found." });
    }

    res.json(faq);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to update FAQ.",
      details: error.message,
    });
  }
});

app.delete("/api/faqs/:id", adminAuth, async (req, res) => {
  try {
    const faq = await Faq.findByIdAndDelete(req.params.id);

    if (!faq) {
      return res.status(404).json({ error: "FAQ not found." });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to delete FAQ.",
      details: error.message,
    });
  }
});

app.get("/api/support", adminAuth, async (req, res) => {
  try {
    const filter = {};

    if (req.query.clinicId) filter.clinicId = req.query.clinicId;
    if (req.query.status) filter.status = req.query.status;

    const tickets = await SupportRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch support requests." });
  }
});

app.patch("/api/support/:id", adminAuth, async (req, res) => {
  try {
    const ticket = await SupportRequest.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    if (!ticket) {
      return res.status(404).json({ error: "Support request not found." });
    }

    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: "Failed to update support request.",
      details: error.message,
    });
  }
});

async function start() {
  await connectDatabase();

  const clinic = await getDefaultClinic();

  if (clinic && !process.env.DEFAULT_CLINIC_ID) {
    process.env.DEFAULT_CLINIC_ID = String(clinic._id);
  }

  const port = Number(process.env.PORT || 3000);

  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`WhatsApp webhook: http://localhost:${port}/webhook`);
  });

  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await runReminderJob();
      } catch (error) {
        console.error("Reminder job failed:", error);
      }
    },
    {
      timezone: process.env.GOOGLE_TIMEZONE || "Africa/Nairobi",
    },
  );

  console.log("Reminder scheduler started.");
}

start().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
