/**
 * @deprecated Prefer `src/utils/attendanceTime.js` for new imports.
 * Re-exports kept so older paths keep working.
 */
export {
  getAttendanceIanaTimezone,
  localCalendarDayRangeISO,
  localWallClockToEpochMs,
  localWallClockToISO,
  dayContextForApi,
  formatAttendanceClock,
  formatAttendanceTimeShort,
  formatAttendanceDateTime,
  wallClockPartsFromStoredUtc,
} from './attendanceTime';
