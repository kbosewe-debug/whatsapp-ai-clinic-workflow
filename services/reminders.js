const { DateTime } = require("luxon");

const Appointment = require("../models/Appointment");
const Clinic = require("../models/Clinic");
const Doctor = require("../models/Doctor");
const {
  sendTemplateMessage,
  sendTextMessage,
} = require("./whatsapp");

function formatAppointmentDate(date, timezone) {
  return DateTime.fromJSDate(new Date(date), {
    zone: timezone,
  }).toFormat("cccc, dd LLL yyyy");
}

function formatAppointmentTime(date, timezone) {
  return DateTime.fromJSDate(new Date(date), {
    zone: timezone,
  }).toFormat("hh:mm a");
}

async function sendReminder(appointment, clinic, doctor) {
  const timezone =
    clinic.timezone ||
    process.env.GOOGLE_TIMEZONE ||
    "Africa/Nairobi";

  const templateName = process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
  const languageCode =
    process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE || "en_US";

  const parameters = [
    appointment.patientName,
    doctor.name,
    formatAppointmentDate(appointment.startTime, timezone),
    formatAppointmentTime(appointment.startTime, timezone),
  ];

  if (templateName) {
    return sendTemplateMessage({
      to: appointment.patientPhone,
      templateName,
      languageCode,
      parameters,
    });
  }

  // Development fallback. For production reminders outside the
  // customer-service window, use an approved WhatsApp template.
  return sendTextMessage(
    appointment.patientPhone,
    `Reminder: you have an appointment with ${doctor.name} on ${parameters[2]} at ${parameters[3]}. Booking reference: ${appointment.bookingCode}.`
  );
}

async function runReminderJob() {
  const now = DateTime.now().toUTC();

  const reminderWindows = [
    {
      name: "24h",
      minHours: 23.92,
      maxHours: 24.08,
      field: "reminder24Sent",
    },
    {
      name: "2h",
      minHours: 1.92,
      maxHours: 2.08,
      field: "reminder2Sent",
    },
  ];

  for (const window of reminderWindows) {
    const min = now.plus({ hours: window.minHours }).toJSDate();
    const max = now.plus({ hours: window.maxHours }).toJSDate();

    const appointments = await Appointment.find({
      status: { $in: ["booked", "rescheduled"] },
      startTime: {
        $gte: min,
        $lte: max,
      },
      [window.field]: false,
    }).lean();

    for (const appointment of appointments) {
      try {
        const [clinic, doctor] = await Promise.all([
          Clinic.findById(appointment.clinicId).lean(),
          Doctor.findById(appointment.doctorId).lean(),
        ]);

        if (!clinic || !doctor) {
          continue;
        }

        await sendReminder(appointment, clinic, doctor);

        await Appointment.updateOne(
          { _id: appointment._id },
          {
            $set: {
              [window.field]: true,
            },
          }
        );

        console.log(
          `Sent ${window.name} reminder for ${appointment.bookingCode}.`
        );
      } catch (error) {
        console.error(
          `Failed ${window.name} reminder for ${appointment.bookingCode}:`,
          error.response?.data || error.message
        );
      }
    }
  }
}

module.exports = {
  runReminderJob,
};
