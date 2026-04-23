import 'package:flutter/foundation.dart';

/// Attendance alarm diagnostics.
///
/// Uses [debugPrint] (Flutter tool / `I/flutter` in **debug** & **profile**) and
/// [print] (VM stdout — often the only line that shows in some IDE **Terminal** tabs).
/// In **release**, [debugPrint] is a no-op; [print] still goes to logcat on Android.
///
/// Filter: `AttendanceAlarm` or `I/flutter`
void attendanceAlarmLog(String message) {
  final line = '[AttendanceAlarm] $message';
  // Wide wrap so long lines are not dropped by debugPrint throttling.
  debugPrint(line, wrapWidth: 2000);
  // ignore: avoid_print
  print(line);
}
