import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/widgets/task_brand_icon.dart';

/// Opens the app menu as a modal bottom sheet (bottom → top), non-scrollable.
Future<void> showAppDrawerMenu(
  BuildContext context, {
  required VoidCallback onProfile,
  required VoidCallback onSettings,
  required VoidCallback onLogout,
  VoidCallback? onAddTask,
  VoidCallback? onAddCustomer,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black54,
    useSafeArea: true,
    isScrollControlled: false,
    isDismissible: true,
    enableDrag: true,
    builder: (sheetContext) {
      return _AppDrawerBottomSheet(
        onProfile: onProfile,
        onSettings: onSettings,
        onLogout: onLogout,
        onAddTask: onAddTask,
        onAddCustomer: onAddCustomer,
      );
    },
  );
}

class _AppDrawerBottomSheet extends StatelessWidget {
  const _AppDrawerBottomSheet({
    required this.onProfile,
    required this.onSettings,
    required this.onLogout,
    this.onAddTask,
    this.onAddCustomer,
  });

  final VoidCallback onProfile;
  final VoidCallback onSettings;
  final VoidCallback onLogout;
  final VoidCallback? onAddTask;
  final VoidCallback? onAddCustomer;

  void _popThen(BuildContext sheetContext, VoidCallback action) {
    Navigator.of(sheetContext).pop();
    action();
  }

  @override
  Widget build(BuildContext context) {
    final chevronColor = AppColors.primary;

    return Stack(
      fit: StackFit.expand,
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => Navigator.of(context).pop(),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            child: Material(
              color: Colors.white,
              surfaceTintColor: Colors.transparent,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 10),
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (onAddTask != null)
                    _AppDrawerRow(
                      icon: Icons.add_task_rounded,
                      label: 'Add Task',
                      chevronColor: chevronColor,
                      onTap: () => _popThen(context, onAddTask!),
                    ),
                  if (onAddCustomer != null)
                    _AppDrawerRow(
                      icon: Icons.person_add_alt_1_rounded,
                      label: 'Add Customer',
                      chevronColor: chevronColor,
                      onTap: () => _popThen(context, onAddCustomer!),
                    ),
                  if (onAddTask != null || onAddCustomer != null)
                    Divider(height: 1, thickness: 1, color: Colors.black.withValues(alpha: 0.08)),
                  _AppDrawerRow(
                    icon: Icons.person_outline_rounded,
                    label: 'Profile',
                    chevronColor: chevronColor,
                    onTap: () => _popThen(context, onProfile),
                  ),
                  Divider(height: 1, thickness: 1, color: Colors.black.withValues(alpha: 0.08)),
                  _AppDrawerRow(
                    icon: Icons.settings_outlined,
                    label: 'Settings',
                    chevronColor: chevronColor,
                    onTap: () => _popThen(context, onSettings),
                  ),
                  Divider(height: 1, thickness: 1, color: Colors.black.withValues(alpha: 0.08)),
                  _AppDrawerRow(
                    icon: Icons.logout_rounded,
                    label: 'Logout',
                    chevronColor: chevronColor,
                    onTap: () => _popThen(context, onLogout),
                  ),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _AppDrawerRow extends StatelessWidget {
  const _AppDrawerRow({
    required this.icon,
    required this.label,
    required this.chevronColor,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color chevronColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 24, color: AppColors.primary),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.black,
                ),
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: chevronColor, size: 26),
          ],
        ),
      ),
    );
  }
}

class OvalBottomNavBar extends StatelessWidget {
  const OvalBottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFF0F0F0F),
          borderRadius: BorderRadius.circular(40),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: BottomNavigationBar(
            currentIndex: currentIndex,
            onTap: onTap,
            type: BottomNavigationBarType.fixed,
            elevation: 0,
            backgroundColor: Colors.transparent,
            selectedItemColor: AppColors.primary,
            unselectedItemColor: Colors.white54,
            selectedFontSize: 11,
            unselectedFontSize: 11,
            items: [
              const BottomNavigationBarItem(
                icon: Icon(Icons.dashboard_outlined),
                activeIcon: Icon(Icons.dashboard_rounded),
                label: 'Dashboard',
              ),
              BottomNavigationBarItem(
                icon: TaskBrandIcon(
                  size: 22,
                  color: Colors.white.withValues(alpha: 0.54),
                ),
                activeIcon: TaskBrandIcon(
                  size: 24,
                  color: AppColors.primary,
                ),
                label: 'Tasks',
              ),
              const BottomNavigationBarItem(
                icon: Icon(Icons.storefront_outlined),
                activeIcon: Icon(Icons.storefront_rounded),
                label: 'Visits',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
