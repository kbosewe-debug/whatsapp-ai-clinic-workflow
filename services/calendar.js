const { google } = require("googleapis");

let calendarClient = null;

function isCalendarConfigured() {
  return (
    String(process.env.GOOGLE_CALENDAR_ENABLED).toLowerCase() === "true" &&
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64)
  );
}

function getCalendarClient() {
  if (!isCalendarConfigured()) {
    return null;
  }

  if (calendarClient) {
    return calendarClient;
  }

  const credentialsJson = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64,
    "base64"
  ).toString("utf8");

  const credentials = JSON.parse(credentialsJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ],
  });

  calendarClient = google.calendar({
    version: "v3",
    auth,
  });

  return calendarClient;
}

async function getBusyIntervals({
  calendarId,
  timeMin,
  timeMax,
  timeZone,
}) {
  const client = getCalendarClient();

  if (!client || !calendarId) {
    return [];
  }

  const response = await client.freebusy.query({
    requestBody: {
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      timeZone,
      items: [{ id: calendarId }],
    },
  });

  return response.data.calendars?.[calendarId]?.busy || [];
}

async function createCalendarEvent({
  calendarId,
  summary,
  description,
  startTime,
  endTime,
  timeZone,
  patientEmail,
}) {
  const client = getCalendarClient();

  if (!client || !calendarId) {
    return null;
  }

  const event = {
    summary,
    description,
    start: {
      dateTime: new Date(startTime).toISOString(),
      timeZone,
    },
    end: {
      dateTime: new Date(endTime).toISOString(),
      timeZone,
    },
    extendedProperties: {
      private: {
        source: "whatsapp-ai-bot",
      },
    },
  };

  const response = await client.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: "none",
  });

  return response.data;
}

async function updateCalendarEvent({
  calendarId,
  eventId,
  summary,
  description,
  startTime,
  endTime,
  timeZone,
  patientEmail,
}) {
  const client = getCalendarClient();

  if (!client || !calendarId || !eventId) {
    return null;
  }

  const event = {
    summary,
    description,
    start: {
      dateTime: new Date(startTime).toISOString(),
      timeZone,
    },
    end: {
      dateTime: new Date(endTime).toISOString(),
      timeZone,
    },
  };

  const response = await client.events.update({
    calendarId,
    eventId,
    requestBody: event,
    sendUpdates: "none",
  });

  return response.data;
}

async function deleteCalendarEvent({ calendarId, eventId }) {
  const client = getCalendarClient();

  if (!client || !calendarId || !eventId) {
    return null;
  }

  await client.events.delete({
    calendarId,
    eventId,
    sendUpdates: "none",
  });

  return true;
}

module.exports = {
  isCalendarConfigured,
  getBusyIntervals,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
};
