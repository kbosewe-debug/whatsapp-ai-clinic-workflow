const { DateTime } = require("luxon");
const { v4: uuidv4 } = require("uuid");

const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const Clinic = require("../models/Clinic");

const {
  getBusyIntervals,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} = require("./calendar");

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function getClinicTimezone(clinic) {
  return clinic?.timezone || process.env.GOOGLE_TIMEZONE || "Africa/Nairobi";
}

function parseStartTime(startTime, timezone) {
  if (!startTime) {
    throw new Error("Appointment start time is required.");
  }

  let dt = DateTime.fromISO(String(startTime), {
    zone: timezone,
  });

  if (!dt.isValid) {
    throw new Error(
      "Invalid appointment date/time. Use ISO 8601 format, e.g. 2026-08-10T10:00:00+03:00."
    );
  }

  return dt;
}

function combineDateTime(date, time, timezone) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });

  if (!dt.isValid) {
    throw new Error(`Invalid date/time: ${date} ${time}`);
  }

  return dt;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function isWithinWorkingHours(start, end, doctor) {
  const weekday = start.weekday; // 1 Monday ... 7 Sunday
  const schedule = doctor.workingHours?.find(
    (item) => Number(item.dayOfWeek) === weekday
  );

  if (!schedule) return false;

  const open = combineDateTime(
    start.toISODate(),
    schedule.start,
    start.zoneName
  );

  const close = combineDateTime(
    start.toISODate(),
    schedule.end,
    start.zoneName
  );

  if (start < open || end > close) {
    return false;
  }

  for (const breakPeriod of schedule.breaks || []) {
    const breakStart = combineDateTime(
      start.toISODate(),
      breakPeriod.start,
      start.zoneName
    );

    const breakEnd = combineDateTime(
      start.toISODate(),
      breakPeriod.end,
      start.zoneName
    );

    if (rangesOverlap(start, end, breakStart, breakEnd)) {
      return false;
    }
  }

  return true;
}

async function getLocalBusyIntervals({
  doctorId,
  from,
  to,
  excludeAppointmentId,
}) {
  const filter = {
    doctorId,
    status: { $in: ["booked", "rescheduled"] },
    startTime: { $lt: to.toJSDate() },
    endTime: { $gt: from.toJSDate() },
  };

  if (excludeAppointmentId) {
    filter._id = { $ne: excludeAppointmentId };
  }

  const appointments = await Appointment.find(filter).lean();

  return appointments.map((appointment) => ({
    start: appointment.startTime,
    end: appointment.endTime,
  }));
}

function intervalIsBusy(start, end, busyIntervals) {
  return busyIntervals.some((interval) => {
    const busyStart = new Date(interval.start);
    const busyEnd = new Date(interval.end);

    return rangesOverlap(
      start.toJSDate(),
      end.toJSDate(),
      busyStart,
      busyEnd
    );
  });
}

