import 'package:flutter/material.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/geo/my_tasks_screen.dart';
import 'package:track/screens/attendance/attendance_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/permission_settings_screen.dart';
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
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Settings'),
        centerTitle: true,
        backgroundColor: theme.colorScheme.surface,
        foregroundColor: theme.colorScheme.onSurface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
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
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Text(
            'App',
            style: theme.textTheme.labelLarge?.copyWith(
              color: cs.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 8),
          _SettingsCard(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              leading: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: cs.primary.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(Icons.shield_outlined, color: cs.primary, size: 26),
              ),
              title: Text(
                'Permission settings',
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Location, battery, notifications, and activity — see what is enabled and where to change it.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: cs.onSurfaceVariant,
                    height: 1.35,
                  ),
                ),
              ),
              trailing: Icon(Icons.chevron_right_rounded, color: cs.onSurfaceVariant),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PermissionSettingsScreen(),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      elevation: 0.5,
      shadowColor: theme.colorScheme.shadow.withOpacity(0.08),
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}
