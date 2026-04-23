import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// Punch-flow diagnostics. Prefer this over [print]: `print` is easy to miss in
/// `flutter run` / IDE on some setups; [developer.log] + [debugPrint] surfaces the same line in the console and logcat.
void logAttendancePunch(String message) {
  developer.log(message, name: 'AttendancePunch');
  debugPrint(message);
}
