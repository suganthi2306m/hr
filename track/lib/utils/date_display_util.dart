import 'package:intl/intl.dart';

/// Single place for **Mongo / API → device** date-time parsing and **display** formatting.
///
/// REST payloads are almost always UTC (`…Z` or offset). [DateFormat] on a UTC
/// [DateTime] formats **UTC wall time**, not local — always go through
/// [toLocalInstant] / [formatForDisplay] for UI.
class DateDisplayUtil {
  DateDisplayUtil._();

  /// Normalizes an instant to the device’s local timezone for UI.
  static DateTime toLocalInstant(DateTime dateTime) {
    return dateTime.isUtc ? dateTime.toLocal() : dateTime;
  }

  /// Calendar date in local time (year, month, day only).
  static DateTime dateOnlyLocal(DateTime dateTime) {
    final l = toLocalInstant(dateTime);
    return DateTime(l.year, l.month, l.day);
  }

  /// Parses MongoDB / API values: ISO strings, `{$date: …}`, millis int, [DateTime].
  /// Returns a [DateTime] in **UTC** when the source is unambiguously UTC (Z, offset, BSON).
  /// Naive ISO strings (no zone) are parsed as given by [DateTime.tryParse] (Dart: **local**).
  static DateTime? parseFromApiInstant(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) {
      return value.isUtc ? value : value.toUtc();
    }
    if (value is int) {
      return DateTime.fromMillisecondsSinceEpoch(value, isUtc: true);
    }
    if (value is Map) {
      final d = value[r'$date'] ?? value['\$date'];
      if (d != null) return parseFromApiInstant(d);
      final nl = value[r'$numberLong'] ?? value['\$numberLong'];
      if (nl != null) {
        final ms = int.tryParse(nl.toString());
        if (ms != null) return DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true);
      }
    }
    final s = value.toString().trim();
    if (s.isEmpty) return null;
    return DateTime.tryParse(s);
  }

  /// Same as [parseFromApiInstant] then [toLocal] — use when storing “wall clock”
  /// times in models (matches legacy attendance parsing).
  static DateTime? parseFromApiAsLocal(dynamic value) {
    final instant = parseFromApiInstant(value);
    return instant?.toLocal();
  }

  /// Formats for display in **local** time.
  static String formatForDisplay(DateTime? dateTime, String pattern) {
    if (dateTime == null) return '—';
    final local = toLocalInstant(dateTime);
    return DateFormat(pattern).format(local);
  }

  /// Short time: "10:30 AM"
  static String formatTime(DateTime? dateTime) =>
      formatForDisplay(dateTime, 'h:mm a');

  /// Date + time: "06 Feb 2025, 10:30 AM"
  static String formatDateTime(DateTime? dateTime) =>
      formatForDisplay(dateTime, 'dd MMM yyyy, h:mm a');

  /// Visits list / sheet (12h with leading zero on hour): "17 Apr 2025, 07:09 PM"
  static String formatVisitsDateTime(DateTime? dateTime) =>
      formatForDisplay(dateTime, 'dd MMM yyyy, hh:mm a');

  /// Visit “day” line: "17 Apr 2025" in local calendar.
  static String formatVisitsDayOnly(DateTime? dateTime) =>
      formatForDisplay(dateTime, 'dd MMM yyyy');

  /// Full: "Thursday, 06 Feb 2025 at 10:30 AM"
  static String formatFull(DateTime? dateTime) =>
      formatForDisplay(dateTime, "EEEE, dd MMM yyyy 'at' h:mm a");

  /// Short date: "06 Feb 25"
  static String formatShortDate(DateTime? dateTime) =>
      formatForDisplay(dateTime, 'dd MMM yy');

  /// Date only: "06 Feb 2025"
  static String formatDateOnly(DateTime? dateTime) =>
      formatForDisplay(dateTime, 'dd MMM yyyy');

  /// Timeline style: "Feb 6, 10:30 AM"
  static String formatTimeline(DateTime? dateTime) =>
      formatForDisplay(dateTime, 'MMM d, h:mm a');
}
