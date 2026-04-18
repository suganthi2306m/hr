import 'package:flutter/material.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/geo/my_tasks_screen.dart';
import 'package:track/screens/attendance/attendance_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/visits/visits_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/widgets/app_shell_navigation.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  void _navigateToIndex(BuildContext context, int index) {
    if (index < 0 || index > 4) return;
    final Widget target = switch (index) {
      0 => const DashboardScreen(),
      1 => const MyTasksScreen(),
      2 => const VisitsScreen(),
      3 => const AttendanceScreen(),
      4 => const ProfileScreen(),
      _ => const DashboardScreen(),
    };
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => target),
    );
  }

  Future<void> _logout(BuildContext context) async {
    await AuthService().logout();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        centerTitle: true,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Back',
          onPressed: () {
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop();
            } else {
              _navigateToIndex(context, 0);
            }
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.menu_rounded),
            tooltip: 'Menu',
            onPressed: () {
              showAppDrawerMenu(
                context,
                onProfile: () => _navigateToIndex(context, 4),
                onSettings: () {},
                onLogout: () => _logout(context),
              );
            },
          ),
        ],
      ),
      body: const SafeArea(
        child: Center(
          child: Text(
            'Settings screen',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
        ),
      ),
    );
  }
}
