import 'dart:convert';

import 'package:android_alarm_manager_plus/android_alarm_manager_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;

import '../models/attendance_alarm_settings.dart';
import '../models/attendance_record.dart';
import '../utils/date_display_util.dart';
import '../utils/weekly_off_policy.dart';
import 'alarm_service.dart';
import 'attendance_alarm_log.dart';
import 'attendance_alarm_punch_state.dart';
import 'attendance_alarm_ring_callback.dart';
import 'attendance_service.dart';
import 'fcm_service.dart';

/// Schedules check-in / check-out reminders, skipping week off, company holidays,
/// and **approved** leave.
///
/// **Android:** [AndroidAlarmManager.oneShotAt] with `rescheduleOnReboot: true`
/// (plugin registers [RebootBroadcastReceiver] for `BOOT_COMPLETED`).
///
/// **iOS:** [FlutterLocalNotificationsPlugin.zonedSchedule] (no AlarmManager API).
class AttendanceAlarmScheduler {
  AttendanceAlarmScheduler._();

  static bool get _useAndroidAlarmEngine =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static const String _prefsIdsKey = 'attendance_alarm_scheduled_ids_v1';
  static const String _prefsLastRescheduleKey = 'attendance_alarm_last_reschedule_ms';
  static const String _prefsCachedSettingsKey = 'attendance_alarm_cached_settings_v1';
  static const String _prefsLastScheduleStatusKey = 'attendance_alarm_last_schedule_status_v1';
  static const int _idBase = 934000;
  static const int _horizonDays = 36;

