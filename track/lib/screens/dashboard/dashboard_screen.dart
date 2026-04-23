import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/attendance_record.dart';
import 'package:track/models/task.dart';
import 'package:track/screens/attendance/attendance_summary_screen.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/customers/company_customers_screen.dart';
import 'package:track/screens/leads/lead_list_screen.dart';
import 'package:track/screens/geo/add_customer_screen.dart';
import 'package:track/screens/geo/add_task_screen.dart';
import 'package:track/widgets/task_brand_icon.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/visits/visits_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/attendance_alarm_log.dart';
import 'package:track/services/attendance_alarm_punch_state.dart';
import 'package:track/services/attendance_alarm_scheduler.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/services/presence_tracking_service.dart';
import 'package:track/services/task_service.dart';
import 'package:track/utils/attendance_camera_flow.dart';
import 'package:track/utils/attendance_punch_log.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/attendance_alarm_sheet.dart';
import 'package:track/widgets/location_loader.dart';

class _TaskSummary {
  const _TaskSummary({
    required this.all,
    required this.pending,
    required this.remaining,
    required this.active,
    required this.completed,
  });

  final int all;
  final int pending;
  final int remaining;
  final int active;
  final int completed;

  static _TaskSummary fromTasks(List<Task> tasks) {
    var pending = 0;
    var active = 0;
    var completed = 0;
    for (final t in tasks) {
      switch (t.status) {
        case TaskStatus.pending:
        case TaskStatus.assigned:
        case TaskStatus.scheduled:
        case TaskStatus.approved:
        case TaskStatus.staffapproved:
          pending++;
          break;
        case TaskStatus.inProgress:
        case TaskStatus.arrived:
          active++;
          break;
        case TaskStatus.completed:
        case TaskStatus.waitingForApproval:
          completed++;
          break;
        default:
          break;
      }
    }
    final remaining = tasks
        .where(
          (t) =>
              t.status != TaskStatus.completed &&
              t.status != TaskStatus.rejected &&
              t.status != TaskStatus.cancelled,
        )
        .length;
    return _TaskSummary(
      all: tasks.length,
      pending: pending,
      remaining: remaining,
      active: active,
      completed: completed,
    );
  }
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with MainShellSwipeNavigation {
  static const Color _bg = Colors.white;
  static const Color _card = Colors.white;
  static const Color _ink = Color(0xFF1A1A1A);

  String _userName = 'there';
  List<Task> _tasks = [];
  List<AttendanceRecord> _attendanceHistory = const [];
  bool _loading = true;
  String? _userId;


  String get _firstName {
    final n = _userName.trim();
    if (n.isEmpty || n == 'there') return 'there';
    return n.split(RegExp(r'\s+')).first;
  }

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    try {
      final isActive = await _enforceActiveEmployeeOrLogout();
      if (isActive == false) return;
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user');
      if (raw != null && raw.isNotEmpty) {
        final map = jsonDecode(raw) as Map<String, dynamic>?;
        if (map != null) {
          _userName = (map['name'] ?? map['fullName'] ?? map['email'] ?? 'there')
              .toString();
          final id = map['_id'] ?? map['id'] ?? map['userId'];
          if (id != null) _userId = id is String ? id : id.toString();
        }
      }
      List<Task> tasks = [];
      if (_userId != null && _userId!.isNotEmpty) {
        tasks = await TaskService().getAssignedTasks(_userId!);
      } else {
        tasks = await TaskService().getAllTasks();
      }
      List<AttendanceRecord> attendance = const [];
      try {
        final att = AttendanceService();
        await att.syncPendingOps();
        attendance = await att.fetchHistory();
        await AttendanceAlarmPunchState.syncFromHistory(attendance);
      } catch (_) {}
      if (mounted) {
        setState(() {
          _tasks = tasks;
          _attendanceHistory = attendance;
          _loading = false;
        });
        unawaited(
          _syncPresenceTrackingFromAttendance(attendance).catchError(
            (Object e, StackTrace _) {
              if (kDebugMode) {
                debugPrint('[Dashboard] presence sync from attendance: $e');
              }
            },
          ),
        );
        unawaited(AttendanceAlarmScheduler.rescheduleFromServer());
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<bool?> _enforceActiveEmployeeOrLogout() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null || token.isEmpty || !mounted) return null;

    final active = await AuthService().checkUserActive();
    if (active != false || !mounted) return active;

    await AuthService().logout();
    if (!mounted) return false;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
    return false;
  }

  /// Starts 1‑minute presence location pings when an open check-in exists (any screen).
  Future<void> _syncPresenceTrackingFromAttendance(
    List<AttendanceRecord> history,
  ) async {
    if (history.isEmpty) return;
    final punchedIn = history.first.checkOutTime == null;
    if (punchedIn) {
      final loc = history.first.checkInLocation;
      if (loc != null && (loc.lat != 0 || loc.lng != 0)) {
        await PresenceTrackingService().pinOfficeZoneAtCheckIn(loc.lat, loc.lng);
      }
      await PresenceTrackingService().ensureTrackingIfPunchedIn(true);
    } else {
      await PresenceTrackingService().ensureTrackingIfPunchedIn(false);
    }
  }

  bool _sameCalendarDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  AttendanceRecord? get _latestAttendance =>
      _attendanceHistory.isEmpty ? null : _attendanceHistory.first;

  bool get _hasOpenAttendanceSession {
    final latest = _latestAttendance;
    return latest != null && latest.checkOutTime == null;
  }

  /// Latest record for today with both check-in and check-out (completed day).
  AttendanceRecord? get _todayCompletedAttendance {
    final now = DateTime.now();
    AttendanceRecord? pick;
    for (final r in _attendanceHistory) {
      if (!_sameCalendarDay(r.checkInTime, now)) continue;
      if (r.checkOutTime == null) continue;
      if (pick == null || r.checkInTime.isAfter(pick.checkInTime)) pick = r;
    }
    return pick;
  }

  String _formatAttendanceStatus(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return '—';
    return s
        .replaceAll('_', ' ')
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .map(
          (w) =>
              '${w[0].toUpperCase()}${w.length > 1 ? w.substring(1).toLowerCase() : ''}',
        )
        .join(' ');
  }

  Widget _buildAttendanceTimeRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          SizedBox(
            width: 78,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _ink.withValues(alpha: 0.45),
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: _ink,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTodayAttendanceCard(BuildContext context) {
    final latest = _latestAttendance;
    final open = _hasOpenAttendanceSession;
    final todayDone = _todayCompletedAttendance;

    final List<Widget> leftChildren = [
      Text(
        "Today's attendance",
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w800,
          color: _ink.withValues(alpha: 0.88),
          letterSpacing: -0.2,
        ),
      ),
    ];

    late final Widget rightTrailing;

    if (open && latest != null) {
      leftChildren.add(
        Text(
          'You are checked in',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.primary.withValues(alpha: 0.9),
          ),
        ),
      );
      if (!_sameCalendarDay(latest.checkInTime, DateTime.now())) {
        leftChildren.add(
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Started ${DateDisplayUtil.formatDateOnly(latest.checkInTime)}',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: _ink.withValues(alpha: 0.5),
              ),
            ),
          ),
        );
      }
      leftChildren.add(
        _buildAttendanceTimeRow(
          'Check-in',
          DateDisplayUtil.formatForDisplay(latest.checkInTime, 'hh:mm a'),
        ),
      );
      leftChildren.add(
        _buildAttendanceTimeRow('Check-out', '—'),
      );
      rightTrailing = ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 112, maxWidth: 132),
        child: FilledButton.icon(
          onPressed: () => _runAttendanceCamera(context, checkout: true),
          icon: const Icon(Icons.logout_rounded, size: 20),
          label: const Text('Check out'),
          style: FilledButton.styleFrom(
            backgroundColor: _ink,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            textStyle:
                const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
          ),
        ),
      );
    } else if (todayDone != null) {
      leftChildren.add(
        Text(
          'Day complete',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Colors.green.shade700,
          ),
        ),
      );
      leftChildren.add(
        _buildAttendanceTimeRow(
          'Check-in',
          DateDisplayUtil.formatForDisplay(todayDone.checkInTime, 'hh:mm a'),
        ),
      );
      leftChildren.add(
        _buildAttendanceTimeRow(
          'Check-out',
          DateDisplayUtil.formatForDisplay(todayDone.checkOutTime, 'hh:mm a'),
        ),
      );
      leftChildren.add(
        _buildAttendanceTimeRow(
          'Status',
          _formatAttendanceStatus(todayDone.status),
        ),
      );
      rightTrailing = SizedBox(
        width: 48,
        child: Align(
          alignment: Alignment.center,
          child: Icon(
            Icons.verified_rounded,
            color: Colors.green.shade600,
            size: 40,
          ),
        ),
      );
    } else {
      leftChildren.add(
        Text(
          'Not checked in yet',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: _ink.withValues(alpha: 0.5),
          ),
        ),
      );
      leftChildren.add(
        _buildAttendanceTimeRow('Check-in', '—'),
      );
      leftChildren.add(
        _buildAttendanceTimeRow('Check-out', '—'),
      );
      rightTrailing = ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 112, maxWidth: 132),
        child: FilledButton.icon(
          onPressed: () => _runAttendanceCamera(context, checkout: false),
          icon: const Icon(Icons.login_rounded, size: 20),
          label: const Text('Check in'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: _ink,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            textStyle:
                const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.primary.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: leftChildren,
            ),
          ),
          const SizedBox(width: 12),
          rightTrailing,
        ],
      ),
    );
  }

  void _navigateToIndex(BuildContext context, int index) {
    if (index == 1) return;
    final Widget target = switch (index) {
      0 => const AttendanceSummaryScreen(),
      2 => const VisitsScreen(),
      3 => const LeadListScreen(),
      4 => const ProfileScreen(),
      5 => const SettingsScreen(),
      _ => const DashboardScreen(),
    };
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => target),
    ).then((_) {
      if (mounted) _bootstrap();
    });
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

  void _openCreateCustomer(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AddCustomerScreen()),
    );
  }

  void _openCompanyCustomers(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(builder: (_) => const CompanyCustomersScreen()),
    ).then((_) {
      if (mounted) _bootstrap();
    });
  }

  Future<void> _runAttendanceCamera(
    BuildContext context, {
    required bool checkout,
  }) async {
    logAttendancePunch(
      '[AttendancePunchDebug] button_clicked action=${checkout ? 'checkout' : 'checkin'} source=dashboard_today_attendance_card',
    );
    final ok = await AttendanceCameraFlow.run(context, checkout: checkout);
    if (!mounted || !ok) return;
    setState(() => _loading = true);
    try {
      final att = AttendanceService();
      final synced = await Future.wait([
        att.syncPendingOps(),
        att.fetchHistory(),
      ]);
      if (!mounted) return;
      final attendance = synced[1] as List<AttendanceRecord>;
      setState(() {
        _attendanceHistory = attendance;
      });
      // Presence is also kicked off from [AttendanceCameraFlow]; do not block the UI here.
      scheduleMicrotask(() {
        unawaited(_syncPresenceTrackingFromAttendance(attendance));
      });
    } catch (_) {
      // Fallback: full refresh if fast attendance-only refresh fails.
      if (mounted) await _bootstrap();
      return;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openAddTask(BuildContext context) {
    if (_userId == null || _userId!.isEmpty) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AddTaskScreen(userId: _userId!)),
    ).then((_) => _bootstrap());
  }

  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onAddTask: _userId != null && _userId!.isNotEmpty
          ? () => _openAddTask(context)
          : null,
      onAddCustomer: () => _openCreateCustomer(context),
      onProfile: () => _navigateToIndex(context, 4),
      onSettings: () => _navigateToIndex(context, 5),
      onLogout: () => _logout(context),
    );
  }

  Widget _circleIconButton({
    required IconData icon,
    required VoidCallback onPressed,
    String? tooltip,
  }) {
    final child = Material(
      color: _card,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, size: 20, color: _ink),
        ),
      ),
    );
    if (tooltip != null && tooltip.isNotEmpty) {
      return Tooltip(message: tooltip, child: child);
    }
    return child;
  }

  Widget _yellowProgressCard(_TaskSummary s) {
    final all = s.all;
    final done = s.completed;
    final progress = all > 0 ? (done / all).clamp(0.0, 1.0) : 0.0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 22, 20, 22),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.38),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Live',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: -0.5,
                        ),
                      ),
                      TextSpan(
                        text: 'Track',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: _ink,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'smart Auto checkin/Out',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: _ink.withValues(alpha: 0.72),
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 96,
            height: 96,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Positioned.fill(
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: CircularProgressIndicator(
                      value: progress,
                      strokeWidth: 7,
                      backgroundColor: _ink.withValues(alpha: 0.2),
                      color: _ink,
                      strokeCap: StrokeCap.round,
                    ),
                  ),
                ),
                ClipOval(
                  child: SizedBox(
                    width: 58,
                    height: 58,
                    child: Image.asset(
                      'assets/logo.png',
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _shortcutChip({
    IconData? icon,
    Widget? iconWidget,
    required bool selected,
    required VoidCallback onTap,
    String? tooltip,
  }) {
    assert(icon != null || iconWidget != null);
    final iconColor = selected ? _ink : _ink.withValues(alpha: 0.55);
    final chip = Material(
      color: selected ? AppColors.primary.withValues(alpha: 0.35) : const Color(0xFFF4F4F4),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: iconWidget ??
              Icon(
                icon!,
                size: 22,
                color: iconColor,
              ),
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: tooltip != null && tooltip.isNotEmpty
          ? Tooltip(message: tooltip, child: chip)
          : chip,
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _circleIconButton(
          icon: Icons.menu_rounded,
          tooltip: 'Menu',
          onPressed: () => _openAppMenu(context),
        ),
        const SizedBox(width: 10),
        Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ProfileScreen()),
              ).then((_) => _bootstrap());
            },
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _ink,
                border: Border.all(color: AppColors.primary, width: 2.5),
              ),
              alignment: Alignment.center,
              child: Icon(
                Icons.person_rounded,
                size: 30,
                color: AppColors.primary,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back,',
                style: TextStyle(
                  color: _ink.withValues(alpha: 0.5),
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                _firstName,
                style: const TextStyle(
                  color: _ink,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
            ],
          ),
        ),
        _circleIconButton(
          icon: Icons.notifications_none_rounded,
          tooltip: 'Notifications',
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('No new notifications')),
            );
          },
        ),
        const SizedBox(width: 8),
        _circleIconButton(
          icon: Icons.person_outline_rounded,
          tooltip: 'Profile',
          onPressed: () => _navigateToIndex(context, 4),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final summary = _TaskSummary.fromTasks(_tasks);

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragEnd: (details) => handleMainShellSwipe(details, 1),
          child: _loading
            ? const Center(child: LocationLoader(size: 44))
            : RefreshIndicator(
                color: AppColors.primary,
                backgroundColor: Colors.white,
                onRefresh: _bootstrap,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildHeader(context),
                      const SizedBox(height: 22),
                      _yellowProgressCard(summary),
                      const SizedBox(height: 22),
                      _buildTodayAttendanceCard(context),
                      const SizedBox(height: 22),
                      Text(
                        'Quick shortcuts',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: _ink.withValues(alpha: 0.92),
                        ),
                      ),
                      const SizedBox(height: 12),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _shortcutChip(
                              icon: Icons.dashboard_rounded,
                              selected: true,
                              tooltip: 'Dashboard',
                              onTap: () => _bootstrap(),
                            ),
                            _shortcutChip(
                              icon: Icons.alarm_rounded,
                              selected: false,
                              tooltip: 'Attendance alarms',
                              onTap: () => showAttendanceAlarmSetupSheet(context),
                            ),
                            _shortcutChip(
                              iconWidget: TaskBrandIcon(
                                size: 22,
                                color: _ink.withValues(alpha: 0.55),
                              ),
                              selected: false,
                              tooltip: 'My tasks',
                              onTap: () => _navigateToIndex(context, 1),
                            ),
                            _shortcutChip(
                              icon: Icons.storefront_rounded,
                              selected: false,
                              tooltip: 'Visits',
                              onTap: () => _navigateToIndex(context, 2),
                            ),
                            _shortcutChip(
                              icon: Icons.groups_rounded,
                              selected: false,
                              tooltip: 'Customers',
                              onTap: () => _openCompanyCustomers(context),
                            ),
                            _shortcutChip(
                              icon: Icons.person_outline_rounded,
                              selected: false,
                              tooltip: 'Profile',
                              onTap: () => _navigateToIndex(context, 4),
                            ),
                            _shortcutChip(
                              icon: Icons.settings_outlined,
                              selected: false,
                              tooltip: 'Settings',
                              onTap: () => _navigateToIndex(context, 5),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 22),
                      InkWell(
                        borderRadius: BorderRadius.circular(18),
                        onTap: () => _navigateToIndex(context, 2),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 16,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: AppColors.primary.withValues(alpha: 0.35),
                            ),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.18),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.storefront_rounded,
                                  color: _ink,
                                ),
                              ),
                              const SizedBox(width: 12),
                              const Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Today Visits',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w800,
                                        color: _ink,
                                      ),
                                    ),
                                    SizedBox(height: 2),
                                    Text(
                                      'Tap to open your visits queue',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.black54,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(
                                Icons.chevron_right_rounded,
                                color: _ink,
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      OutlinedButton.icon(
                        onPressed: () => _openCreateCustomer(context),
                        icon: Icon(
                          Icons.person_add_alt_1_rounded,
                          color: AppColors.primary,
                        ),
                        label: Text(
                          'New customer',
                          style: TextStyle(
                            color: _ink,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: AppColors.primary.withValues(alpha: 0.7)),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
        ),
      ),
      bottomNavigationBar: OvalBottomNavBar(
        currentIndex: 1,
        onTap: (index) => _navigateToIndex(context, index),
      ),
    );
  }
}
