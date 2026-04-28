import 'dart:async';

import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/navigation/main_shell_navigation.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:track/models/attendance_record.dart';
import 'package:track/services/attendance_alarm_punch_state.dart';
import 'package:track/services/attendance_alarm_scheduler.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/services/presence_tracking_service.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/screens/attendance/attendance_summary_screen.dart';
import 'package:track/widgets/app_feedback.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/app_tab_loader.dart';
import 'package:track/widgets/attendance_alarm_sheet.dart';

/// Bottom-nav **Attendance** tab: server-backed history only (no punch / leave on this screen).
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen>
    with MainShellSwipeNavigation {
  final AttendanceService _service = AttendanceService();

  static String _locationLine(AttendanceGeo? g) {
    if (g == null) return '';
    final a = g.address?.trim() ?? '';
    if (a.isNotEmpty) return a;
    if (g.lat != 0 || g.lng != 0) {
      return '${g.lat.toStringAsFixed(5)}, ${g.lng.toStringAsFixed(5)}';
    }
    return '';
  }

  Future<void> _openUrl(String? url) async {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    if (!await canLaunchUrl(uri)) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  bool _loading = true;
  List<AttendanceRecord> _history = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _sortHistoryInPlace() {
    _history.sort((a, b) {
      final da = DateDisplayUtil.dateOnlyLocal(a.attendanceDate ?? a.checkInTime);
      final db = DateDisplayUtil.dateOnlyLocal(b.attendanceDate ?? b.checkInTime);
      final byDay = db.compareTo(da);
      if (byDay != 0) return byDay;
      return b.checkInTime.compareTo(a.checkInTime);
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      await _service.syncPendingOps();
      final rows = await _service.fetchHistoryRecentYears(years: 3);
      await AttendanceAlarmPunchState.syncFromHistory(rows);
      if (!mounted) return;
      setState(() {
        _history = rows;
        _sortHistoryInPlace();
      });
      scheduleMicrotask(() {
        unawaited(_syncPresenceTrackingFromHistory());
        unawaited(AttendanceAlarmScheduler.rescheduleFromServer());
      });
    } catch (e) {
      if (!mounted) return;
      AppFeedback.error(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _syncPresenceTrackingFromHistory() async {
    final history = _history;
    if (history.isEmpty) return;
    final now = DateTime.now();
    AttendanceRecord? latestToday;
    for (final row in history) {
      if (DateDisplayUtil.dateOnlyLocal(row.checkInTime) !=
          DateDisplayUtil.dateOnlyLocal(now)) {
        continue;
      }
      if (latestToday == null || row.checkInTime.isAfter(latestToday.checkInTime)) {
        latestToday = row;
      }
    }
    if (latestToday == null) {
      await PresenceTrackingService().ensureTrackingIfPunchedIn(false);
      return;
    }
    final latest = latestToday;
    final punchedIn = latest.checkOutTime == null;
    if (punchedIn) {
      final loc = latest.checkInLocation;
      if (loc != null && (loc.lat != 0 || loc.lng != 0)) {
        await PresenceTrackingService().pinOfficeZoneAtCheckIn(loc.lat, loc.lng);
      }
      await PresenceTrackingService().ensureTrackingIfPunchedIn(true);
    } else {
      await PresenceTrackingService().ensureTrackingIfPunchedIn(false);
    }
  }

  List<Widget> _metaLines(AttendanceRecord x) {
    final lines = <Widget>[];
    void add(String label, String? value) {
      final v = value?.trim();
      if (v == null || v.isEmpty) return;
      lines.add(
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '$label: $v',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }

    add('Day', x.attendanceDate != null
        ? DateDisplayUtil.formatDateOnly(x.attendanceDate!)
        : null);
    add('Method', x.method);
    if (x.minutesWorked != null) add('Minutes worked', '${x.minutesWorked}');
    add('Note', x.note);
    add('Leave kind', x.leaveKind);
    if (x.lateFlag == true) add('Late', 'Yes');
    if (x.earlyExitFlag == true) add('Early exit', 'Yes');
    return lines;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance history'),
        actions: [
          IconButton(
            tooltip: 'Attendance alarms',
            onPressed: () => showAttendanceAlarmSetupSheet(context),
            icon: const Icon(Icons.alarm_rounded),
          ),
          IconButton(
            tooltip: 'Monthly summary',
            onPressed: () {
              Navigator.push<void>(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => const AttendanceSummaryScreen(),
                ),
              );
            },
            icon: const Icon(Icons.bar_chart_rounded),
          ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: _loading
          ? const AppTabLoadingBody(message: 'Loading attendance…')
          : GestureDetector(
              behavior: HitTestBehavior.translucent,
              onHorizontalDragEnd: (details) => handleMainShellSwipe(details, 0),
              child: RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_history.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: Text(
                        'No attendance records yet.\nUse Dashboard to check in or out.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Colors.black54,
                              height: 1.4,
                            ),
                      ),
                    )
                  else
                    ..._history.map((x) {
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(
                                    x.checkOutTime == null
                                        ? Icons.schedule_rounded
                                        : Icons.verified_rounded,
                                    color: AppColors.primary,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'In: ${DateDisplayUtil.formatForDisplay(x.checkInTime, 'dd MMM yyyy, hh:mm a')}'
                                          '${x.checkOutTime != null ? '  ·  Out: ${DateDisplayUtil.formatForDisplay(x.checkOutTime!, 'dd MMM yyyy, hh:mm a')}' : ''}',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 14,
                                          ),
                                        ),
                                        Text(
                                          'Duration: ${x.durationMinutes} min · Status: ${x.status}',
                                          style: Theme.of(context).textTheme.bodySmall,
                                        ),
                                        ..._metaLines(x),
                                        if (_locationLine(x.checkInLocation).isNotEmpty)
                                          Padding(
                                            padding: const EdgeInsets.only(top: 6),
                                            child: Text(
                                              'Check-in: ${_locationLine(x.checkInLocation)}',
                                              style: Theme.of(context).textTheme.bodySmall,
                                            ),
                                          ),
                                        if (x.checkOutTime != null &&
                                            _locationLine(x.checkOutLocation).isNotEmpty)
                                          Padding(
                                            padding: const EdgeInsets.only(top: 4),
                                            child: Text(
                                              'Check-out: ${_locationLine(x.checkOutLocation)}',
                                              style: Theme.of(context).textTheme.bodySmall,
                                            ),
                                          ),
                                        Wrap(
                                          spacing: 8,
                                          runSpacing: 0,
                                          children: [
                                            if ((x.checkInImageUrl ?? '').isNotEmpty)
                                              TextButton(
                                                onPressed: () => _openUrl(x.checkInImageUrl),
                                                child: const Text('Check-in photo'),
                                              ),
                                            if ((x.checkOutImageUrl ?? '').isNotEmpty)
                                              TextButton(
                                                onPressed: () => _openUrl(x.checkOutImageUrl),
                                                child: const Text('Check-out photo'),
                                              ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
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
