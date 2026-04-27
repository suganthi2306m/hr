import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/attendance_record.dart';
import '../utils/date_display_util.dart';

/// Local check-in / check-out flags per calendar day (device timezone).
///
/// Used by [attendanceAlarmRingCallback] (prefs only) and [AttendanceAlarmScheduler]
/// (server horizon + prefs for today).
typedef AttendanceDayPunch = ({bool ci, bool co});

/// Persists today’s check-in / check-out flags for [attendanceAlarmRingCallback]
/// (Android alarm isolate reads only SharedPreferences).
class AttendanceAlarmPunchState {
  AttendanceAlarmPunchState._();

  static const String _k = 'attendance_alarm_punch_today_v1';

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_k);
  }

  static String ymdFromDate(DateTime d) {
    final x = DateDisplayUtil.dateOnlyLocal(d);
    return '${x.year}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
  }

  /// One entry per local calendar day that has at least one attendance row.
  ///
  /// Uses the **latest** [AttendanceRecord.checkInTime] for that day so a new open
  /// session is not treated as “checked out” because an older row had checkout.
  static Map<String, AttendanceDayPunch> buildPunchByYmd(List<AttendanceRecord> history) {
    final byDay = <String, List<AttendanceRecord>>{};
    for (final r in history) {
      final day = r.attendanceDate != null
          ? DateDisplayUtil.dateOnlyLocal(r.attendanceDate!)
          : DateDisplayUtil.dateOnlyLocal(r.checkInTime);
      final ymd = ymdFromDate(day);
      byDay.putIfAbsent(ymd, () => []).add(r);
    }
    final out = <String, AttendanceDayPunch>{};
    for (final e in byDay.entries) {
      final rows = [...e.value]..sort((a, b) => b.checkInTime.compareTo(a.checkInTime));
      final latest = rows.first;
      out[e.key] = (ci: true, co: latest.checkOutTime != null);
    }
    return out;
  }

  /// Updates prefs used by the alarm callback for **today** from a server horizon map.
  ///
  /// Merges with any existing same-day snapshot so a [applyAfterOnlinePunch] update is not
  /// overwritten if `/attendance/history` is briefly behind the punch response.
  static Future<void> persistTodayFromPunchMap(Map<String, AttendanceDayPunch> punchByYmd) async {
    final todayYmd = ymdFromDate(DateTime.now());
    final p = punchByYmd[todayYmd];
    var ci = p?.ci ?? false;
    var co = p?.co ?? false;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_k);
    if (raw != null && raw.isNotEmpty) {
      try {
        final m = Map<String, dynamic>.from(jsonDecode(raw) as Map);
        if (m['ymd']?.toString() == todayYmd) {
          if (m['ci'] == true) ci = true;
          if (m['co'] == true) co = true;
        }
      } catch (_) {}
    }
    await prefs.setString(
      _k,
      jsonEncode({
        'ymd': todayYmd,
        'ci': ci,
        'co': co,
      }),
    );
  }

  /// Refreshes stored punch flags from server history (newest rows may be any day).
  ///
  /// Uses [buildPunchByYmd] so **today** follows the latest check-in row for that calendar
  /// day (open session is not overwritten by an older completed row). If [history] has
  /// no row for today, clears today unless an existing same-ymd snapshot is kept for
  /// brief server lag (same as before).
  static Future<void> syncFromHistory(List<AttendanceRecord> history) async {
    final today = DateDisplayUtil.dateOnlyLocal(DateTime.now());
    final ymd = ymdFromDate(today);
    final punchByYmd = buildPunchByYmd(history);
    final p = punchByYmd[ymd];
    final prefs = await SharedPreferences.getInstance();
    if (p == null) {
      final raw = prefs.getString(_k);
      if (raw != null && raw.isNotEmpty) {
        try {
          final m = Map<String, dynamic>.from(jsonDecode(raw) as Map);
          if (m['ymd']?.toString() == ymd) return;
        } catch (_) {}
      }
      await prefs.setString(_k, jsonEncode({'ymd': ymd, 'ci': false, 'co': false}));
      return;
    }
    await persistTodayFromPunchMap(punchByYmd);
  }

  /// Call after a successful online check-in or check-out (including replay from the pending queue).
  static Future<void> applyAfterOnlinePunch(String queueType) async {
    final prefs = await SharedPreferences.getInstance();
    final ymd = ymdFromDate(DateTime.now());
    Map<String, dynamic> m = {};
    final raw = prefs.getString(_k);
    if (raw != null && raw.isNotEmpty) {
      try {
        m = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      } catch (_) {}
    }
    var ci = m['ci'] == true;
    var co = m['co'] == true;
    if (m['ymd']?.toString() != ymd) {
      ci = false;
      co = false;
    }
    if (queueType == 'checkin') {
      ci = true;
    } else if (queueType == 'checkout') {
      ci = true;
      co = true;
    }
    await prefs.setString(_k, jsonEncode({'ymd': ymd, 'ci': ci, 'co': co}));
  }

  /// `true` → do not play sound / notification (already punched or invalid checkout slot).
  static Future<bool> shouldSkipRing({
    required String alarmYmd,
    required String kind,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_k);
    if (raw == null || raw.isEmpty) return false;
    Map<String, dynamic> m;
    try {
      m = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return false;
    }
    if (m['ymd']?.toString() != alarmYmd) return false;
    final ci = m['ci'] == true;
    final co = m['co'] == true;
    if (kind == 'checkin') return ci;
    if (kind == 'checkout') {
      if (!ci) return true;
      if (co) return true;
      return false;
    }
    return false;
  }
}
