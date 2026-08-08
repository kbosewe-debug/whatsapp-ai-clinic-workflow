const OpenAI = require("openai");
const { supabase } = require("../config/supabase");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function context(clinicId) {
  const [clinic, doctors, faqs] = await Promise.all([
    supabase.from("clinics").select("*").eq("id", clinicId).single(),
    supabase.from("doctors").select("id,name,specialty,active").eq("clinic_id", clinicId).eq("active", true),
    supabase.from("faqs").select("question,answer").eq("clinic_id", clinicId).eq("active", true)
  ]);
  if (clinic.error) throw clinic.error;
  if (doctors.error) throw doctors.error;
  if (faqs.error) throw faqs.error;
  return { clinic: clinic.data, doctors: doctors.data || [], faqs: faqs.data || [] };
}

async function reply(message, ctx) {
  const instructions = `
You are a WhatsApp assistant for a clinic.
Answer FAQs, opening hours, location, doctors and general appointment questions.
Never invent availability or claim an appointment was booked unless the server confirms it.
Never diagnose medical conditions.
If the user wants a human, output exactly HUMAN_SUPPORT.
If the user wants to book, output exactly BOOK_APPOINTMENT.
If the user wants to reschedule, output exactly RESCHEDULE_APPOINTMENT.
If the user wants to cancel, output exactly CANCEL_APPOINTMENT.
Keep replies concise and friendly.

Clinic: ${JSON.stringify(ctx.clinic)}
Doctors: ${JSON.stringify(ctx.doctors)}
FAQs: ${JSON.stringify(ctx.faqs)}
`;
  const r = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    instructions,
    input: message
  });
  return r.output_text.trim();
}

module.exports = { context, reply };