async function getDoctorList({ clinicId, doctorId, specialty }) {
  const filter = {
    clinicId,
    active: true,
  };

  if (doctorId) {
    filter._id = doctorId;
  }

  if (specialty) {
    filter.specialty = new RegExp(
      String(specialty).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
  }

  return Doctor.find(filter).sort({ name: 1 }).lean();
}

async function getAvailableSlots({
  clinic,
  clinicId,
  doctorId,
  specialty,
  date,
  durationMinutes,
  limit = 10,
}) {
  const resolvedClinic =
    clinic || (await Clinic.findById(clinicId || process.env.DEFAULT_CLINIC_ID));

  if (!resolvedClinic) {
    throw new Error("Clinic not found.");
  }

  if (!date) {
    throw new Error("A date is required to check availability.");
  }

  const timezone = getClinicTimezone(resolvedClinic);
  const slotDuration = Number(durationMinutes || 30);

  if (!Number.isInteger(slotDuration) || slotDuration <= 0 || slotDuration > 240) {
    throw new Error("durationMinutes must be a positive integer up to 240.");
  }

  const doctors = await getDoctorList({
    clinicId: resolvedClinic._id,
    doctorId,
    specialty,
  });

  if (doctors.length === 0) {
    return [];
  }

  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const dayEnd = dayStart.endOf("day");

  if (!dayStart.isValid) {
    throw new Error("Invalid date. Use YYYY-MM-DD.");
  }

  const allResults = [];

  for (const doctor of doctors) {
    const schedule = doctor.workingHours?.find(
      (item) => Number(item.dayOfWeek) === dayStart.weekday
    );

    if (!schedule) {
      continue;
    }

    const workingStart = combineDateTime(
      date,
      schedule.start,
      timezone
    );

    const workingEnd = combineDateTime(
      date,
      schedule.end,
      timezone
    );

    const googleBusy = await getBusyIntervals({
      calendarId: doctor.calendarId,
      timeMin: dayStart.toJSDate(),
      timeMax: dayEnd.toJSDate(),
      timeZone: timezone,
    });

    const localBusy = await getLocalBusyIntervals({
      doctorId: doctor._id,
      from: dayStart,
      to: dayEnd,
    });

    const busyIntervals = [...googleBusy, ...localBusy];

    let cursor = workingStart;

    while (
      cursor.plus({ minutes: slotDuration }) <= workingEnd &&
      allResults.length < Number(limit)
    ) {
      const slotEnd = cursor.plus({ minutes: slotDuration });

      if (
        isWithinWorkingHours(cursor, slotEnd, doctor) &&
        !intervalIsBusy(cursor, slotEnd, busyIntervals) &&
        cursor > DateTime.now().setZone(timezone)
      ) {
        allResults.push({
          doctorId: String(doctor._id),
          doctorName: doctor.name,
          specialty: doctor.specialty,
          startTime: cursor.toISO(),
          endTime: slotEnd.toISO(),
        });
      }

      cursor = cursor.plus({
        minutes: Number(doctor.slotIntervalMinutes || slotDuration),
      });
    }
  }

  return allResults.sort(
    (a, b) =>
      new Date(a.startTime).getTime() -
      new Date(b.startTime).getTime()
  );
}

async function assertSlotAvailable({
  clinic,
  doctor,
  startDateTime,
  excludeAppointmentId,
}) {
  const timezone = getClinicTimezone(clinic);
  const durationMinutes = Number(doctor.durationMinutes || 30);
  const endDateTime = startDateTime.plus({
    minutes: durationMinutes,
  });

  if (startDateTime <= DateTime.now().setZone(timezone)) {
    throw new Error("The appointment time must be in the future.");
  }

  if (!isWithinWorkingHours(startDateTime, endDateTime, doctor)) {
    throw new Error(
      `${doctor.name} is not available at that time based on the clinic schedule.`
    );
  }

  const dayStart = startDateTime.startOf("day");
  const dayEnd = startDateTime.endOf("day");

  const googleBusy = await getBusyIntervals({
    calendarId: doctor.calendarId,
    timeMin: dayStart.toJSDate(),
    timeMax: dayEnd.toJSDate(),
    timeZone: timezone,
  });

  const localBusy = await getLocalBusyIntervals({
    doctorId: doctor._id,
    from: dayStart,
    to: dayEnd,
    excludeAppointmentId,
  });

  const busyIntervals = [...googleBusy, ...localBusy];

  if (intervalIsBusy(startDateTime, endDateTime, busyIntervals)) {
    throw new Error(
      "That appointment slot is already booked. Please choose another time."
    );
  }

  return {
    startDateTime,
    endDateTime,
    durationMinutes,
  };
}

function generateBookingCode() {
  return `CLN-${uuidv4().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createAppointment({
  clinicId,
  doctorId,
  patientPhone,
  patientName,
  patientEmail,
  startTime,
  reason,
}) {
  const clinic = await Clinic.findById(
    clinicId || process.env.DEFAULT_CLINIC_ID
  );

  if (!clinic) {
    throw new Error("Clinic not found.");
  }

  const doctor = await Doctor.findOne({
    _id: doctorId,
    clinicId: clinic._id,
    active: true,
  });

  if (!doctor) {
    throw new Error("Doctor not found.");
  }

  if (!patientPhone) {
    throw new Error("Patient WhatsApp number is required.");
  }

  if (!patientName) {
    throw new Error("Patient name is required.");
  }

  const timezone = getClinicTimezone(clinic);
  const startDateTime = parseStartTime(startTime, timezone);

  const { endDateTime } = await assertSlotAvailable({
    clinic,
    doctor,
    startDateTime,
  });

  const bookingCode = generateBookingCode();

  let googleEvent = null;

  try {
    googleEvent = await createCalendarEvent({
      calendarId: doctor.calendarId,
      summary: `${clinic.name} - ${doctor.name} - ${patientName}`,
      description: [
        `Booking reference: ${bookingCode}`,
        `Patient WhatsApp: ${patientPhone}`,
        reason ? `Reason: ${reason}` : "",
        "Created by WhatsApp AI appointment assistant.",
      ]
        .filter(Boolean)
        .join("\n"),
      startTime: startDateTime.toJSDate(),
      endTime: endDateTime.toJSDate(),
      timeZone: timezone,
      patientEmail,
    });

    const appointment = await Appointment.create({
      clinicId: clinic._id,
      doctorId: doctor._id,
      bookingCode,
      patientPhone: normalizePhone(patientPhone),
      patientName,
      patientEmail,
      reason,
      startTime: startDateTime.toJSDate(),
      endTime: endDateTime.toJSDate(),
      status: "booked",
      googleEventId: googleEvent?.id || null,
    });

    return appointment.toObject();
  } catch (error) {
    if (googleEvent?.id) {
      try {
        await deleteCalendarEvent({
          calendarId: doctor.calendarId,
          eventId: googleEvent.id,
        });
      } catch (cleanupError) {
        console.error("Calendar cleanup failed:", cleanupError);
      }
    }

    throw error;
  }
}

async function rescheduleAppointment({
  bookingCode,
  patientPhone,
  newStartTime,
}) {
  const filter = {
    bookingCode: String(bookingCode).toUpperCase(),
    status: { $in: ["booked", "rescheduled"] },
  };

  if (patientPhone) {
    filter.patientPhone = normalizePhone(patientPhone);
  }

  const appointment = await Appointment.findOne(filter);

  if (!appointment) {
    throw new Error(
      "Appointment not found. Please check your booking reference."
    );
  }

  const clinic = await Clinic.findById(appointment.clinicId);
  const doctor = await Doctor.findById(appointment.doctorId);

  if (!clinic || !doctor) {
    throw new Error("Clinic or doctor not found.");
  }

  const timezone = getClinicTimezone(clinic);
  const startDateTime = parseStartTime(newStartTime, timezone);

  const { endDateTime } = await assertSlotAvailable({
    clinic,
    doctor,
    startDateTime,
    excludeAppointmentId: appointment._id,
  });

  if (appointment.googleEventId) {
    await updateCalendarEvent({
      calendarId: doctor.calendarId,
      eventId: appointment.googleEventId,
      summary: `${clinic.name} - ${doctor.name} - ${appointment.patientName}`,
      description: [
        `Booking reference: ${appointment.bookingCode}`,
        `Patient WhatsApp: ${appointment.patientPhone}`,
        appointment.reason ? `Reason: ${appointment.reason}` : "",
        "Updated by WhatsApp AI appointment assistant.",
      ]
        .filter(Boolean)
        .join("\n"),
      startTime: startDateTime.toJSDate(),
      endTime: endDateTime.toJSDate(),
      timeZone: timezone,
      patientEmail: appointment.patientEmail,
    });
  } else {
    const event = await createCalendarEvent({
      calendarId: doctor.calendarId,
      summary: `${clinic.name} - ${doctor.name} - ${appointment.patientName}`,
      description: `Booking reference: ${appointment.bookingCode}`,
      startTime: startDateTime.toJSDate(),
      endTime: endDateTime.toJSDate(),
      timeZone: timezone,
      patientEmail: appointment.patientEmail,
    });

    appointment.googleEventId = event?.id || null;
  }

  appointment.startTime = startDateTime.toJSDate();
  appointment.endTime = endDateTime.toJSDate();
  appointment.status = "rescheduled";
  appointment.reminder24Sent = false;
  appointment.reminder2Sent = false;

  await appointment.save();

  return appointment.toObject();
}

async function cancelAppointment({
  bookingCode,
  patientPhone,
}) {
  const filter = {
    bookingCode: String(bookingCode).toUpperCase(),
    status: { $in: ["booked", "rescheduled"] },
  };

  if (patientPhone) {
    filter.patientPhone = normalizePhone(patientPhone);
  }

  const appointment = await Appointment.findOne(filter);

  if (!appointment) {
    throw new Error(
      "Appointment not found. Please check your booking reference."
    );
  }

  const doctor = await Doctor.findById(appointment.doctorId);

  if (appointment.googleEventId && doctor) {
    try {
      await deleteCalendarEvent({
        calendarId: doctor.calendarId,
        eventId: appointment.googleEventId,
      });
    } catch (error) {
      console.error("Google Calendar deletion failed:", error.message);
    }
  }

  appointment.status = "cancelled";
  appointment.cancelledAt = new Date();
  await appointment.save();

  return appointment.toObject();
}

module.exports = {
  getAvailableSlots,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  normalizePhone,
};
