export function formatDate(value, timezone) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: timezone || undefined,
  }).format(new Date(value));
}

export function formatTime(value, timezone) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: timezone || undefined,
  }).format(new Date(value));
}

export function formatDateTime(value, timezone) {
  if (!value) return "—";
  return `${formatDate(value, timezone)} · ${formatTime(value, timezone)}`;
}

export function toDateInput(value, timezone) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function toLocalDateTimeValue(value, timezone) {
  if (!value) return "";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour === "24" ? "00" : map.hour}:${map.minute}`;
}

export function toIsoFromLocalInput(value, timezone) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return "";

  const [, year, month, day, hour, minute] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  if (!timezone) {
    return new Date(utcGuess).toISOString();
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utcGuess));

    const map = Object.fromEntries(parts.map((item) => [item.type, item.value]));
    const zonedAsUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour === "24" ? "00" : map.hour),
      Number(map.minute),
      Number(map.second),
    );

    const offset = zonedAsUtc - utcGuess;
    return new Date(utcGuess - offset).toISOString();
  } catch {
    return new Date(utcGuess).toISOString();
  }
}

export function statusLabel(status) {
  return String(status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "?";
}

export function emptySchedule() {
  return [
    { dayOfWeek: 1, label: "Monday", start: "08:00", end: "17:00", closed: false },
    { dayOfWeek: 2, label: "Tuesday", start: "08:00", end: "17:00", closed: false },
    { dayOfWeek: 3, label: "Wednesday", start: "08:00", end: "17:00", closed: false },
    { dayOfWeek: 4, label: "Thursday", start: "08:00", end: "17:00", closed: false },
    { dayOfWeek: 5, label: "Friday", start: "08:00", end: "17:00", closed: false },
    { dayOfWeek: 6, label: "Saturday", start: "09:00", end: "13:00", closed: false },
    { dayOfWeek: 7, label: "Sunday", start: "00:00", end: "00:00", closed: true },
  ];
}
