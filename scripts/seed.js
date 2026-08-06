require("dotenv").config();

const mongoose = require("mongoose");

const Clinic = require("../models/Clinic");
const Doctor = require("../models/Doctor");
const Faq = require("../models/Faq");

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  let clinic = await Clinic.findOne({ name: process.env.CLINIC_NAME });

  if (!clinic) {
    clinic = await Clinic.create({
      name: process.env.CLINIC_NAME || "Demo Health Clinic",
      phone: process.env.CLINIC_PHONE || "+254700000000",
      address: process.env.CLINIC_ADDRESS || "Nairobi, Kenya",
      website: process.env.CLINIC_WEBSITE || "",
      timezone: process.env.GOOGLE_TIMEZONE || "Africa/Nairobi",
      openingHours: [
        { dayOfWeek: 1, open: "08:00", close: "17:00", closed: false },
        { dayOfWeek: 2, open: "08:00", close: "17:00", closed: false },
        { dayOfWeek: 3, open: "08:00", close: "17:00", closed: false },
        { dayOfWeek: 4, open: "08:00", close: "17:00", closed: false },
        { dayOfWeek: 5, open: "08:00", close: "17:00", closed: false },
        { dayOfWeek: 6, open: "09:00", close: "13:00", closed: false },
        { dayOfWeek: 7, open: "00:00", close: "00:00", closed: true },
      ],
      active: true,
    });

    console.log("Created clinic:", clinic._id.toString());
  } else {
    console.log("Using existing clinic:", clinic._id.toString());
  }

  const existingDoctor = await Doctor.findOne({
    clinicId: clinic._id,
    name: "Dr. Jane Doe",
  });

  if (!existingDoctor) {
    await Doctor.create({
      clinicId: clinic._id,
      name: "Dr. Jane Doe",
      specialty: "General Medicine",
      calendarId: "",
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      workingHours: [
        {
          dayOfWeek: 1,
          start: "08:00",
          end: "17:00",
          breaks: [{ start: "13:00", end: "14:00" }],
        },
        {
          dayOfWeek: 2,
          start: "08:00",
          end: "17:00",
          breaks: [{ start: "13:00", end: "14:00" }],
        },
        {
          dayOfWeek: 3,
          start: "08:00",
          end: "17:00",
          breaks: [{ start: "13:00", end: "14:00" }],
        },
        {
          dayOfWeek: 4,
          start: "08:00",
          end: "17:00",
          breaks: [{ start: "13:00", end: "14:00" }],
        },
        {
          dayOfWeek: 5,
          start: "08:00",
          end: "17:00",
          breaks: [{ start: "13:00", end: "14:00" }],
        },
      ],
      active: true,
    });

    console.log("Created demo doctor.");
  }

  const faqCount = await Faq.countDocuments({
    clinicId: clinic._id,
  });

  if (faqCount === 0) {
    await Faq.insertMany([
      {
        clinicId: clinic._id,
        question: "What are your opening hours?",
        answer:
          "We are open Monday to Friday from 8:00 AM to 5:00 PM and Saturday from 9:00 AM to 1:00 PM. We are closed on Sunday.",
        keywords: ["opening hours", "hours", "open", "close"],
      },
      {
        clinicId: clinic._id,
        question: "Where are you located?",
        answer:
          `We are located at ${clinic.address}. Please call ${clinic.phone} if you need directions.`,
        keywords: ["location", "address", "directions", "where"],
      },
      {
        clinicId: clinic._id,
        question: "How do I cancel an appointment?",
        answer:
          "Send your booking reference to the WhatsApp assistant and ask to cancel the appointment.",
        keywords: ["cancel", "cancellation"],
      },
      {
        clinicId: clinic._id,
        question: "How do I reschedule an appointment?",
        answer:
          "Send your booking reference and tell the WhatsApp assistant the new date and time you prefer.",
        keywords: ["reschedule", "change appointment"],
      },
      {
        clinicId: clinic._id,
        question: "Can I speak to a human?",
        answer:
          "Yes. Ask the WhatsApp assistant to connect you to human support and a support ticket will be created.",
        keywords: ["human", "reception", "support", "agent"],
      },
    ]);

    console.log("Seeded FAQs.");
  }

  console.log("\nClinic ID:");
  console.log(clinic._id.toString());
  console.log("\nSet this value in .env as DEFAULT_CLINIC_ID.");

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
