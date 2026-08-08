const { google } = require("googleapis");

function client() {
  if (process.env.GOOGLE_CALENDAR_ENABLED !== "true") return null;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is required when Google Calendar is enabled.");
  }
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8")
  );
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });
  return google.calendar({ version: "v3", auth });
}

async function createEvent({ calendarId, summary, description, start, end, timeZone, attendeeEmail }) {
  const calendar = client();
  if (!calendar) return null;
  const event = {
    summary, description,
    start: { dateTime: start, timeZone },
    end: { dateTime: end, timeZone }
  };
  if (attendeeEmail) event.attendees = [{ email: attendeeEmail }];
  const { data } = await calendar.events.insert({ calendarId, requestBody: event });
  return data;
}

async function updateEvent({ calendarId, eventId, start, end, timeZone }) {
  const calendar = client();
  if (!calendar) return null;
  const { data } = await calendar.events.patch({
    calendarId, eventId,
    requestBody: { start: { dateTime: start, timeZone }, end: { dateTime: end, timeZone } }
  });
  return data;
}

async function deleteEvent({ calendarId, eventId }) {
  const calendar = client();
  if (!calendar) return null;
  return calendar.events.delete({ calendarId, eventId });
}

module.exports = { createEvent, updateEvent, deleteEvent };