  /// Exposed for future UI/debug card (status, fallback usage, last success).
  static Future<Map<String, dynamic>> getLastScheduleStatus() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefsLastScheduleStatusKey);
    if (raw == null || raw.isEmpty) return const {};
    try {
      final m = jsonDecode(raw);
      if (m is Map<String, dynamic>) return m;
      if (m is Map) return Map<String, dynamic>.from(m);
    } catch (_) {}
    return const {};
  }

  static Future<void> _saveScheduleStatus(
    SharedPreferences prefs, {
    required bool ok,
    required String source,
    required bool usedCachedSettings,
    required int scheduledCount,
    DateTime? earliest,
    String? message,
  }) async {
    final m = <String, dynamic>{
      'ok': ok,
      'source': source,
      'usedCachedSettings': usedCachedSettings,
      'scheduledCount': scheduledCount,
      'earliest': earliest?.toIso8601String(),
      'message': message ?? '',
      'updatedAt': DateTime.now().toIso8601String(),
    };
    await prefs.setString(_prefsLastScheduleStatusKey, jsonEncode(m));
  }

  static List<int> _decodeIds(String? raw) {
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = jsonDecode(raw) as List<dynamic>?;
      if (list == null) return const [];
      return list.map((e) => int.tryParse(e.toString())).whereType<int>().toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<List<int>> _readStoredIds(SharedPreferences prefs) async {
    return _decodeIds(prefs.getString(_prefsIdsKey));
  }

  static Future<void> _cancelId(
    FlutterLocalNotificationsPlugin plugin,
    int id,
  ) async {
    if (_useAndroidAlarmEngine) {
      await AndroidAlarmManager.cancel(id);
    }
    await plugin.cancel(id);
  }

  static Future<void> _cancelIds(
    FlutterLocalNotificationsPlugin plugin,
    Iterable<int> ids,
  ) async {
    for (final id in ids) {
      await _cancelId(plugin, id);
    }
  }

  static Future<void> _cacheAlarmSettings(
    SharedPreferences prefs,
    AttendanceAlarmSettings settings,
  ) async {
    final payload = <String, dynamic>{
      'savedAt': DateTime.now().toIso8601String(),
      'settings': settings.toJson(),
    };
    await prefs.setString(_prefsCachedSettingsKey, jsonEncode(payload));
  }

  static AttendanceAlarmSettings? _readCachedAlarmSettings(SharedPreferences prefs) {
    final raw = prefs.getString(_prefsCachedSettingsKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        final s = decoded['settings'];
        if (s is Map<String, dynamic>) return AttendanceAlarmSettings.fromJson(s);
        if (s is Map) return AttendanceAlarmSettings.fromJson(Map<String, dynamic>.from(s));
      } else if (decoded is Map) {
        final m = Map<String, dynamic>.from(decoded);
        final s = m['settings'];
        if (s is Map<String, dynamic>) return AttendanceAlarmSettings.fromJson(s);
        if (s is Map) return AttendanceAlarmSettings.fromJson(Map<String, dynamic>.from(s));
      }
    } catch (_) {}
    return null;
  }

  static int _stableId(DateTime day, bool checkout) {
    final d = DateDisplayUtil.dateOnlyLocal(day);
    final key = d.year * 372 + d.month * 31 + d.day;
    return _idBase + (key % 29000) * 2 + (checkout ? 1 : 0);
  }

  static Int64List _vibrationPattern() {
    final parts = <int>[0];
    for (var i = 0; i < 12; i++) {
      parts.addAll([400, 350]);
    }
    return Int64List.fromList(parts);
  }

  static NotificationDetails _alarmDetails(String title, String body) {
    final android = AndroidNotificationDetails(
      AlarmService.alarmChannelId,
      'Alarms',
      channelDescription: 'Attendance reminders',
      importance: Importance.max,
      priority: Priority.max,
      icon: '@drawable/ic_notification',
      fullScreenIntent: true,
      playSound: true,
      enableVibration: true,
      vibrationPattern: _vibrationPattern(),
      timeoutAfter: 20000,
    );
    const ios = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: false,
      presentSound: true,
    );
    return NotificationDetails(android: android, iOS: ios);
  }

  static Future<void> cancelScheduled(
    FlutterLocalNotificationsPlugin plugin,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefsIdsKey);
    if (raw == null || raw.isEmpty) {
      attendanceAlarmLog('cancelScheduled: nothing to cancel');
      return;
    }
    var n = 0;
    try {
      final list = jsonDecode(raw) as List<dynamic>?;
      if (list != null) {
        for (final e in list) {
          final id = int.tryParse(e.toString());
          if (id == null) continue;
          if (_useAndroidAlarmEngine) {
            await AndroidAlarmManager.cancel(id);
          }
          await plugin.cancel(id);
          n++;
        }
      }
    } catch (e) {
      attendanceAlarmLog('cancelScheduled error: $e');
    }
    await prefs.remove(_prefsIdsKey);
    attendanceAlarmLog('cancelScheduled: removed $n alarm id(s)');
  }

  static Future<void> _scheduleAndroidOne({
    required int id,
    required DateTime when,
    required String alarmYmd,
    required bool checkout,
    required List<int> idsOut,
  }) async {
    final params = <String, dynamic>{
      'kind': checkout ? 'checkout' : 'checkin',
      'alarmYmd': alarmYmd,
    };
    try {
      final ok = await AndroidAlarmManager.oneShotAt(
        when,
        id,
        attendanceAlarmRingCallback,
        alarmClock: true,
        allowWhileIdle: true,
        exact: true,
        wakeup: true,
        rescheduleOnReboot: true,
        params: params,
      );
      if (ok) {
        idsOut.add(id);
        attendanceAlarmLog(
          'Android oneShotAt OK id=$id at=$when ms=${when.millisecondsSinceEpoch}',
        );
      } else {
        attendanceAlarmLog('Android oneShotAt FALSE id=$id at=$when (plugin rejected)');
      }
    } catch (e) {
      attendanceAlarmLog('Android exact oneShotAt FAILED id=$id at=$when err=$e');
      try {
        final ok = await AndroidAlarmManager.oneShotAt(
          when,
          id,
          attendanceAlarmRingCallback,
          alarmClock: true,
          allowWhileIdle: true,
          exact: false,
          wakeup: true,
          rescheduleOnReboot: true,
          params: params,
        );
        if (ok) {
          idsOut.add(id);
          attendanceAlarmLog('Android fallback oneShotAt OK id=$id at=$when');
        } else {
          attendanceAlarmLog('Android fallback oneShotAt FALSE id=$id at=$when');
        }
      } catch (e2) {
        attendanceAlarmLog('Android fallback oneShotAt FAILED id=$id err=$e2');
      }
    }
  }

  static Future<void> _scheduleIosNotification({
    required FlutterLocalNotificationsPlugin plugin,
    required int id,
    required String title,
    required String body,
    required DateTime when,
    required List<int> idsOut,
  }) async {
    final details = _alarmDetails(title, body);
    final scheduled = tz.TZDateTime.from(when, tz.local);
    try {
      await plugin.zonedSchedule(
        id,
        title,
        body,
        scheduled,
        details,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
      );
      idsOut.add(id);
      attendanceAlarmLog(
        'iOS zonedSchedule OK id=$id local=$when tz=${tz.local.name} zoned=$scheduled',
      );
    } on PlatformException catch (e) {
      attendanceAlarmLog('iOS zonedSchedule PlatformException id=$id code=${e.code} $e');
      if (e.code == 'exact_alarms_not_permitted') {
        try {
          await plugin.zonedSchedule(
            id,
            title,
            body,
            scheduled,
            details,
            androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
            uiLocalNotificationDateInterpretation:
                UILocalNotificationDateInterpretation.absoluteTime,
          );
          idsOut.add(id);
          attendanceAlarmLog('iOS inexact zonedSchedule OK id=$id');
        } catch (err) {
          attendanceAlarmLog('iOS inexact zonedSchedule FAILED id=$id err=$err');
        }
      }
    } catch (e) {
      attendanceAlarmLog('iOS zonedSchedule FAILED id=$id err=$e');
    }
  }

  /// Loads settings from the server and schedules the next [_horizonDays] workdays.
  /// [force] bypasses the short debounce used when the dashboard refreshes often.
  static Future<void> rescheduleFromServer({bool force = false}) async {
    final prefs = await SharedPreferences.getInstance();
    if (!force) {
      final last = prefs.getInt(_prefsLastRescheduleKey) ?? 0;
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      if (nowMs - last < 45000) {
        attendanceAlarmLog(
          'rescheduleFromServer SKIPPED (debounce ${45000 - (nowMs - last)}ms left)',
        );
        return;
      }
    }

    attendanceAlarmLog(
      'rescheduleFromServer START force=$force engine=${_useAndroidAlarmEngine ? "AndroidAlarmManager" : "notifications"}',
    );

    final plugin = FcmService.localNotifications;
    await AlarmService.initializeTimezone();
    await AlarmService.ensureAlarmChannel(plugin);
    attendanceAlarmLog('tz.local=${tz.local.name} deviceNow=${DateTime.now()}');

    final att = AttendanceService();
    AttendanceAlarmSettings settings;
    var usedCachedSettings = false;
    try {
      settings = await att.fetchAttendanceAlarms();
      await _cacheAlarmSettings(prefs, settings);
    } catch (e) {
      final cached = _readCachedAlarmSettings(prefs);
      if (cached == null) {
        attendanceAlarmLog('fetchAttendanceAlarms FAILED and no cached settings (keep existing schedule): $e');
        await _saveScheduleStatus(
          prefs,
          ok: false,
          source: 'none',
          usedCachedSettings: false,
          scheduledCount: (await _readStoredIds(prefs)).length,
          message: 'settings fetch failed and no cache',
        );
        return;
      }
      settings = cached;
      usedCachedSettings = true;
      attendanceAlarmLog('fetchAttendanceAlarms FAILED -> using cached settings: $e');
    }

    attendanceAlarmLog(
      'settings in=${settings.checkInEnabled} out=${settings.checkOutEnabled} '
      'inMin=${settings.checkInMinutes} outMin=${settings.checkOutMinutes}',
    );
    if (usedCachedSettings) {
      attendanceAlarmLog('offline fallback active: scheduling from cached settings');
    }

    final oldIds = await _readStoredIds(prefs);
    final oldSet = oldIds.toSet();

    if (!settings.checkInEnabled && !settings.checkOutEnabled) {
      await _cancelIds(plugin, oldIds);
      await prefs.setString(_prefsIdsKey, jsonEncode(const <int>[]));
      await prefs.setInt(
        _prefsLastRescheduleKey,
        DateTime.now().millisecondsSinceEpoch,
      );
      attendanceAlarmLog('both alarms disabled → cancelled & exit');
      await _saveScheduleStatus(
        prefs,
        ok: true,
        source: usedCachedSettings ? 'cache' : 'server',
        usedCachedSettings: usedCachedSettings,
        scheduledCount: 0,
        message: 'both disabled; cleared existing alarms',
      );
      return;
    }

    List<LeaveRequestRecord> leaves;
    try {
      leaves = await att.fetchLeaveStatus();
    } catch (e) {
      leaves = const [];
      attendanceAlarmLog('fetchLeaveStatus failed, using empty list: $e');
    }
    attendanceAlarmLog('leave rows=${leaves.length}');

    ({WeeklyOffPolicy weekOffPolicy, Map<String, String> holidays}) bundle;
    try {
      bundle = await _loadShiftBundle(att);
    } catch (e) {
      bundle = (weekOffPolicy: WeeklyOffPolicy.fallbackSatSun(), holidays: const <String, String>{});
      attendanceAlarmLog('fetchShiftMeta failed, using fallback weekOff Sat/Sun and no holidays: $e');
    }
    attendanceAlarmLog(
      'shiftMeta weekOffHasRules=${bundle.weekOffPolicy.hasRules} holidayKeys=${bundle.holidays.length}',
    );

    final now = DateTime.now();
    final today = DateDisplayUtil.dateOnlyLocal(now);
    Map<String, AttendanceDayPunch> punchByYmd = {};
    try {
      final lastDay = today.add(Duration(days: _horizonDays - 1));
      final toEnd = DateTime(
        lastDay.year,
        lastDay.month,
        lastDay.day,
        23,
        59,
        59,
        999,
      );
      final horizon = await att.fetchHistoryAllPages(from: today, to: toEnd);
      punchByYmd = AttendanceAlarmPunchState.buildPunchByYmd(horizon);
      await AttendanceAlarmPunchState.persistTodayFromPunchMap(punchByYmd);
      attendanceAlarmLog(
        'punch horizon rows=${horizon.length} distinctDays=${punchByYmd.length}',
      );
    } catch (e) {
      attendanceAlarmLog(
        'punch horizon fetch failed (alarms still scheduled; ring uses prefs): $e',
      );
    }

    final ids = <int>[];
    var scheduleAttempts = 0;
    var scheduleFailures = 0;
    var skippedDays = 0;
    var skippedPast = 0;
    var skippedAlreadyPunched = 0;
    DateTime? earliest;

    for (var i = 0; i < _horizonDays; i++) {
      final d = today.add(Duration(days: i));
      final reason = _skipReason(d, leaves, bundle);
      if (reason != null) {
        skippedDays++;
        if (skippedDays <= 5 || i < 3) {
          attendanceAlarmLog('skip day ${_ymd(d)} ($reason)');
        }
        continue;
      }

      final ymd = _ymd(d);
      final punch = punchByYmd[ymd];

      if (settings.checkInEnabled) {
        if (punch?.ci == true) {
          skippedAlreadyPunched++;
          attendanceAlarmLog('skip check-in schedule $ymd (already checked in)');
        } else {
          final at = _dateWithMinutes(d, settings.checkInMinutes);
          if (at.isAfter(now)) {
            final id = _stableId(d, false);
            scheduleAttempts++;
            if (_useAndroidAlarmEngine) {
              await _scheduleAndroidOne(
                id: id,
                when: at,
                alarmYmd: ymd,
                checkout: false,
                idsOut: ids,
              );
            } else {
              await _scheduleIosNotification(
                plugin: plugin,
                id: id,
                title: 'LiveTrack — Check-in',
                body: 'Reminder: mark your attendance check-in.',
                when: at,
                idsOut: ids,
              );
            }
            if (!ids.contains(id)) scheduleFailures++;
            earliest = earliest == null || at.isBefore(earliest) ? at : earliest;
          } else {
            skippedPast++;
            attendanceAlarmLog(
              'check-in PAST skipped day=$ymd at=$at (now=$now)',
            );
          }
        }
      }

      if (settings.checkOutEnabled) {
        if (punch?.co == true) {
          skippedAlreadyPunched++;
          attendanceAlarmLog('skip check-out schedule $ymd (already checked out)');
        } else {
          final at = _dateWithMinutes(d, settings.checkOutMinutes);
          if (at.isAfter(now)) {
            final id = _stableId(d, true);
            scheduleAttempts++;
            if (_useAndroidAlarmEngine) {
              await _scheduleAndroidOne(
                id: id,
                when: at,
                alarmYmd: ymd,
                checkout: true,
                idsOut: ids,
              );
            } else {
              await _scheduleIosNotification(
                plugin: plugin,
                id: id,
                title: 'LiveTrack — Check-out',
                body: 'Reminder: mark your attendance check-out.',
                when: at,
                idsOut: ids,
              );
            }
            if (!ids.contains(id)) scheduleFailures++;
            earliest = earliest == null || at.isBefore(earliest) ? at : earliest;
          } else {
            skippedPast++;
            attendanceAlarmLog(
              'check-out PAST skipped day=$ymd at=$at (now=$now)',
            );
          }
        }
      }
    }

    // Guardrail: if scheduling attempts all failed, preserve previous schedule.
    if (scheduleAttempts > 0 && ids.isEmpty && scheduleFailures > 0) {
      attendanceAlarmLog(
        'WARN: scheduling attempts failed ($scheduleFailures/$scheduleAttempts). Keeping existing schedule unchanged.',
      );
      await _saveScheduleStatus(
        prefs,
        ok: false,
        source: usedCachedSettings ? 'cache' : 'server',
        usedCachedSettings: usedCachedSettings,
        scheduledCount: oldIds.length,
        message: 'all scheduling attempts failed; old schedule preserved',
      );
      return;
    }

    // Commit phase: only now cancel stale existing alarms and persist new schedule.
    final newSet = ids.toSet();
    final stale = oldSet.difference(newSet);
    if (stale.isNotEmpty) {
      await _cancelIds(plugin, stale);
      attendanceAlarmLog('commit: canceled stale alarms count=${stale.length}');
    }

    await prefs.setString(_prefsIdsKey, jsonEncode(ids));
    await prefs.setInt(
      _prefsLastRescheduleKey,
      DateTime.now().millisecondsSinceEpoch,
    );

    if (ids.isEmpty) {
      attendanceAlarmLog(
        'WARN: ZERO alarms scheduled. skippedDays=$skippedDays skippedPast=$skippedPast '
        'skippedAlreadyPunched=$skippedAlreadyPunched '
        '(if testing "today", pick a time in the future, or tomorrow may be weekOff/holiday/leave)',
      );
    } else {
      attendanceAlarmLog(
        'DONE scheduledIds=${ids.length} earliest=$earliest ids=$ids',
      );
    }
    await _saveScheduleStatus(
      prefs,
      ok: true,
      source: usedCachedSettings ? 'cache' : 'server',
      usedCachedSettings: usedCachedSettings,
      scheduledCount: ids.length,
      earliest: earliest,
      message: usedCachedSettings
          ? 'scheduled from cached settings (offline fallback)'
          : 'scheduled from server settings',
    );
  }

  static DateTime _dateWithMinutes(DateTime day, int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    final d = DateDisplayUtil.dateOnlyLocal(day);
    return DateTime(d.year, d.month, d.day, h, m);
  }

  static Future<({WeeklyOffPolicy weekOffPolicy, Map<String, String> holidays})> _loadShiftBundle(
    AttendanceService att,
  ) async {
    final n = DateTime.now();
    final m1 = DateTime(n.year, n.month, 1);
    final m2 = DateTime(n.year, n.month + 1, 1);
    final meta1 = await att.fetchShiftMeta(month: m1) ?? {};
    final meta2 = await att.fetchShiftMeta(month: m2) ?? {};

    final weekOffPolicy = WeeklyOffPolicy.fromShiftMeta(meta1);

    final holidays = <String, String>{};
    void addH(Map<String, dynamic> meta) {
      final raw = (meta['holidays'] as List?) ?? const [];
      for (final h in raw) {
        if (h is! Map) continue;
        final key = h['ymd']?.toString() ?? '';
        if (key.isEmpty) continue;
        holidays[key] = h['name']?.toString() ?? 'Holiday';
      }
    }

    addH(meta1);
    addH(meta2);
    return (weekOffPolicy: weekOffPolicy, holidays: holidays);
  }

  static String _ymd(DateTime d) {
    final x = DateDisplayUtil.dateOnlyLocal(d);
    return '${x.year}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
  }

  /// Non-null → day should not get alarms. String is a short reason for logs.
  static String? _skipReason(
    DateTime day,
    List<LeaveRequestRecord> leaves,
    ({WeeklyOffPolicy weekOffPolicy, Map<String, String> holidays}) bundle,
  ) {
    final d = DateDisplayUtil.dateOnlyLocal(day);
    final hol = bundle.holidays[_ymd(d)];
    if (hol != null) return 'holiday:$hol';
    if (bundle.weekOffPolicy.isWeeklyOff(d)) {
      return 'weekOff';
    }
    for (final l in leaves) {
      if (l.status.toUpperCase() != 'APPROVED') continue;
      final from = DateDisplayUtil.dateOnlyLocal(l.fromDate);
      final to = DateDisplayUtil.dateOnlyLocal(l.toDate);
      if (!d.isBefore(from) && !d.isAfter(to)) {
        return 'approvedLeave ${l.leaveType}';
      }
    }
    return null;
  }

}
