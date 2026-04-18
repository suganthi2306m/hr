import 'package:flutter/material.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/geo/my_tasks_screen.dart';
import 'package:track/screens/visits/visits_screen.dart';

/// Replaces the current route with Dashboard (0), Tasks (1), or Visits (2).
void pushMainShellByIndex(BuildContext context, int index) {
  if (index < 0 || index > 2) return;
  final Widget target = switch (index) {
    0 => const DashboardScreen(),
    1 => const MyTasksScreen(),
    2 => const VisitsScreen(),
    _ => const DashboardScreen(),
  };
  Navigator.pushReplacement(
    context,
    MaterialPageRoute<void>(builder: (_) => target),
  );
}
