import 'dart:async';

import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:track/models/attendance_record.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/services/presence_tracking_service.dart';
import 'package:track/utils/attendance_camera_flow.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/widgets/app_tab_loader.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
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
  bool _submitting = false;
  List<AttendanceRecord> _history = const [];
  List<LeaveRequestRecord> _leaves = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _service.syncPendingOps(),
        _service.fetchHistory(),
        _service.fetchLeaveStatus(),
      ]);
      if (!mounted) return;
      setState(() {
        _history = results[1] as List<AttendanceRecord>;
        _leaves = results[2] as List<LeaveRequestRecord>;
      });
      scheduleMicrotask(() {
        unawaited(_syncPresenceTrackingFromHistory());
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Load failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _isCheckedIn {
    if (_history.isEmpty) return false;
    final latest = _history.first;
    return latest.checkOutTime == null;
  }

  Future<void> _syncPresenceTrackingFromHistory() async {
    final history = _history;
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

  Future<void> _runAttendance(bool checkout) async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final ok = await AttendanceCameraFlow.run(context, checkout: checkout);
      if (mounted && ok) await _load();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _applyLeave() async {
    final formKey = GlobalKey<FormState>();
    String type = 'SICK';
    DateTime from = DateTime.now();
    DateTime to = DateTime.now();
    final reasonCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Apply Leave'),
          content: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: type,
                  items: const [
                    DropdownMenuItem(value: 'SICK', child: Text('Sick')),
                    DropdownMenuItem(value: 'CASUAL', child: Text('Casual')),
                    DropdownMenuItem(value: 'PAID', child: Text('Paid')),
                  ],
                  onChanged: (v) => type = v ?? 'SICK',
                  decoration: const InputDecoration(labelText: 'Leave type'),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: reasonCtrl,
                  maxLines: 3,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Reason is required'
                      : null,
                  decoration: const InputDecoration(labelText: 'Reason'),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: ctx,
                            initialDate: from,
                            firstDate: DateTime.now().subtract(const Duration(days: 365)),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                          );
                          if (picked != null) from = picked;
                        },
                        child: const Text('From date'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: ctx,
                            initialDate: to,
                            firstDate: DateTime.now().subtract(const Duration(days: 365)),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                          );
                          if (picked != null) to = picked;
                        },
                        child: const Text('To date'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (formKey.currentState?.validate() != true) return;
                Navigator.pop(ctx, true);
              },
              child: const Text('Apply'),
            ),
          ],
        );
      },
    );

    if (ok != true) return;
    try {
      await _service.applyLeave(
        leaveType: type,
        fromDate: from,
        toDate: to,
        reason: reasonCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Leave applied successfully')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Leave apply failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance & Leave'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: _loading
          ? const AppTabLoadingBody()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isCheckedIn ? 'You are checked in' : 'You are checked out',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: _submitting || _isCheckedIn
                                    ? null
                                    : () => _runAttendance(false),
                                icon: const Icon(Icons.login_rounded),
                                label: const Text('Check In'),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: _submitting || !_isCheckedIn
                                    ? null
                                    : () => _runAttendance(true),
                                icon: const Icon(Icons.logout_rounded),
                                label: const Text('Check Out'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Leave requests',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                      ),
                      OutlinedButton.icon(
                        onPressed: _applyLeave,
                        icon: const Icon(Icons.beach_access_rounded),
                        label: const Text('Apply Leave'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_leaves.isEmpty)
                    const Text('No leave requests yet')
                  else
                    ..._leaves.take(8).map(
                          (x) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text('${x.leaveType} • ${x.status}'),
                            subtitle: Text(
                              '${DateDisplayUtil.formatDateOnly(x.fromDate)} - ${DateDisplayUtil.formatDateOnly(x.toDate)}\n${x.reason}',
                            ),
                          ),
                        ),
                  const SizedBox(height: 16),
                  const Text(
                    'Attendance history',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  if (_history.isEmpty)
                    const Text('No attendance records yet')
                  else
                    ..._history.map(
                      (x) => Card(
                        child: ListTile(
                          isThreeLine: true,
                          leading: Icon(
                            x.checkOutTime == null
                                ? Icons.schedule_rounded
                                : Icons.verified_rounded,
                          ),
                          title: Text(
                            'In: ${DateDisplayUtil.formatForDisplay(x.checkInTime, 'dd MMM, hh:mm a')}'
                            '${x.checkOutTime != null ? '  Out: ${DateDisplayUtil.formatForDisplay(x.checkOutTime!, 'hh:mm a')}' : ''}',
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'Duration: ${x.durationMinutes} min • Status: ${x.status}',
                              ),
                              if (_locationLine(x.checkInLocation).isNotEmpty)
                                Text(
                                  'Check-in: ${_locationLine(x.checkInLocation)}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              if (x.checkOutTime != null &&
                                  _locationLine(x.checkOutLocation).isNotEmpty)
                                Text(
                                  'Check-out: ${_locationLine(x.checkOutLocation)}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              Wrap(
                                spacing: 4,
                                runSpacing: 0,
                                children: [
                                  if ((x.checkInImageUrl ?? '').isNotEmpty)
                                    TextButton(
                                      onPressed: () =>
                                          _openUrl(x.checkInImageUrl),
                                      child: const Text('In selfie (Cloudinary)'),
                                    ),
                                  if ((x.checkOutImageUrl ?? '').isNotEmpty)
                                    TextButton(
                                      onPressed: () =>
                                          _openUrl(x.checkOutImageUrl),
                                      child: const Text('Out selfie (Cloudinary)'),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
