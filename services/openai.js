const OpenAI = require("openai");
const { DateTime } = require("luxon");

const Clinic = require("../models/Clinic");
const Doctor = require("../models/Doctor");
const Faq = require("../models/Faq");
const Conversation = require("../models/Conversation");
const SupportRequest = require("../models/SupportRequest");

const {
  getAvailableSlots,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
} = require("./appointments");
const { sendTextMessage } = require("./whatsapp");
const { normalizePhone } = require("./appointments");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_INSTRUCTIONS = `
You are the WhatsApp virtual receptionist for a clinic or hospital.

Your job is to help patients with:
- booking appointments
- checking doctor availability
- rescheduling appointments
- cancelling appointments
- clinic FAQs
- opening hours
- clinic location and contact information
- appointment reminders
- transferring patients to human support

Rules:
1. Never diagnose a patient or give medical advice. For medical emergencies, tell the user to contact emergency services or the hospital directly.
2. Use tools for appointment availability and booking. Never invent a doctor, time, appointment, or booking reference.
3. Before booking, collect the patient's full name and exact requested date/time. If the user gives a specialty instead of a doctor, use availability search.
4. A booking must have a doctor, patient name, WhatsApp phone number, and exact start time.
5. Use the patient's WhatsApp number supplied by the application as the identity for booking, cancelling, and rescheduling.
6. For cancellations and rescheduling, require the booking reference if the patient has more than one active booking.
7. Keep replies concise and friendly because this is WhatsApp.
8. Confirm important booking details after a successful action.
9. If a tool reports no availability, offer the next available times rather than inventing a time.
10. For FAQs, use the FAQ search tool before answering detailed clinic-policy questions.
11. For opening hours and location, use the clinic information tool.
12. When the patient asks for a human, is upset, or cannot complete a task, use the human support tool.
13. Do not expose internal tool names, database IDs, API keys, or implementation details.
14. The clinic timezone should be used when interpreting appointment times.
`;

