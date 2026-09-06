const { GoogleGenAI } = require("@google/genai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is required");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/*
 * Gets clinic information from Supabase.
 */
async function context(clinicId) {
  const { supabase } = require("../config/supabase");

  const [clinicResult, doctorsResult, faqsResult] = await Promise.all([
    supabase.from("clinics").select("*").eq("id", clinicId).single(),

    supabase.from("doctors").select("*").eq("clinic_id", clinicId),

    supabase.from("faqs").select("*").eq("clinic_id", clinicId),
  ]);

  if (clinicResult.error) {
    console.error("Clinic context error:", clinicResult.error);
  }

  if (doctorsResult.error) {
    console.error("Doctors context error:", doctorsResult.error);
  }

  if (faqsResult.error) {
    console.error("FAQ context error:", faqsResult.error);
  }

  return {
    clinic: clinicResult.data || null,
    doctors: doctorsResult.data || [],
    faqs: faqsResult.data || [],
  };
}

/*
 * Sends the patient's message to Gemini.
 */
async function reply(message, clinicContext) {
  const clinic = clinicContext?.clinic;
  const doctors = clinicContext?.doctors || [];
  const faqs = clinicContext?.faqs || [];

  const clinicInformation = JSON.stringify(
    {
      clinic,
      doctors,
      faqs,
    },
    null,
    2,
  );

  const systemInstruction = `
You are ClinicFlow AI, an AI assistant for a hospital or clinic on WhatsApp.

Your responsibilities:

- Answer clinic FAQs
- Provide clinic location
- Provide opening hours
- Explain available services
- Help patients book appointments
- Help patients reschedule appointments
- Help patients cancel appointments
- Help patients find doctors
- Help patients request human support

IMPORTANT RULES:

1. Never invent doctor availability.
2. Never invent appointment times.
3. Never claim an appointment has been booked unless the database confirms it.
4. Never claim an appointment was cancelled unless the database confirms it.
5. Never claim an appointment was rescheduled unless the database confirms it.
6. Be concise because this is WhatsApp.
7. Ask the patient for missing information when necessary.
8. If the patient wants human support, return exactly:

HUMAN_SUPPORT

9. If the patient wants to book an appointment, return exactly:

BOOK_APPOINTMENT

10. If the patient wants to reschedule an appointment, return exactly:

RESCHEDULE_APPOINTMENT

11. If the patient wants to cancel an appointment, return exactly:

CANCEL_APPOINTMENT

CLINIC INFORMATION:

${clinicInformation}
`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL,
        contents: message,
        config: {
          systemInstruction,
        },
      });

      return response.text.trim();
    } catch (error) {
      console.error(`Gemini attempt ${attempt} failed:`, error.message);

      if (error.status !== 503 || attempt === 3) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

module.exports = {
  context,
  reply,
};
