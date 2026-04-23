import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../config/app_colors.dart';
import '../models/attendance_alarm_settings.dart';
import '../services/alarm_service.dart';
import '../services/attendance_alarm_log.dart';
import '../services/attendance_alarm_scheduler.dart';
import '../services/attendance_service.dart';
import '../services/fcm_service.dart';
import 'app_feedback.dart';

/// Opens a bottom sheet to configure check-in / check-out reminder times (saved on server).
Future<void> showAttendanceAlarmSetupSheet(BuildContext context) async {
  attendanceAlarmLog('showSheet: opening (fetch from API)');
  final service = AttendanceService();
  late AttendanceAlarmSettings initial;
  try {
    initial = await service.fetchAttendanceAlarms();
  } catch (e) {
    if (context.mounted) AppFeedback.error(context, e);
    return;
  }
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: _AttendanceAlarmSheetBody(initial: initial),
    ),
  );
}

class _AttendanceAlarmSheetBody extends StatefulWidget {
  const _AttendanceAlarmSheetBody({required this.initial});

  final AttendanceAlarmSettings initial;

  @override
  State<_AttendanceAlarmSheetBody> createState() =>
      _AttendanceAlarmSheetBodyState();
}

class _AttendanceAlarmSheetBodyState extends State<_AttendanceAlarmSheetBody> {
  static DateTime _anchor(int hour, int minute) =>
      DateTime(2000, 1, 1, hour, minute);

  late bool _inEnabled;
  late bool _outEnabled;
  late DateTime _checkInDt;
  late DateTime _checkOutDt;
  /// 0 = check-in, 1 = check-out (which time the wheel edits).
  int _segment = 0;
  bool _saving = false;

  static DateTime _fromMinutes(int m) {
    final h = (m ~/ 60) % 24;
    final mm = m % 60;
    return _anchor(h, mm);
  }

  static int _toMinutes(DateTime d) => d.hour * 60 + d.minute;

  DateTime get _activeTime => _segment == 0 ? _checkInDt : _checkOutDt;

  @override
  void initState() {
    super.initState();
    final s = widget.initial;
    _inEnabled = s.checkInEnabled;
    _outEnabled = s.checkOutEnabled;
    _checkInDt = _fromMinutes(s.checkInMinutes);
    _checkOutDt = _fromMinutes(s.checkOutMinutes);
  }

  void _onWheelChanged(DateTime d) {
    setState(() {
      if (_segment == 0) {
        _checkInDt = _anchor(d.hour, d.minute);
      } else {
        _checkOutDt = _anchor(d.hour, d.minute);
      }
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await AlarmService.requestExactAlarmPermission(
        FcmService.localNotifications,
      );
      final settings = AttendanceAlarmSettings(
        checkInEnabled: _inEnabled,
        checkOutEnabled: _outEnabled,
        checkInMinutes: _toMinutes(_checkInDt),
        checkOutMinutes: _toMinutes(_checkOutDt),
      );
      attendanceAlarmLog(
        'sheet SAVE in=${settings.checkInMinutes}m out=${settings.checkOutMinutes}m '
        'inEn=${settings.checkInEnabled} outEn=${settings.checkOutEnabled}',
      );
      await AttendanceService().saveAttendanceAlarms(settings);
      attendanceAlarmLog('sheet server save OK → rescheduleFromServer(force:true)');
      await AttendanceAlarmScheduler.rescheduleFromServer(force: true);
      attendanceAlarmLog('sheet reschedule returned');
      if (!mounted) return;
      Navigator.pop(context);
      AppFeedback.success(context, 'Alarms saved');
    } catch (e) {
      if (mounted) AppFeedback.error(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF1A1A1A);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.black26,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'Set Alarm',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: ink,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'We will set an alarm for you to mark daily attendance. '
              'Skips weekly off, holidays, and approved leave.',
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                color: ink.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 16),
            _alarmToggleRow(
              label: 'Check-in reminder',
              value: _inEnabled,
              onChanged: (v) => setState(() => _inEnabled = v),
            ),
            const SizedBox(height: 8),
            _alarmToggleRow(
              label: 'Check-out reminder',
              value: _outEnabled,
              onChanged: (v) => setState(() => _outEnabled = v),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: CupertinoSlidingSegmentedControl<int>(
                groupValue: _segment,
                children: const {
                  0: Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      'Check-in',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  1: Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      'Check-out',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                },
                onValueChanged: (v) {
                  if (v == null) return;
                  setState(() => _segment = v);
                },
              ),
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: 220,
              child: CupertinoTheme(
                data: const CupertinoThemeData(
                  brightness: Brightness.light,
                  textTheme: CupertinoTextThemeData(
                    dateTimePickerTextStyle: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w500,
                      color: ink,
                    ),
                  ),
                ),
                child: CupertinoDatePicker(
                  key: ValueKey<int>(_segment),
                  mode: CupertinoDatePickerMode.time,
                  use24hFormat: false,
                  initialDateTime: _activeTime,
                  onDateTimeChanged: _onWheelChanged,
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 50,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Set Alarm',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _alarmToggleRow({
    required String label,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    const ink = Color(0xFF1A1A1A);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 15,
                color: ink,
              ),
            ),
          ),
          CupertinoSwitch(
            value: value,
            activeTrackColor: AppColors.primary,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}
