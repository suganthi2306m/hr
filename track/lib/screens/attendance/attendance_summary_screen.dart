import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/attendance_record.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/attendance/attendance_day_detail_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/attendance_alarm_punch_state.dart';
import 'package:track/services/attendance_alarm_scheduler.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/utils/weekly_off_policy.dart';
import 'package:track/widgets/app_feedback.dart';
import 'package:track/navigation/main_shell_navigation.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/attendance_alarm_sheet.dart';

/// Month-scrolling attendance calendar with stats and per-day rows (fast list + optional cache).
class AttendanceSummaryScreen extends StatefulWidget {
  const AttendanceSummaryScreen({super.key});

  @override
  State<AttendanceSummaryScreen> createState() => _AttendanceSummaryScreenState();
}

class _AttendanceSummaryScreenState extends State<AttendanceSummaryScreen>
    with MainShellSwipeNavigation {
  final AttendanceService _service = AttendanceService();

  /// Calendar month (day 1, local).
  late DateTime _monthFirst;

  bool _loading = true;
  List<AttendanceRecord> _records = const [];
  List<LeaveRequestRecord> _leavesAll = const [];
  String? _shiftTimingLine;
  WeeklyOffPolicy _weeklyOff = WeeklyOffPolicy.fallbackSatSun();
  Map<String, String> _holidaysByYmd = const {};

  /// Month key `yyyy-MM` → records (avoids refetch when switching months back and forth).
  final Map<String, List<AttendanceRecord>> _recordCache = {};

  Map<DateTime, AttendanceRecord> _byDay = {};

  static DateTime _d0(DateTime d) => DateDisplayUtil.dateOnlyLocal(d);
  static String _ymd(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _monthFirst = DateTime(n.year, n.month, 1);
    _loadShiftMeta();
    _loadMonth();
  }

  Future<void> _loadShiftMeta() async {
    final meta = await _service.fetchShiftMeta(month: _monthFirst);
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user');
      if (raw == null || raw.isEmpty) {
        if (meta != null && mounted) {
          setState(() {
            final start = meta['startTime']?.toString();
            final end = meta['endTime']?.toString();
            _shiftTimingLine =
                (start != null && start.isNotEmpty && end != null && end.isNotEmpty)
                    ? '$start - $end'
                    : null;
            _weeklyOff = WeeklyOffPolicy.fromShiftMeta(meta);
            final holidaysRaw = (meta['holidays'] as List?) ?? const [];
            final holidays = <String, String>{};
            for (final h in holidaysRaw) {
              if (h is! Map) continue;
              final key = h['ymd']?.toString() ?? '';
              if (key.isEmpty) continue;
              holidays[key] = h['name']?.toString() ?? 'Holiday';
            }
            _holidaysByYmd = holidays;
          });
        }
        return;
      }
      final map = jsonDecode(raw);
      if (map is! Map) return;
      final user = Map<String, dynamic>.from(map);
      final dynamic shiftRaw = user['shift'];
      final shift = shiftRaw is Map<String, dynamic>
          ? shiftRaw
          : (shiftRaw is Map ? Map<String, dynamic>.from(shiftRaw) : const <String, dynamic>{});
      final start = (shift['startTime'] ?? shift['start'] ?? user['shiftStartTime'])?.toString();
      final end = (shift['endTime'] ?? shift['end'] ?? user['shiftEndTime'])?.toString();
      if (!mounted) return;
      setState(() {
        final serverStart = meta?['startTime']?.toString();
        final serverEnd = meta?['endTime']?.toString();
        if (serverStart != null &&
            serverStart.isNotEmpty &&
            serverEnd != null &&
            serverEnd.isNotEmpty) {
          _shiftTimingLine = '$serverStart - $serverEnd';
        } else if (start != null && start.isNotEmpty && end != null && end.isNotEmpty) {
          _shiftTimingLine = '$start - $end';
        } else {
          _shiftTimingLine = null;
        }
        _weeklyOff = WeeklyOffPolicy.fromShiftMeta(meta);
        final holidaysRaw = (meta?['holidays'] as List?) ?? const [];
        final holidays = <String, String>{};
        for (final h in holidaysRaw) {
          if (h is! Map) continue;
          final key = h['ymd']?.toString() ?? '';
          if (key.isEmpty) continue;
          holidays[key] = h['name']?.toString() ?? 'Holiday';
        }
        _holidaysByYmd = holidays;
      });
    } catch (_) {}
  }

  void _reindexByDay() {
    final map = <DateTime, AttendanceRecord>{};
    for (final r in _records) {
      final d = _d0(r.attendanceDate ?? r.checkInTime);
      final existing = map[d];
      if (existing == null || r.checkInTime.isAfter(existing.checkInTime)) {
        map[d] = r;
      }
    }
    _byDay = map;
  }

  LeaveRequestRecord? _approvedLeaveForDay(DateTime day) {
    final d = _d0(day);
    for (final l in _leavesAll) {
      if (l.status.toUpperCase() != 'APPROVED') continue;
      final from = _d0(l.fromDate);
      final to = _d0(l.toDate);
      if (!d.isBefore(from) && !d.isAfter(to)) return l;
    }
    return null;
  }

  AttendanceRecord? _recordFor(DateTime day) => _byDay[_d0(day)];

  Future<void> _loadMonth() async {
    final key =
        '${_monthFirst.year}-${_monthFirst.month.toString().padLeft(2, '0')}';
    setState(() {
      _loading = true;
    });
    try {
      if (_leavesAll.isEmpty) {
        _leavesAll = await _service.fetchLeaveStatus();
      }
      if (_recordCache.containsKey(key)) {
        _records = _recordCache[key]!;
      } else {
        final start = DateTime(_monthFirst.year, _monthFirst.month, 1);
        final end = DateTime(
          _monthFirst.year,
          _monthFirst.month + 1,
          0,
          23,
          59,
          59,
          999,
        );
        final fetched =
            await _service.fetchHistory(from: start, to: end);
        _recordCache[key] = fetched;
        _records = fetched;
      }
      _reindexByDay();
      await AttendanceAlarmPunchState.syncFromHistory(_records);
      if (mounted) {
        setState(() => _loading = false);
      }
      unawaited(AttendanceAlarmScheduler.rescheduleFromServer());
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        AppFeedback.error(context, e);
      }
    }
  }

  DateTime get _currentCap => DateTime(DateTime.now().year, DateTime.now().month, 1);

  bool get _canGoNext {
    final next = DateTime(_monthFirst.year, _monthFirst.month + 1, 1);
    return !next.isAfter(_currentCap);
  }

  bool get _canGoPrev => true;

  void _goMonth(int delta) {
    final t = DateTime(_monthFirst.year, _monthFirst.month + delta, 1);
    if (delta > 0 && t.isAfter(_currentCap)) return;
    setState(() => _monthFirst = t);
    _loadShiftMeta();
    _loadMonth();
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
      onProfile: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        ).then((_) => _loadMonth());
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ).then((_) => _loadMonth());
      },
      onLogout: _logout,
    );
  }

  int get _daysInMonth =>
      DateTime(_monthFirst.year, _monthFirst.month + 1, 0).day;

  /// Newest day first for scrolling (matches common attendance apps).
  List<DateTime> get _daysDescending {
    final out = <DateTime>[];
    for (var d = _daysInMonth; d >= 1; d--) {
      out.add(DateTime(_monthFirst.year, _monthFirst.month, d));
    }
    return out;
  }

  String _hoursLine(AttendanceRecord? r) {
    if (r == null) return '0:00 Hrs';
    final m = r.durationMinutes;
    final h = m ~/ 60;
    final mm = m % 60;
    return '$h:${mm.toString().padLeft(2, '0')} Hrs';
  }

  String _timingLine(AttendanceRecord? r) {
    if (r == null) return '0:00 Hrs';
    final checkIn = DateFormat('hh:mm a').format(r.checkInTime);
    final checkOut = r.checkOutTime != null
        ? DateFormat('hh:mm a').format(r.checkOutTime!)
        : '--';
    return '$checkIn - $checkOut';
  }

  bool _hasRealAttendance(AttendanceRecord? r) {
    if (r == null) return false;
    final st = r.status.toUpperCase();
    if (st == 'PRESENT' || st == 'HALF_DAY' || st == 'PENDING') return true;
    final ds = (r.dayStatus ?? '').toUpperCase();
    if (ds == 'PRESENT' || ds == 'HALF_DAY' || ds == 'PENDING') return true;
    if (r.durationMinutes > 0) return true;
    if ((r.minutesWorked ?? 0) > 0) return true;
    return false;
  }

  String _rowStatus(DateTime day, AttendanceRecord? r, LeaveRequestRecord? leave) {
    final today = _d0(DateTime.now());
    final d = _d0(day);
    final holiday = _holidaysByYmd[_ymd(d)];
    if (holiday != null && holiday.isNotEmpty) return 'Holiday';
    if (leave != null) return 'Leave';

    if (d.isAfter(today)) {
      if (_weeklyOff.isWeeklyOff(d) && !_hasRealAttendance(r)) return 'Week Off';
      return 'Upcoming';
    }

    final dayStatus = (r?.dayStatus ?? r?.status ?? '').toUpperCase();
    if (dayStatus == 'HOLIDAY') {
      if (_weeklyOff.isWeeklyOff(d) && !_hasRealAttendance(r)) return 'Week Off';
      return 'Holiday';
    }
    if (dayStatus == 'LEAVE') return 'Leave';

    if (_weeklyOff.isWeeklyOff(d) && !_hasRealAttendance(r)) {
      return 'Week Off';
    }

    if (r == null) {
      if (d == today) return 'Not marked';
      return 'Absent';
    }
    switch (r.status.toUpperCase()) {
      case 'PRESENT':
        return 'Present';
      case 'ABSENT':
        return 'Absent';
      case 'HALF_DAY':
        return 'Half day';
      case 'PENDING':
        return r.checkOutTime == null ? 'Checked in' : 'Pending';
      default:
        return r.status;
    }
  }

  ({int present, int absent, int half, int weekOff}) _monthStats() {
    var present = 0;
    var absent = 0;
    var half = 0;
    var weekOffDays = 0;
    final today = _d0(DateTime.now());
    for (var i = 1; i <= _daysInMonth; i++) {
      final day = DateTime(_monthFirst.year, _monthFirst.month, i);
      final d = _d0(day);
      if (d.isAfter(today)) continue;
      final leave = _approvedLeaveForDay(day);
      final r = _recordFor(day);
      if (_holidaysByYmd.containsKey(_ymd(d)) ||
          (r?.dayStatus ?? '').toUpperCase() == 'HOLIDAY') {
        continue;
      }
      if (leave != null) continue;
      if (_weeklyOff.isWeeklyOff(day) && !_hasRealAttendance(r)) {
        weekOffDays++;
        continue;
      }
      if (r == null) {
        absent++;
        continue;
      }
      switch (r.status.toUpperCase()) {
        case 'PRESENT':
          present++;
          break;
        case 'HALF_DAY':
          half++;
          break;
        case 'ABSENT':
          absent++;
          break;
        default:
          // Only `PRESENT` counts toward Present; PENDING / other do not.
          break;
      }
    }
    return (present: present, absent: absent, half: half, weekOff: weekOffDays);
  }

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF1A1A1A);
    const pageBg = Color(0xFFF3F4F6);
    final monthTitle = DateFormat('MMM, yyyy').format(_monthFirst);
    final stats = _monthStats();

    return Scaffold(
      backgroundColor: pageBg,
      body: SafeArea(
        bottom: false,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragEnd: (details) => handleMainShellSwipe(details, 0),
          child: Column(
            children: [
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.vertical(bottom: Radius.circular(20)),
                ),
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 14),
                child: Row(
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
                        'YOUR ATTENDANCE',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.black,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.35,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Attendance alarms',
                      onPressed: () => showAttendanceAlarmSetupSheet(context),
                      icon: Icon(
                        Icons.alarm_rounded,
                        color: Colors.black.withValues(alpha: 0.82),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Refresh',
                      onPressed: () {
                        final key =
                            '${_monthFirst.year}-${_monthFirst.month.toString().padLeft(2, '0')}';
                        _recordCache.remove(key);
                        _loadMonth();
                      },
                      icon: Icon(
                        Icons.refresh_rounded,
                        color: Colors.black.withValues(alpha: 0.82),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : RefreshIndicator(
                        color: AppColors.primary,
                        onRefresh: () async {
                          final key =
                              '${_monthFirst.year}-${_monthFirst.month.toString().padLeft(2, '0')}';
                          _recordCache.remove(key);
                          await _loadMonth();
                        },
                        child: CustomScrollView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          slivers: [
                            SliverToBoxAdapter(
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                                child: Row(
                                  children: [
                                    IconButton(
                                      onPressed: _canGoPrev ? () => _goMonth(-1) : null,
                                      icon: const Icon(Icons.chevron_left_rounded),
                                      color: ink.withValues(alpha: 0.6),
                                    ),
                                    Expanded(
                                      child: Text(
                                        monthTitle,
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.w600,
                                          color: ink,
                                        ),
                                      ),
                                    ),
                                    IconButton(
                                      onPressed: _canGoNext ? () => _goMonth(1) : null,
                                      icon: Icon(
                                        Icons.chevron_right_rounded,
                                        color: _canGoNext
                                            ? ink.withValues(alpha: 0.6)
                                            : ink.withValues(alpha: 0.2),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            SliverToBoxAdapter(
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                                child: _StatsGrid(
                                  present: stats.present,
                                  absent: stats.absent,
                                  weekOff: stats.weekOff,
                                ),
                              ),
                            ),
                            SliverToBoxAdapter(
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: Colors.black12),
                                  ),
                                  child: Column(
                                    children: [
                                      Padding(
                                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
                                        child: Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                'Attendance Summary',
                                                style: TextStyle(
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w600,
                                                  color: ink.withValues(alpha: 0.9),
                                                ),
                                              ),
                                            ),
                                            if ((_shiftTimingLine ?? '').isNotEmpty)
                                              Text(
                                                _shiftTimingLine!,
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w600,
                                                  color: ink.withValues(alpha: 0.5),
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                      ListView.separated(
                                        itemCount: _daysDescending.length,
                                        shrinkWrap: true,
                                        physics: const NeverScrollableScrollPhysics(),
                                        separatorBuilder: (_, __) => Divider(
                                          height: 1,
                                          thickness: 1,
                                          color: Colors.grey.shade300,
                                        ),
                                        itemBuilder: (context, index) {
                                          final day = _daysDescending[index];
                                          final r = _recordFor(day);
                                          final leave = _approvedLeaveForDay(day);
                                          final status = _rowStatus(day, r, leave);
                                          final timing = _timingLine(r);
                              final rowShiftTiming =
                                  ((r?.shiftStartTime ?? '').isNotEmpty &&
                                          (r?.shiftEndTime ?? '').isNotEmpty)
                                      ? '${r!.shiftStartTime} - ${r.shiftEndTime}'
                                      : _shiftTimingLine;
                              final shiftLabel = (r?.shiftName ?? '').trim();
                              final showShiftLabel = status.toLowerCase() == 'present' &&
                                  shiftLabel.isNotEmpty;
                              final headlineStatus = showShiftLabel
                                  ? '$status | ${shiftLabel.toUpperCase()}'
                                  : status;
                                          return InkWell(
                                            onTap: () {
                                              Navigator.push(
                                                context,
                                                MaterialPageRoute<void>(
                                                  builder: (_) => AttendanceDayDetailScreen(
                                                    day: day,
                                                    record: r,
                                                    shiftTiming: rowShiftTiming,
                                                  ),
                                                ),
                                              );
                                            },
                                            child: Padding(
                                              padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
                                              child: Row(
                                                children: [
                                                  Expanded(
                                                    child: Column(
                                                      crossAxisAlignment: CrossAxisAlignment.start,
                                                      children: [
                                                        Text(
                                                          DateFormat('dd MMM').format(day),
                                                          style: const TextStyle(
                                                            fontSize: 15,
                                                            fontWeight: FontWeight.w600,
                                                            color: ink,
                                                          ),
                                                        ),
                                                        const SizedBox(height: 2),
                                                        Text(
                                                          DateFormat('EEEE').format(day),
                                                          style: TextStyle(
                                                            fontSize: 12,
                                                            color: ink.withValues(alpha: 0.42),
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                  Column(
                                                    crossAxisAlignment: CrossAxisAlignment.end,
                                                    children: [
                                                      Text(
                                                        headlineStatus,
                                                        style: const TextStyle(
                                                          fontSize: 14,
                                                          fontWeight: FontWeight.w500,
                                                          color: ink,
                                                        ),
                                                      ),
                                                      Text(
                                                        timing,
                                                        style: TextStyle(
                                                          fontSize: 11,
                                                          color: ink.withValues(alpha: 0.45),
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                  Icon(
                                                    Icons.chevron_right_rounded,
                                                    color: ink.withValues(alpha: 0.3),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          );
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SliverToBoxAdapter(child: SizedBox(height: 14)),
                          ],
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: OvalBottomNavBar(
        currentIndex: 0,
        onTap: (index) {
          if (index == 0) return;
          pushMainShellByIndex(context, index);
        },
      ),
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({
    required this.present,
    required this.absent,
    required this.weekOff,
  });

  final int present;
  final int absent;
  final int weekOff;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF1A1A1A);
    final cells = [
      ('Present', present.toString()),
      ('Absent', absent.toString()),
      ('Weekly Off', weekOff.toString()),
    ];
    return GridView.count(
      crossAxisCount: 3,
      mainAxisSpacing: 0,
      crossAxisSpacing: 0,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.55,
      children: [
        for (final c in cells)
          Container(
            padding: const EdgeInsets.fromLTRB(10, 12, 10, 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F1F1),
              borderRadius: BorderRadius.circular(2),
              border: Border.all(color: Colors.black12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  c.$1,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: ink.withValues(alpha: 0.5),
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  c.$2,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: ink,
                    letterSpacing: -0.3,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
