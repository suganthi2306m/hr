import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/attendance_record.dart';
import 'package:track/screens/attendance/attendance_day_detail_screen.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/widgets/app_feedback.dart';

/// Month-scrolling attendance calendar with stats and per-day rows (fast list + optional cache).
class AttendanceSummaryScreen extends StatefulWidget {
  const AttendanceSummaryScreen({super.key});

  @override
  State<AttendanceSummaryScreen> createState() => _AttendanceSummaryScreenState();
}

class _AttendanceSummaryScreenState extends State<AttendanceSummaryScreen> {
  final AttendanceService _service = AttendanceService();

  /// Calendar month (day 1, local).
  late DateTime _monthFirst;

  bool _loading = true;
  List<AttendanceRecord> _records = const [];
  List<LeaveRequestRecord> _leavesAll = const [];

  /// Month key `yyyy-MM` → records (avoids refetch when switching months back and forth).
  final Map<String, List<AttendanceRecord>> _recordCache = {};

  Map<DateTime, AttendanceRecord> _byDay = {};

  static DateTime _d0(DateTime d) => DateDisplayUtil.dateOnlyLocal(d);

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _monthFirst = DateTime(n.year, n.month, 1);
    _loadMonth();
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
      if (mounted) {
        setState(() => _loading = false);
      }
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
    _loadMonth();
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

  String _rowStatus(DateTime day, AttendanceRecord? r, LeaveRequestRecord? leave) {
    final today = _d0(DateTime.now());
    final d = _d0(day);
    if (d.isAfter(today)) return 'Upcoming';
    if (leave != null) return 'Leave (${leave.leaveType})';
    if (r == null) {
      if (d == today) return 'Not marked';
      final w = d.weekday;
      if (w == DateTime.saturday || w == DateTime.sunday) return 'Weekend';
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

  ({int present, int absent, int half, int leave}) _monthStats() {
    var present = 0;
    var absent = 0;
    var half = 0;
    var leaveDays = 0;
    final today = _d0(DateTime.now());
    for (var i = 1; i <= _daysInMonth; i++) {
      final day = DateTime(_monthFirst.year, _monthFirst.month, i);
      final d = _d0(day);
      if (d.isAfter(today)) continue;
      final leave = _approvedLeaveForDay(day);
      final r = _recordFor(day);
      if (leave != null) {
        leaveDays++;
        continue;
      }
      if (r == null) {
        final w = d.weekday;
        if (w == DateTime.saturday || w == DateTime.sunday) continue;
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
          if (r.checkOutTime != null) present++;
          break;
      }
    }
    return (present: present, absent: absent, half: half, leave: leaveDays);
  }

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF1A1A1A);
    const pageBg = Color(0xFFF0F1F3);
    final monthTitle = DateFormat('MMM, yyyy').format(_monthFirst);
    final stats = _monthStats();

    return Scaffold(
      backgroundColor: pageBg,
      appBar: AppBar(
        title: const Text('Attendance summary'),
        backgroundColor: Colors.white,
        foregroundColor: ink,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () {
              final key =
                  '${_monthFirst.year}-${_monthFirst.month.toString().padLeft(2, '0')}';
              _recordCache.remove(key);
              _loadMonth();
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: _loading
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
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.04),
                                  blurRadius: 10,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Row(
                              children: [
                                IconButton(
                                  onPressed: _canGoPrev ? () => _goMonth(-1) : null,
                                  icon: const Icon(Icons.chevron_left_rounded),
                                  color: ink,
                                ),
                                Expanded(
                                  child: Text(
                                    monthTitle,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w800,
                                      color: ink,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                ),
                                IconButton(
                                  onPressed: _canGoNext ? () => _goMonth(1) : null,
                                  icon: Icon(
                                    Icons.chevron_right_rounded,
                                    color: _canGoNext
                                        ? ink
                                        : ink.withValues(alpha: 0.25),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: _StatsGrid(
                            present: stats.present,
                            absent: stats.absent,
                            half: stats.half,
                            leave: stats.leave,
                          ),
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: Text(
                            'Attendance summary',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: ink.withValues(alpha: 0.88),
                            ),
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (context, index) {
                              final day = _daysDescending[index];
                              final r = _recordFor(day);
                              final leave = _approvedLeaveForDay(day);
                              final dayLine =
                                  DateFormat('dd MMM, EEEE').format(day);
                              final status = _rowStatus(day, r, leave);
                              final hours = _hoursLine(r);

                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Material(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                  clipBehavior: Clip.antiAlias,
                                  child: InkWell(
                                    onTap: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute<void>(
                                          builder: (_) => AttendanceDayDetailScreen(
                                            day: day,
                                            record: r,
                                          ),
                                        ),
                                      );
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 14,
                                      ),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  dayLine,
                                                  style: const TextStyle(
                                                    fontSize: 15,
                                                    fontWeight: FontWeight.w700,
                                                    color: ink,
                                                  ),
                                                ),
                                                const SizedBox(height: 4),
                                                Text(
                                                  status,
                                                  style: TextStyle(
                                                    fontSize: 13,
                                                    fontWeight: FontWeight.w600,
                                                    color: ink.withValues(
                                                      alpha: 0.52,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Text(
                                            hours,
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                              color: ink,
                                            ),
                                          ),
                                          const SizedBox(width: 4),
                                          Icon(
                                            Icons.chevron_right_rounded,
                                            color: ink.withValues(alpha: 0.35),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                            childCount: _daysDescending.length,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({
    required this.present,
    required this.absent,
    required this.half,
    required this.leave,
  });

  final int present;
  final int absent;
  final int half;
  final int leave;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF1A1A1A);
    final cells = [
      ('Present', present.toString()),
      ('Absent', absent.toString()),
      ('Half day', half.toString()),
      ('Leave', leave.toString()),
      ('Fine', '0:00'),
      ('Overtime', '0:00'),
    ];
    return GridView.count(
      crossAxisCount: 3,
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.45,
      children: [
        for (final c in cells)
          Container(
            padding: const EdgeInsets.fromLTRB(10, 12, 10, 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
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
