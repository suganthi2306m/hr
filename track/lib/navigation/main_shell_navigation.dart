import 'package:flutter/material.dart';
import 'package:track/screens/attendance/attendance_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/geo/my_tasks_screen.dart';
import 'package:track/screens/visits/visits_screen.dart';

/// Replaces the current route with Dashboard (0), Tasks (1), Visits (2), or Attendance (3).
void pushMainShellByIndex(BuildContext context, int index) {
  if (index < 0 || index > 3) return;
  final Widget target = switch (index) {
    0 => const DashboardScreen(),
    1 => const MyTasksScreen(),
    2 => const VisitsScreen(),
    3 => const AttendanceScreen(),
    _ => const DashboardScreen(),
  };
  Navigator.pushReplacement(
    context,
    MaterialPageRoute<void>(builder: (_) => target),
  );
}