const tools = [
  {
    type: "function",
    name: "get_clinic_info",
    description:
      "Get clinic name, address, phone, website, timezone, and opening hours.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "search_clinic_faq",
    description:
      "Search the clinic FAQ database for policies and common questions.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The patient's FAQ question or keywords.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_doctors",
    description:
      "List active doctors. Use specialty to narrow results when the patient asks for a department or specialty.",
    parameters: {
      type: "object",
      properties: {
        specialty: {
          type: ["string", "null"],
          description: "Optional specialty, such as cardiology or dentistry.",
        },
      },
      required: ["specialty"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "check_doctor_availability",
    description:
      "Check real appointment slots using doctor working hours, existing appointments, and linked Google Calendar busy times.",
    parameters: {
      type: "object",
      properties: {
        doctorId: {
          type: ["string", "null"],
          description: "The doctor database ID when known.",
        },
        specialty: {
          type: ["string", "null"],
          description: "Optional specialty if the patient did not choose a doctor.",
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format.",
        },
        durationMinutes: {
          type: ["integer", "null"],
          description: "Optional appointment duration in minutes.",
        },
        limit: {
          type: ["integer", "null"],
          description: "Maximum number of slots to return.",
        },
      },
      required: [
        "doctorId",
        "specialty",
        "date",
        "durationMinutes",
        "limit"
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "book_appointment",
    description:
      "Book a real appointment after checking availability. Returns a booking reference.",
    parameters: {
      type: "object",
      properties: {
        doctorId: {
          type: "string",
          description: "Doctor database ID.",
        },
        patientName: {
          type: "string",
          description: "Patient's full name.",
        },
        patientEmail: {
          type: ["string", "null"],
          description: "Optional patient email.",
        },
        startTime: {
          type: "string",
          description:
            "Appointment start time as ISO 8601 with timezone when possible.",
        },
        reason: {
          type: ["string", "null"],
          description: "Optional non-sensitive appointment reason.",
        },
      },
      required: [
        "doctorId",
        "patientName",
        "patientEmail",
        "startTime",
        "reason"
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "reschedule_appointment",
    description:
      "Move an existing appointment to a new available time and update Google Calendar.",
    parameters: {
      type: "object",
      properties: {
        bookingCode: {
          type: "string",
          description: "Appointment booking reference, e.g. CLN-1234ABCD.",
        },
        newStartTime: {
          type: "string",
          description:
            "New appointment start time as ISO 8601 with timezone when possible.",
        },
      },
      required: ["bookingCode", "newStartTime"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "cancel_appointment",
    description:
      "Cancel an existing appointment and remove its Google Calendar event.",
    parameters: {
      type: "object",
      properties: {
        bookingCode: {
          type: "string",
          description: "Appointment booking reference, e.g. CLN-1234ABCD.",
        },
      },
      required: ["bookingCode"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "request_human_support",
    description:
      "Create a human support ticket when the patient requests a human or needs help that automation cannot provide.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Brief summary of what the patient needs.",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function getIncomingMessage(payload) {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const profileName = value?.contacts?.[0]?.profile?.name || null;

  if (!message) {
    return null;
  }

  const sender = message.from;

  if (message.type === "text") {
    return {
      sender,
      text: message.text?.body?.trim(),
      profileName,
    };
  }

  if (message.type === "interactive") {
    const buttonText = message.interactive?.button_reply?.title;
    const listText = message.interactive?.list_reply?.title;

    return {
      sender,
      text: buttonText || listText || "",
      profileName,
    };
  }

  return {
    sender,
    text: "",
    profileName,
  };
}

async function getClinic() {
  const clinicId = process.env.DEFAULT_CLINIC_ID;

  if (clinicId) {
    return Clinic.findById(clinicId);
  }

  return Clinic.findOne({ active: true }).sort({ createdAt: 1 });
}

async function getConversation(phone) {
  let conversation = await Conversation.findOne({ phone });

  if (!conversation) {
    conversation = await Conversation.create({
      phone,
      messages: [],
    });
  }

  return conversation;
}

async function appendConversationMessage(phone, role, content) {
  const conversation = await getConversation(phone);

  conversation.messages.push({
    role,
    content,
    timestamp: new Date(),
  });

  // Keep a rolling history to control prompt size.
  if (conversation.messages.length > 40) {
    conversation.messages = conversation.messages.slice(-40);
  }

  await conversation.save();
}

function buildModelInput(conversation, userText) {
  const history = conversation.messages
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  history.push({
    role: "user",
    content: userText,
  });

  return history;
}

async function executeTool(name, args, context) {
  const {
    phone,
    clinic,
    profileName,
  } = context;

  switch (name) {
    case "get_clinic_info": {
      return {
        name: clinic.name,
        phone: clinic.phone,
        address: clinic.address,
        website: clinic.website,
        timezone: clinic.timezone,
        openingHours: clinic.openingHours,
      };
    }

    case "search_clinic_faq": {
      const query = String(args.query || "").trim();

      if (!query) {
        return { results: [] };
      }

      const words = query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length >= 3)
        .slice(0, 8);

      const regexes = words.map(
        (word) =>
          new RegExp(
            word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
          )
      );

      const faqs = await Faq.find({
        clinicId: clinic._id,
        $or: regexes.flatMap((regex) => [
          { question: regex },
          { answer: regex },
          { keywords: regex },
        ]),
      })
        .limit(8)
        .lean();

      return {
        results: faqs.map((faq) => ({
          question: faq.question,
          answer: faq.answer,
        })),
      };
    }

    case "list_doctors": {
      const filter = {
        clinicId: clinic._id,
        active: true,
      };

      if (args.specialty) {
        filter.specialty = new RegExp(
          String(args.specialty).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
      }

      const doctors = await Doctor.find(filter)
        .select("_id name specialty durationMinutes")
        .sort({ name: 1 })
        .lean();

      return {
        doctors: doctors.map((doctor) => ({
          id: String(doctor._id),
          name: doctor.name,
          specialty: doctor.specialty,
          durationMinutes: doctor.durationMinutes,
        })),
      };
    }

    case "check_doctor_availability": {
      const results = await getAvailableSlots({
        clinic,
        doctorId: args.doctorId || undefined,
        specialty: args.specialty || undefined,
        date: args.date,
        durationMinutes: args.durationMinutes || undefined,
        limit: args.limit || 10,
      });

      return {
        date: args.date,
        slots: results,
      };
    }

    case "book_appointment": {
      const appointment = await createAppointment({
        clinicId: clinic._id,
        doctorId: args.doctorId,
        patientPhone: normalizePhone(phone),
        patientName: args.patientName || profileName || "WhatsApp Patient",
        patientEmail: args.patientEmail || undefined,
        startTime: args.startTime,
        reason: args.reason || undefined,
      });

      const doctor = await Doctor.findById(appointment.doctorId)
        .select("name specialty")
        .lean();

      const timezone =
        clinic.timezone || process.env.GOOGLE_TIMEZONE || "Africa/Nairobi";

      return {
        success: true,
        bookingCode: appointment.bookingCode,
        doctorName: doctor?.name,
        specialty: doctor?.specialty,
        patientName: appointment.patientName,
        startTime: DateTime.fromJSDate(
          appointment.startTime,
          { zone: timezone }
        ).toISO(),
        endTime: DateTime.fromJSDate(
          appointment.endTime,
          { zone: timezone }
        ).toISO(),
        message:
          "Appointment booked successfully. A reminder will be sent before the appointment.",
      };
    }

    case "reschedule_appointment": {
      const appointment = await rescheduleAppointment({
        bookingCode: args.bookingCode,
        newStartTime: args.newStartTime,
        patientPhone: normalizePhone(phone),
      });

      return {
        success: true,
        bookingCode: appointment.bookingCode,
        newStartTime: appointment.startTime,
        message:
          "Appointment rescheduled successfully. The reminder schedule has been reset.",
      };
    }

    case "cancel_appointment": {
      const appointment = await cancelAppointment({
        bookingCode: args.bookingCode,
        patientPhone: normalizePhone(phone),
      });

      return {
        success: true,
        bookingCode: appointment.bookingCode,
        status: appointment.status,
        message: "Appointment cancelled successfully.",
      };
    }

    case "request_human_support": {
      const ticket = await SupportRequest.create({
        clinicId: clinic._id,
        patientPhone: normalizePhone(phone),
        summary: args.summary,
        status: "open",
      });

      if (process.env.HUMAN_SUPPORT_NUMBER) {
        const alertTemplate =
          process.env.WHATSAPP_SUPPORT_ALERT_TEMPLATE_NAME;

        try {
          if (alertTemplate) {
            const { sendTemplateMessage } = require("./whatsapp");

            await sendTemplateMessage({
              to: process.env.HUMAN_SUPPORT_NUMBER,
              templateName: alertTemplate,
              languageCode:
                process.env.WHATSAPP_SUPPORT_ALERT_TEMPLATE_LANGUAGE ||
                "en_US",
              parameters: [
                ticket._id.toString(),
                normalizePhone(phone),
                args.summary,
              ],
            });
          } else {
            await sendTextMessage(
              process.env.HUMAN_SUPPORT_NUMBER,
              `New clinic support request.\nTicket: ${ticket._id}\nPatient WhatsApp: ${normalizePhone(phone)}\nSummary: ${args.summary}`
            );
          }
        } catch (error) {
          console.error(
            "Human support alert failed:",
            error.response?.data || error.message
          );
        }
      }

      return {
        success: true,
        ticketId: ticket._id.toString(),
        message:
          "A human support request has been created. A member of the clinic team will follow up.",
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function runAssistant({
  phone,
  text,
  clinic,
  profileName,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const conversation = await getConversation(phone);

  const modelInput = buildModelInput(
    conversation,
    text
  );

  let response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    instructions: [
      SYSTEM_INSTRUCTIONS,
      `Current date: ${DateTime.now().toISODate()}.`,
      `Clinic timezone: ${clinic.timezone || "Africa/Nairobi"}.`,
      `Patient WhatsApp number: ${phone}.`,
      profileName
        ? `WhatsApp profile name: ${profileName}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    input: modelInput,
    tools,
  });

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const functionCalls = response.output.filter(
      (item) => item.type === "function_call"
    );

    if (functionCalls.length === 0) {
      const textOutput =
        response.output_text ||
        "Sorry, I couldn't complete that request. Please try again.";

      return textOutput;
    }

    const toolOutputs = [];

    for (const call of functionCalls) {
      let args = {};

      try {
        args = JSON.parse(call.arguments || "{}");
      } catch (error) {
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            error: "The tool arguments could not be parsed.",
          }),
        });
        continue;
      }

      try {
        const result = await executeTool(call.name, args, {
          phone,
          clinic,
          profileName,
        });

        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      } catch (error) {
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            error: error.message,
          }),
        });
      }
    }

    response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      instructions: [
        SYSTEM_INSTRUCTIONS,
        `Current date: ${DateTime.now().toISODate()}.`,
        `Clinic timezone: ${clinic.timezone || "Africa/Nairobi"}.`,
        `Patient WhatsApp number: ${phone}.`,
      ].join("\n"),
      previous_response_id: response.id,
      input: toolOutputs,
      tools,
    });
  }

  throw new Error("The assistant exceeded the tool-call limit.");
}

async function processIncomingMessage(payload) {
  const incoming = getIncomingMessage(payload);

  if (!incoming || !incoming.sender) {
    return;
  }

  if (!incoming.text) {
    await sendTextMessage(
      incoming.sender,
      "I can help with appointments, doctor availability, clinic information, or connecting you to the reception team. Please send me a text message."
    );
    return;
  }

  const clinic = await getClinic();

  if (!clinic) {
    await sendTextMessage(
      incoming.sender,
      "Sorry, the clinic assistant is not configured yet. Please contact the clinic directly."
    );
    return;
  }

  const phone = normalizePhone(incoming.sender);

  await appendConversationMessage(
    phone,
    "user",
    incoming.text
  );

  const reply = await runAssistant({
    phone,
    text: incoming.text,
    clinic,
    profileName: incoming.profileName,
  });

  await appendConversationMessage(
    phone,
    "assistant",
    reply
  );

  await sendTextMessage(phone, reply);
}

module.exports = {
  processIncomingMessage,
};
