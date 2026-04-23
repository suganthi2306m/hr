import 'package:flutter/material.dart';
import 'package:track/screens/attendance/attendance_summary_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/leads/lead_list_screen.dart';
import 'package:track/screens/visits/visits_screen.dart';

/// Replaces current route with Attendance (0), Dashboard (1), Visits (2), Leads (3).
void pushMainShellByIndex(BuildContext context, int index) {
  if (index < 0 || index > 3) return;
  final Widget target = switch (index) {
    0 => const AttendanceSummaryScreen(),
    1 => const DashboardScreen(),
    2 => const VisitsScreen(),
    3 => const LeadListScreen(),
    _ => const DashboardScreen(),
  };
  Navigator.pushReplacement(
    context,
    MaterialPageRoute<void>(builder: (_) => target),
  );
}
