// Working-day due date for an AMBER job.
//
// The promise is "back within 24 hours", counted on WORKING DAYS only:
// Monday to Friday, with South African public holidays skipped. Weekends and
// public holidays do not count.
//
// The rule, exactly as Cam set it out (26 Oct 2026):
//   1. If the job becomes complete on a day that is NOT a working day, the
//      clock does not start until 08:00 on the next working day.
//   2. The job is then due at the SAME time of day on the NEXT working day.
//
// Worked examples that the tests pin:
//   Friday    16:00                         -> Monday   16:00
//   Saturday  10:00                         -> Tuesday  08:00
//   Tuesday   09:30, Wednesday is a holiday -> Thursday 09:30
//
// The MIS is the system of record for the stored due time. The portal uses
// this to SHOW the customer what to expect, and the MIS thread uses the same
// rule, so the two can never drift.
//
// All arithmetic is done in South African time (Africa/Johannesburg, UTC+2,
// no daylight saving ever), so a fixed offset is correct and safe.

export const SAST_OFFSET_MINUTES = 120;
export const WORK_DAY_START_HOUR = 8;

// ─── South African public holidays ──────────────────────────────────────────
// Fixed-date holidays, as [month, day] with month 1-12.
const FIXED_HOLIDAYS = [
  [1, 1],   // New Year's Day
  [3, 21],  // Human Rights Day
  [4, 27],  // Freedom Day
  [5, 1],   // Workers' Day
  [6, 16],  // Youth Day
  [8, 9],   // National Women's Day
  [9, 24],  // Heritage Day
  [12, 16], // Day of Reconciliation
  [12, 25], // Christmas Day
  [12, 26], // Day of Goodwill
];

// Easter Sunday for a given year (Anonymous Gregorian algorithm). Good Friday
// and Family Day (Easter Monday) are the only moveable SA public holidays.
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function key(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Add whole days to a {year, month, day}, using UTC arithmetic to avoid any
// local-timezone surprises on the machine running this.
function shiftDate({ year, month, day }, days) {
  const t = Date.UTC(year, month - 1, day) + days * 86400000;
  const d = new Date(t);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayOfWeek({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
}

// Every SA public holiday in a year, as a Set of "YYYY-MM-DD" strings.
// The Public Holidays Act says that when a public holiday falls on a Sunday,
// the Monday that follows is also a public holiday.
export function holidaysForYear(year) {
  const out = new Set();
  const add = (d) => {
    out.add(key(d.year, d.month, d.day));
    if (dayOfWeek(d) === 0) {
      const mon = shiftDate(d, 1);
      out.add(key(mon.year, mon.month, mon.day));
    }
  };
  for (const [month, day] of FIXED_HOLIDAYS) add({ year, month, day });
  const easter = easterSunday(year);
  add(shiftDate(easter, -2)); // Good Friday
  add(shiftDate(easter, 1));  // Family Day
  return out;
}

const holidayCache = new Map();
function holidaySet(year) {
  if (!holidayCache.has(year)) holidayCache.set(year, holidaysForYear(year));
  return holidayCache.get(year);
}

export function isPublicHoliday(year, month, day) {
  return holidaySet(year).has(key(year, month, day));
}

export function isWorkingDay(year, month, day) {
  const dow = dayOfWeek({ year, month, day });
  if (dow === 0 || dow === 6) return false;
  return !isPublicHoliday(year, month, day);
}

// Break a Date into its South African wall-clock parts.
function toSast(date) {
  const t = date.getTime() + SAST_OFFSET_MINUTES * 60000;
  const d = new Date(t);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

// Put South African wall-clock parts back into a real Date.
function fromSast({ year, month, day, hour, minute, second = 0 }) {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - SAST_OFFSET_MINUTES * 60000,
  );
}

function nextWorkingDay(d) {
  let next = shiftDate(d, 1);
  // A run of weekend plus holidays is short; 30 is far more than enough and
  // stops any chance of an endless loop if a holiday table ever goes wrong.
  for (let guard = 0; guard < 30; guard += 1) {
    if (isWorkingDay(next.year, next.month, next.day)) return next;
    next = shiftDate(next, 1);
  }
  throw new Error("No working day found within 30 days — check the holiday table");
}

/**
 * When an AMBER job is due back, given the moment it became complete.
 *
 * @param {Date|string|number} completeAt when every file and spec was in
 * @returns {Date} the due moment
 */
export function dueAt(completeAt) {
  const start = completeAt instanceof Date ? completeAt : new Date(completeAt);
  if (Number.isNaN(start.getTime())) throw new Error("dueAt needs a real date");

  let s = toSast(start);

  // Step 1: a clock that starts on a weekend or public holiday does not start
  // until 08:00 on the next working day.
  if (!isWorkingDay(s.year, s.month, s.day)) {
    const d = nextWorkingDay({ year: s.year, month: s.month, day: s.day });
    s = { ...d, hour: WORK_DAY_START_HOUR, minute: 0, second: 0 };
  }

  // Step 2: same time of day, on the next working day.
  const due = nextWorkingDay({ year: s.year, month: s.month, day: s.day });
  return fromSast({ ...due, hour: s.hour, minute: s.minute, second: s.second });
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Tue 28 Oct, 16:00" — how the due time is shown to the customer. */
export function formatDue(date) {
  const s = toSast(date instanceof Date ? date : new Date(date));
  const dow = DAY_NAMES[dayOfWeek(s)];
  const hh = String(s.hour).padStart(2, "0");
  const mm = String(s.minute).padStart(2, "0");
  return `${dow} ${s.day} ${MONTH_NAMES[s.month - 1]}, ${hh}:${mm}`;
}
