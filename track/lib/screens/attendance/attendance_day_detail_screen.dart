import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/attendance_record.dart';
import 'package:track/utils/date_display_util.dart';

/// Per-day drill-down: shift-style summary + punch log (matches in-app attendance detail style).
class AttendanceDayDetailScreen extends StatelessWidget {
  const AttendanceDayDetailScreen({
    super.key,
    required this.day,
    this.record,
  });

  final DateTime day;
  final AttendanceRecord? record;

  static String _statusLabel(AttendanceRecord? r) {
    if (r == null) return '—';
    switch (r.status.toUpperCase()) {
      case 'PRESENT':
        return 'Present';
      case 'ABSENT':
        return 'Absent';
      case 'HALF_DAY':
        return 'Half day';
      case 'PENDING':
        return r.checkOutTime == null ? 'In progress' : 'Pending';
      default:
        return r.status;
    }
  }

  static String _durationHrs(AttendanceRecord? r) {
    if (r == null) return '0:00';
    final m = r.durationMinutes;
    final h = m ~/ 60;
    final mm = m % 60;
    return '$h:${mm.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final localDay = DateDisplayUtil.dateOnlyLocal(day);
    final titleLine = DateFormat('dd MMM, yyyy | EEE').format(localDay);
    const ink = Color(0xFF1A1A1A);
    const surface = Color(0xFFF3F4F6);

    return Scaffold(
      backgroundColor: surface,
      appBar: AppBar(
        title: const Text('Attendance Detail'),
        backgroundColor: Colors.white,
        foregroundColor: ink,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Text(
            titleLine,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: ink.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Attendance',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: ink,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        record == null
                            ? 'No punches for this day'
                            : '${DateDisplayUtil.formatTime(record!.checkInTime)}'
                                '${record!.checkOutTime != null ? ' – ${DateDisplayUtil.formatTime(record!.checkOutTime!)}' : ' – open'}',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: ink.withValues(alpha: 0.55),
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  _statusLabel(record),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: ink,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Log',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 14),
                if (record == null)
                  Text(
                    'No events recorded for this date.',
                    style: TextStyle(
                      fontSize: 14,
                      color: ink.withValues(alpha: 0.5),
                    ),
                  )
                else ...[
                  _LogBullet(
                    title:
                        'Punched in at ${DateDisplayUtil.formatForDisplay(record!.checkInTime, 'h:mm a')}',
                    subtitle: DateDisplayUtil.formatTimeline(record!.checkInTime),
                  ),
                  if (record!.checkOutTime != null) ...[
                    const SizedBox(height: 14),
                    _LogBullet(
                      title:
                          'Punched out at ${DateDisplayUtil.formatForDisplay(record!.checkOutTime!, 'h:mm a')}',
                      subtitle:
                          DateDisplayUtil.formatTimeline(record!.checkOutTime!),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        margin: const EdgeInsets.only(right: 10, top: 6),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Total: ${_durationHrs(record)} hrs',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: ink,
                              ),
                            ),
                            Text(
                              'Status: ${_statusLabel(record)}',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: ink.withValues(alpha: 0.45),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LogBullet extends StatelessWidget {
  const _LogBullet({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF1A1A1A);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 6,
          height: 6,
          margin: const EdgeInsets.only(right: 10, top: 6),
          decoration: const BoxDecoration(
            color: ink,
            shape: BoxShape.circle,
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: ink.withValues(alpha: 0.45),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
