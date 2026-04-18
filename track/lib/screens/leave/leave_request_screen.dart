import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/attendance_record.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/geo/my_tasks_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/screens/visits/visits_screen.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/app_tab_loader.dart';

/// Leave list + apply flow. Header matches [MyTasksScreen] yellow hero; filters via calendar + filter icon.
class LeaveRequestScreen extends StatefulWidget {
  const LeaveRequestScreen({super.key});

  @override
  State<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends State<LeaveRequestScreen> {
  final AttendanceService _service = AttendanceService();
  static final _dateFmt = DateFormat('dd MMM yyyy');

  List<LeaveRequestRecord> _all = const [];
  bool _loading = true;
  String? _error;

  /// null = show all statuses; otherwise PENDING / APPROVED / REJECTED
  String? _statusKey;
  bool _showFilterSection = false;

  late DateTime _filterDay;

  static DateTime _dayOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static bool _sameCalendarDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  bool _leaveOverlapsFilterDay(LeaveRequestRecord l) {
    final day = _dayOnly(_filterDay);
    final from = _dayOnly(l.fromDate);
    final to = _dayOnly(l.toDate);
    return !day.isBefore(from) && !day.isAfter(to);
  }

  bool _matchesStatus(LeaveRequestRecord l) {
    if (_statusKey == null) return true;
    return l.status.toUpperCase() == _statusKey;
  }

  List<LeaveRequestRecord> get _visible {
    return _all
        .where(_leaveOverlapsFilterDay)
        .where(_matchesStatus)
        .toList();
  }

  @override
  void initState() {
    super.initState();
    _filterDay = _dayOnly(DateTime.now());
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.fetchLeaveStatus();
      if (!mounted) return;
      setState(() {
        _all = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onProfile: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        ).then((_) => _load());
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ).then((_) => _load());
      },
      onLogout: _logout,
    );
  }

  void _navigateToIndex(int index) {
    if (index < 0 || index > 2) return;
    final Widget target = switch (index) {
      0 => const DashboardScreen(),
      1 => const MyTasksScreen(),
      2 => const VisitsScreen(),
      _ => const DashboardScreen(),
    };
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => target),
    );
  }

  Future<void> _logout() async {
    await AuthService().logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  void _showSuccessTop(String message) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    final h = MediaQuery.sizeOf(context).height;
    messenger.showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.only(left: 16, right: 16, bottom: h - 96),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        backgroundColor: const Color(0xFF2E7D32),
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: Colors.white, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'APPROVED':
        return const Color(0xFF2E7D32);
      case 'REJECTED':
        return const Color(0xFFC62828);
      case 'PENDING':
      default:
        return const Color(0xFF1565C0);
    }
  }

  Widget _buildHeroHeader() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => _openAppMenu(context),
                icon: Icon(
                  Icons.menu_rounded,
                  color: Colors.black.withValues(alpha: 0.85),
                ),
                tooltip: 'Menu',
              ),
              const Expanded(
                child: Text(
                  'YOUR LEAVES',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.black,
                    fontSize: 29,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
              const SizedBox(width: 48),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              TextButton.icon(
                onPressed: () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _filterDay,
                    firstDate: now.subtract(const Duration(days: 730)),
                    lastDate: now.add(const Duration(days: 730)),
                  );
                  if (picked != null && mounted) {
                    setState(() => _filterDay = _dayOnly(picked));
                  }
                },
                icon: Icon(
                  Icons.calendar_month_rounded,
                  color: Colors.black.withValues(alpha: 0.82),
                  size: 20,
                ),
                label: Text(
                  _sameCalendarDay(_filterDay, DateTime.now())
                      ? 'Today'
                      : _dateFmt.format(_filterDay),
                  style: const TextStyle(
                    color: Colors.black,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              IconButton(
                onPressed: _openApplySheet,
                icon: Icon(
                  Icons.add_circle_outline,
                  color: Colors.black.withValues(alpha: 0.82),
                ),
                tooltip: 'Apply leave',
              ),
              IconButton(
                onPressed: () =>
                    setState(() => _showFilterSection = !_showFilterSection),
                icon: Icon(
                  _showFilterSection
                      ? Icons.filter_alt
                      : Icons.filter_alt_outlined,
                  color: Colors.black.withValues(alpha: 0.82),
                ),
                tooltip: 'Filter by status',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatusFilterStrip() {
    return Material(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Filter by status',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 12,
                color: Colors.black.withValues(alpha: 0.45),
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _statusChip(key: null, label: 'All'),
                _statusChip(key: 'PENDING', label: 'Pending'),
                _statusChip(key: 'APPROVED', label: 'Approved'),
                _statusChip(key: 'REJECTED', label: 'Rejected'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusChip({required String? key, required String label}) {
    final selected = _statusKey == key;
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (bool sel) {
        setState(() {
          if (key == null) {
            _statusKey = null;
          } else if (sel) {
            _statusKey = key;
          } else {
            _statusKey = null;
          }
        });
      },
      selectedColor: AppColors.primary.withValues(alpha: 0.35),
      checkmarkColor: Colors.black,
      labelStyle: TextStyle(
        fontWeight: FontWeight.w700,
        color: selected ? Colors.black : Colors.black54,
      ),
      side: BorderSide(
        color: selected
            ? AppColors.primary
            : Colors.black.withValues(alpha: 0.12),
      ),
    );
  }

  Future<void> _openApplySheet() async {
    String leaveType = 'CASUAL';
    DateTimeRange range = DateTimeRange(
      start: _dayOnly(DateTime.now()),
      end: _dayOnly(DateTime.now()),
    );
    final reasonCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            child: Material(
              color: Colors.white,
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                  child: StatefulBuilder(
                    builder: (ctx, setLocal) {
                      return Form(
                        key: formKey,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Center(
                              child: Container(
                                width: 40,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: Colors.black12,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Apply for leave',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Pick a date range (one or more days) and a reason.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.black.withValues(alpha: 0.55),
                              ),
                            ),
                            const SizedBox(height: 18),
                            Text(
                              'Leave type',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: Colors.black.withValues(alpha: 0.65),
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                ChoiceChip(
                                  label: const Text('Casual'),
                                  selected: leaveType == 'CASUAL',
                                  onSelected: (_) =>
                                      setLocal(() => leaveType = 'CASUAL'),
                                  selectedColor:
                                      AppColors.primary.withValues(alpha: 0.45),
                                  labelStyle: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: leaveType == 'CASUAL'
                                        ? Colors.black
                                        : Colors.black54,
                                  ),
                                ),
                                ChoiceChip(
                                  label: const Text('Sick'),
                                  selected: leaveType == 'SICK',
                                  onSelected: (_) =>
                                      setLocal(() => leaveType = 'SICK'),
                                  selectedColor:
                                      AppColors.primary.withValues(alpha: 0.45),
                                  labelStyle: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: leaveType == 'SICK'
                                        ? Colors.black
                                        : Colors.black54,
                                  ),
                                ),
                                ChoiceChip(
                                  label: const Text('Paid'),
                                  selected: leaveType == 'PAID',
                                  onSelected: (_) =>
                                      setLocal(() => leaveType = 'PAID'),
                                  selectedColor:
                                      AppColors.primary.withValues(alpha: 0.45),
                                  labelStyle: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: leaveType == 'PAID'
                                        ? Colors.black
                                        : Colors.black54,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            OutlinedButton.icon(
                              onPressed: () async {
                                final picked = await showDateRangePicker(
                                  context: ctx,
                                  firstDate: DateTime.now()
                                      .subtract(const Duration(days: 365)),
                                  lastDate:
                                      DateTime.now().add(const Duration(days: 365)),
                                  initialDateRange: range,
                                  builder: (c, child) => Theme(
                                    data: Theme.of(c).copyWith(
                                      colorScheme: ColorScheme.light(
                                        primary: AppColors.primary,
                                        onPrimary: Colors.black,
                                      ),
                                    ),
                                    child: child!,
                                  ),
                                );
                                if (picked != null) {
                                  setLocal(() => range = picked);
                                }
                              },
                              icon: const Icon(Icons.date_range_rounded),
                              label: Text(
                                '${_dateFmt.format(range.start)} → ${_dateFmt.format(range.end)}',
                                style: const TextStyle(fontWeight: FontWeight.w600),
                              ),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                  horizontal: 12,
                                ),
                                side: BorderSide(
                                  color: AppColors.primary.withValues(alpha: 0.6),
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: reasonCtrl,
                              maxLines: 4,
                              decoration: InputDecoration(
                                labelText: 'Reason',
                                alignLabelWithHint: true,
                                filled: true,
                                fillColor: Colors.grey.shade50,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              validator: (v) {
                                if (v == null || v.trim().isEmpty) {
                                  return 'Reason is required';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 20),
                            FilledButton(
                              onPressed: () {
                                if (formKey.currentState?.validate() != true) {
                                  return;
                                }
                                Navigator.pop(ctx, true);
                              },
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.black,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                textStyle: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                              child: const Text('Submit leave'),
                            ),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, false),
                              child: const Text('Cancel'),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );

    // Read text before scheduling dispose. Do not dispose synchronously here — the
    // sheet route can still be animating/unmounting and TextFormField may touch the
    // controller on the same frame (used after disposed).
    final reasonText = submitted == true ? reasonCtrl.text.trim() : '';
    WidgetsBinding.instance.addPostFrameCallback((_) {
      reasonCtrl.dispose();
    });

    if (submitted != true) {
      return;
    }

    try {
      await _service.applyLeave(
        leaveType: leaveType,
        fromDate: range.start,
        toDate: range.end,
        reason: reasonText,
      );
      if (!mounted) return;
      _showSuccessTop('Leave applied successfully');
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not apply leave: $e')),
      );
    }
  }

  Widget _buildListContent(ColorScheme colorScheme) {
    if (_loading) {
      return const AppTabLoadingBody();
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Row(
            children: [
              Container(
                width: 4,
                height: 18,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'YOUR REQUESTS',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 13,
                  letterSpacing: 1.1,
                ),
              ),
              const Spacer(),
              Text(
                '${_visible.length}',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: colorScheme.onSurface.withValues(alpha: 0.45),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (_visible.isEmpty)
            Card(
              elevation: 0,
              color: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: Colors.black.withValues(alpha: 0.06)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
                child: Column(
                  children: [
                    Icon(
                      Icons.event_busy_rounded,
                      size: 48,
                      color: Colors.black.withValues(alpha: 0.25),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'No leave requests for this day and filters.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.black.withValues(alpha: 0.55),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            ..._visible.map(_leaveCard),
        ],
      ),
    );
  }

  Widget _leaveCard(LeaveRequestRecord l) {
    final stColor = _statusColor(l.status);
    final sameDay = _dayOnly(l.fromDate) == _dayOnly(l.toDate);
    final rangeText = sameDay
        ? _dateFmt.format(l.fromDate)
        : '${_dateFmt.format(l.fromDate)} → ${_dateFmt.format(l.toDate)}';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    l.leaveType,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: stColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    l.status,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 11,
                      color: stColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.event_rounded, size: 18, color: Colors.black.withValues(alpha: 0.45)),
                const SizedBox(width: 6),
                Text(
                  rangeText,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            if (l.reason.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                l.reason,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  color: Colors.black.withValues(alpha: 0.65),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeroHeader(),
            if (_showFilterSection) _buildStatusFilterStrip(),
            Expanded(child: _buildListContent(colorScheme)),
          ],
        ),
      ),
      bottomNavigationBar: OvalBottomNavBar(
        currentIndex: 0,
        onTap: _navigateToIndex,
      ),
    );
  }
}
