import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/intl.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/company_visit.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/geo/add_customer_screen.dart';
import 'package:track/screens/geo/add_task_screen.dart';
import 'package:track/screens/geo/my_tasks_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/services/company_visit_service.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/app_tab_loader.dart';

/// Lists company visits for a selected day (Tasks-style header + week strip).
class VisitsScreen extends StatefulWidget {
  const VisitsScreen({super.key});

  @override
  State<VisitsScreen> createState() => _VisitsScreenState();
}

class _VisitsScreenState extends State<VisitsScreen> {
  final CompanyVisitService _service = CompanyVisitService();

  static const int _weekStripPastDays = 20;
  static const int _weekStripDayCount = 41;
  static const double _weekDayCellWidth = 52;
  final ScrollController _weekStripScrollController = ScrollController();

  static final _dayFmt = DateFormat('dd MMM');

  late DateTime _selectedDay;
  bool _showFilterSection = false;
  /// null = all; `open` / `completed`
  String? _statusQuery;

  List<CompanyVisitRecord> _visits = const [];
  bool _loading = true;
  String? _error;
  String? _loggedInUserId;

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static bool _sameCalendarDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  void initState() {
    super.initState();
    _selectedDay = _dateOnly(DateTime.now());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduleScrollWeekStripToDate(_selectedDay);
      _loadUserIdThenVisits();
    });
  }

  Future<void> _loadUserIdThenVisits() async {
    await _loadLoggedInUserId();
    if (mounted) await _fetchVisits();
  }

  Future<void> _loadLoggedInUserId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user');
      if (raw == null || raw.isEmpty) return;
      final map = jsonDecode(raw);
      if (map is! Map) return;
      final id = map['_id'] ?? map['id'] ?? map['userId'];
      if (id != null && mounted) {
        setState(() => _loggedInUserId = id is String ? id : id.toString());
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _weekStripScrollController.dispose();
    super.dispose();
  }

  DateTime _weekStripRangeStart() =>
      _dateOnly(DateTime.now()).subtract(const Duration(days: _weekStripPastDays));

  int? _indexInWeekStrip(DateTime day) {
    final start = _weekStripRangeStart();
    final idx = _dateOnly(day).difference(start).inDays;
    if (idx < 0 || idx >= _weekStripDayCount) return null;
    return idx;
  }

  void _scheduleScrollWeekStripToDate(DateTime day) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _scrollWeekStripDateToCenter(day);
    });
  }

  void _scrollWeekStripDateToCenter(DateTime day) {
    if (!_weekStripScrollController.hasClients) return;
    final idx = _indexInWeekStrip(day);
    if (idx == null) return;
    final viewport = _weekStripScrollController.position.viewportDimension;
    final maxExtent = _weekStripScrollController.position.maxScrollExtent;
    final cellCenter = idx * _weekDayCellWidth + _weekDayCellWidth / 2;
    final offset = (cellCenter - viewport / 2).clamp(0.0, maxExtent);
    _weekStripScrollController.jumpTo(offset);
  }

  Future<void> _fetchVisits() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _service.fetchMyVisits(
        date: _selectedDay,
        status: _statusQuery,
      );
      if (!mounted) return;
      setState(() {
        _visits = list;
        _loading = false;
      });
      _scheduleScrollWeekStripToDate(_selectedDay);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _navigateToIndex(int index) {
    if (index == 2) return;
    final Widget target = switch (index) {
      0 => const DashboardScreen(),
      1 => const MyTasksScreen(),
      _ => const VisitsScreen(),
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

  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onAddTask: _loggedInUserId != null && _loggedInUserId!.isNotEmpty
          ? () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => AddTaskScreen(userId: _loggedInUserId!),
                ),
              ).then((_) => _fetchVisits());
            }
          : null,
      onAddCustomer: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddCustomerScreen()),
        ).then((_) => _fetchVisits());
      },
      onProfile: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        ).then((_) => _fetchVisits());
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ).then((_) => _fetchVisits());
      },
      onLogout: _logout,
    );
  }

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'completed':
        return const Color(0xFF2E7D32);
      case 'open':
      default:
        return const Color(0xFF1565C0);
    }
  }

  String _visitSiteAddressText(CompanyVisitRecord v) {
    final a = v.siteAddress?.trim();
    if (a != null && a.isNotEmpty) return a;
    final company = v.companyName.trim();
    final name = v.customerName.trim();
    if (company.isNotEmpty && name.isNotEmpty && company != name) {
      return '$company\n$name';
    }
    if (company.isNotEmpty) return company;
    if (name.isNotEmpty) return name;
    return 'Site address on file';
  }

  String _sourceDisplayLabel(CompanyVisitRecord v) {
    final s = (v.source ?? '').trim().toLowerCase();
    if (s.isEmpty) return '';
    if (s == 'smart_visit_sync') return 'Auto check-in';
    return v.source!.trim();
  }

  void _openVisitDetail(CompanyVisitRecord v) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        final checkout = v.checkOutTime;
        final dur = v.durationMinutes;
        String durationLine;
        if (dur != null) {
          durationLine = '$dur min';
        } else if (checkout != null) {
          final m = checkout.difference(v.checkInTime).inMinutes;
          durationLine = '$m min';
        } else {
          durationLine = 'In progress';
        }
        final visitDayLocal = DateDisplayUtil.formatVisitsDayOnly(v.checkInTime);
        final sourceLabel = _sourceDisplayLabel(v);
        final addressText = _visitSiteAddressText(v);

        return DraggableScrollableSheet(
          initialChildSize: 0.55,
          minChildSize: 0.35,
          maxChildSize: 0.92,
          builder: (_, scroll) {
            return ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              child: Material(
                color: Colors.white,
                child: ListView(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
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
                    Text(
                      v.companyName.isNotEmpty ? v.companyName : 'Visit',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: AppColors.primary,
                      ),
                    ),
                    if (v.customerName.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        v.customerName,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    _detailIconRow(
                      icon: Icons.flag_rounded,
                      label: 'Status',
                      value: v.status.toUpperCase(),
                      valueColor: _statusColor(v.status),
                    ),
                    _checkInOutTimesRow(v, checkout),
                    _detailIconRow(
                      icon: Icons.schedule_rounded,
                      label: 'Duration',
                      value: durationLine,
                    ),
                    _detailIconRow(
                      icon: Icons.place_rounded,
                      label: 'Check-in location',
                      value: addressText,
                    ),
                    _detailIconRow(
                      icon: Icons.edit_location_alt_outlined,
                      label: 'Check-out location',
                      value: addressText,
                    ),
                    if (sourceLabel.isNotEmpty)
                      _detailIconRow(
                        icon: Icons.smartphone_rounded,
                        label: 'Recorded as',
                        value: sourceLabel,
                      ),
                    _detailIconRow(
                      icon: Icons.calendar_today_rounded,
                      label: 'Visit day',
                      value: visitDayLocal,
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _checkInOutTimesRow(CompanyVisitRecord v, DateTime? checkout) {
    final labelColor = AppColors.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: _timeCell(
              icon: Icons.login_rounded,
              label: 'Check-in',
              timeText: DateDisplayUtil.formatVisitsDateTime(v.checkInTime),
              labelColor: labelColor,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _timeCell(
              icon: Icons.logout_rounded,
              label: 'Check-out',
              timeText: checkout != null
                  ? DateDisplayUtil.formatVisitsDateTime(checkout)
                  : '—',
              labelColor: labelColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _timeCell({
    required IconData icon,
    required String label,
    required String timeText,
    required Color labelColor,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 22, color: labelColor),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: labelColor,
                  letterSpacing: 0.35,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                timeText,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: Colors.black87,
                  height: 1.25,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _detailIconRow({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    final heading = AppColors.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: heading),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: heading,
                    letterSpacing: 0.35,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: valueColor ?? Colors.black87,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroAndWeekStrip() {
    final start = _weekStripRangeStart();
    final days = List.generate(
      _weekStripDayCount,
      (i) => start.add(Duration(days: i)),
    );
    final sel = _dateOnly(_selectedDay);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
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
                      'YOUR VISITS',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.black,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.35,
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
                        initialDate: _selectedDay,
                        firstDate: now.subtract(const Duration(days: 365)),
                        lastDate: now.add(const Duration(days: 365)),
                      );
                      if (picked != null && mounted) {
                        final d = _dateOnly(picked);
                        setState(() => _selectedDay = d);
                        _scheduleScrollWeekStripToDate(d);
                        await _fetchVisits();
                      }
                    },
                    icon: Icon(
                      Icons.calendar_month_rounded,
                      color: Colors.black.withValues(alpha: 0.82),
                      size: 20,
                    ),
                    label: Text(
                      _sameCalendarDay(_selectedDay, DateTime.now())
                          ? 'Today'
                          : _dayFmt.format(_selectedDay),
                      style: const TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _fetchVisits,
                    icon: Icon(
                      Icons.refresh_rounded,
                      color: Colors.black.withValues(alpha: 0.82),
                    ),
                    tooltip: 'Refresh',
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
                    tooltip: 'Filters',
                  ),
                ],
              ),
            ],
          ),
        ),
        Transform.translate(
          offset: const Offset(0, -30),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Material(
              elevation: 10,
              shadowColor: Colors.black45,
              borderRadius: BorderRadius.circular(18),
              color: Colors.white,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                child: SingleChildScrollView(
                  controller: _weekStripScrollController,
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final day in days)
                        SizedBox(
                          width: _weekDayCellWidth,
                          child: _weekDayCell(
                            day,
                            sel,
                            onSelect: () async {
                              final d = _dateOnly(day);
                              setState(() => _selectedDay = d);
                              _scheduleScrollWeekStripToDate(d);
                              await _fetchVisits();
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 2),
      ],
    );
  }

  Widget _weekDayCell(
    DateTime day,
    DateTime sel, {
    required VoidCallback onSelect,
  }) {
    final dOnly = _dateOnly(day);
    final isSel = dOnly == sel;
    final label = DateFormat('EEE').format(day).substring(0, 2).toUpperCase();
    return InkWell(
      onTap: onSelect,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: isSel ? AppColors.primary : Colors.black45,
              ),
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: isSel ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: isSel ? Colors.black : Colors.black87,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusStrip() {
    return Material(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Filter by status',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 12,
                color: Colors.black.withValues(alpha: 0.45),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilterChip(
                  label: const Text('All'),
                  selected: _statusQuery == null,
                  onSelected: (_) {
                    setState(() => _statusQuery = null);
                    _fetchVisits();
                  },
                  selectedColor: AppColors.primary.withValues(alpha: 0.35),
                  checkmarkColor: Colors.black,
                  labelStyle: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: _statusQuery == null ? Colors.black : Colors.black54,
                  ),
                  side: BorderSide(
                    color: _statusQuery == null
                        ? AppColors.primary
                        : Colors.black.withValues(alpha: 0.12),
                  ),
                ),
                FilterChip(
                  label: const Text('Open'),
                  selected: _statusQuery == 'open',
                  onSelected: (sel) {
                    setState(() => _statusQuery = sel ? 'open' : null);
                    _fetchVisits();
                  },
                  selectedColor: AppColors.primary.withValues(alpha: 0.35),
                  checkmarkColor: Colors.black,
                  labelStyle: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: _statusQuery == 'open' ? Colors.black : Colors.black54,
                  ),
                  side: BorderSide(
                    color: _statusQuery == 'open'
                        ? AppColors.primary
                        : Colors.black.withValues(alpha: 0.12),
                  ),
                ),
                FilterChip(
                  label: const Text('Completed'),
                  selected: _statusQuery == 'completed',
                  onSelected: (sel) {
                    setState(() => _statusQuery = sel ? 'completed' : null);
                    _fetchVisits();
                  },
                  selectedColor: AppColors.primary.withValues(alpha: 0.35),
                  checkmarkColor: Colors.black,
                  labelStyle: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: _statusQuery == 'completed' ? Colors.black : Colors.black54,
                  ),
                  side: BorderSide(
                    color: _statusQuery == 'completed'
                        ? AppColors.primary
                        : Colors.black.withValues(alpha: 0.12),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _visitCard(CompanyVisitRecord v) {
    final st = v.status;
    final stColor = _statusColor(st);
    final subtitle = v.customerName.isNotEmpty ? v.customerName : v.companyName;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.black.withValues(alpha: 0.08)),
      ),
      child: InkWell(
        onTap: () => _openVisitDetail(v),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.storefront_rounded, color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      v.companyName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.black.withValues(alpha: 0.55),
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      DateDisplayUtil.formatVisitsDateTime(v.checkInTime),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.black.withValues(alpha: 0.45),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: stColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  st.toUpperCase(),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: stColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeroAndWeekStrip(),
              if (_showFilterSection) _buildStatusStrip(),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
                child: Row(
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
                    Text(
                      'YOUR QUEUE',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                        letterSpacing: 1.1,
                        color: colorScheme.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(_error!, textAlign: TextAlign.center),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: _fetchVisits,
                                child: const Text('Retry'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _loading
                    ? const Center(
                        child: AppTabLoader(icon: Icons.storefront_rounded),
                      )
                    : RefreshIndicator(
                        onRefresh: _fetchVisits,
                        color: AppColors.primary,
                        child: _visits.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.all(24),
                                children: [
                                  SizedBox(
                                    height: MediaQuery.sizeOf(context).height * 0.25,
                                  ),
                                  Icon(
                                    Icons.filter_list_off,
                                    size: 64,
                                    color: colorScheme.onSurfaceVariant,
                                  ),
                                  const SizedBox(height: 8),
                                  Center(
                                    child: Text(
                                      'No visits match filters',
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                                itemCount: _visits.length,
                                itemBuilder: (_, i) => _visitCard(_visits[i]),
                              ),
                      ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: OvalBottomNavBar(
          currentIndex: 2,
          onTap: _navigateToIndex,
        ),
      ),
    );
  }
}
