import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/customer.dart';
import 'package:track/models/task.dart';
import 'package:track/services/task_service.dart';

/// Task summary with fields aligned to web; user can mark completed with an optional note.
class SimpleTaskInfoScreen extends StatefulWidget {
  const SimpleTaskInfoScreen({super.key, required this.task});

  final Task task;

  @override
  State<SimpleTaskInfoScreen> createState() => _SimpleTaskInfoScreenState();
}

class _SimpleTaskInfoScreenState extends State<SimpleTaskInfoScreen> {
  final TaskService _taskService = TaskService();
  late Task _task;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _task = widget.task;
  }

  static String _fmtDate(DateTime? d) {
    if (d == null) return '—';
    return DateFormat('dd MMM yyyy · HH:mm').format(d.toLocal());
  }

  static String _fmtDateShort(DateTime? d) {
    if (d == null) return '—';
    return DateFormat('dd MMM yyyy').format(d.toLocal());
  }

  static String _customerAddress(Customer? c) {
    if (c == null) return 'No customer linked';
    final parts = <String>[
      c.address.trim(),
      c.city.trim(),
      c.pincode.trim(),
    ].where((s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return '—';
    return parts.join(', ');
  }

  Color _statusColor(TaskStatus s) {
    switch (s) {
      case TaskStatus.pending:
        return const Color(0xFFE65100);
      case TaskStatus.inProgress:
        return const Color(0xFF1565C0);
      case TaskStatus.arrived:
        return const Color(0xFF283593);
      case TaskStatus.exited:
      case TaskStatus.exitedOnArrival:
      case TaskStatus.hold:
      case TaskStatus.holdOnArrival:
        return const Color(0xFFF57F17);
      case TaskStatus.completed:
        return const Color(0xFF2E7D32);
      case TaskStatus.approved:
      case TaskStatus.staffapproved:
      case TaskStatus.reopened:
      case TaskStatus.reopenedOnArrival:
        return const Color(0xFF00897B);
      case TaskStatus.rejected:
        return const Color(0xFFC62828);
      case TaskStatus.cancelled:
      case TaskStatus.onlineReady:
        return const Color(0xFF546E7A);
      case TaskStatus.assigned:
      case TaskStatus.scheduled:
        return const Color(0xFF3949AB);
      case TaskStatus.waitingForApproval:
        return const Color(0xFFF9A825);
    }
  }

  Future<void> _markCompletedWithNote(String? note) async {
    final id = _task.id;
    if (id == null || id.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cannot update: task id is missing.')),
        );
      }
      return;
    }
    if (_task.status == TaskStatus.completed) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Task is already completed.')),
        );
      }
      return;
    }

    setState(() => _saving = true);
    try {
      final updated = await _taskService.updateTask(
        id,
        status: Task.statusToApiString(TaskStatus.completed),
        note: note,
      );
      if (!mounted) return;
      setState(() {
        _task = updated;
        _saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          content: const Text('Task marked as completed'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text(e.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  Future<void> _openUpdateStatusSheet() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final note = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: const _CompleteWithNoteSheet(),
        );
      },
    );
    if (!mounted || note == null) return;
    await _markCompletedWithNote(note.isEmpty ? null : note);
  }

  @override
  Widget build(BuildContext context) {
    final c = _task.customer;

    return Scaffold(
      backgroundColor: const Color(0xFFF0F2F7),
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              SliverAppBar.large(
                expandedHeight: 132,
                pinned: true,
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.black87,
                surfaceTintColor: Colors.transparent,
                title: const Text(
                  'Task details',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                centerTitle: true,
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    _heroCard(),
                    const SizedBox(height: 14),
                    _infoCard(
                      icon: Icons.location_on_outlined,
                      title: 'Customer address',
                      child: Text(
                        _customerAddress(c),
                        style: const TextStyle(
                          fontSize: 15,
                          height: 1.45,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1A1D26),
                        ),
                      ),
                    ),
                    if (c != null) ...[
                      const SizedBox(height: 10),
                      _infoCard(
                        icon: Icons.person_outline_rounded,
                        title: 'Customer',
                        child: Text(
                          [
                            c.customerName,
                            if ((c.companyName ?? '').trim().isNotEmpty) c.companyName!.trim(),
                            if ((c.customerNumber ?? '').trim().isNotEmpty) c.customerNumber!.trim(),
                          ].where((s) => s.isNotEmpty).join('\n'),
                          style: TextStyle(
                            fontSize: 14,
                            height: 1.4,
                            fontWeight: FontWeight.w600,
                            color: Colors.black.withValues(alpha: 0.78),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    _dateRow(),
                    const SizedBox(height: 10),
                    _infoCard(
                      icon: Icons.notes_outlined,
                      title: 'Description',
                      child: Text(
                        _task.description.trim().isEmpty ? '—' : _task.description.trim(),
                        style: TextStyle(
                          fontSize: 15,
                          height: 1.5,
                          fontWeight: FontWeight.w500,
                          color: Colors.black.withValues(alpha: 0.82),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    _statusCard(),
                  ]),
                ),
              ),
            ],
          ),
          if (_saving)
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(minHeight: 3),
            ),
        ],
      ),
    );
  }

  Widget _heroCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white,
            AppColors.primary.withValues(alpha: 0.22),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
        border: Border.all(color: Colors.white.withValues(alpha: 0.9)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _task.taskId,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _task.taskTitle,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              height: 1.25,
              letterSpacing: -0.4,
              color: Color(0xFF0D1117),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dateRow() {
    return Row(
      children: [
        Expanded(
          child: _miniDateTile(
            label: 'Assigned',
            value: _fmtDateShort(_task.assignedDate),
            sub: _task.assignedDate != null
                ? DateFormat('HH:mm').format(_task.assignedDate!.toLocal())
                : null,
            icon: Icons.event_available_outlined,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _miniDateTile(
            label: 'Target',
            value: _fmtDateShort(_task.expectedCompletionDate),
            sub: DateFormat('HH:mm').format(_task.expectedCompletionDate.toLocal()),
            icon: Icons.flag_outlined,
          ),
        ),
      ],
    );
  }

  Widget _miniDateTile({
    required String label,
    required String value,
    String? sub,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: AppColors.primary),
          const SizedBox(height: 10),
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.9,
              color: Colors.black.withValues(alpha: 0.45),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: Color(0xFF1A1D26),
            ),
          ),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(
              sub,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.black.withValues(alpha: 0.5),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoCard({
    required IconData icon,
    required String title,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 22, color: AppColors.primary),
              const SizedBox(width: 10),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _statusCard() {
    final hasId = _task.id != null && _task.id!.isNotEmpty;
    final canUpdate = hasId && _task.status != TaskStatus.completed;
    final color = _statusColor(_task.status);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.timelapse_rounded, size: 22, color: AppColors.primary),
              const SizedBox(width: 10),
              const Text(
                'Status',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.25)),
            ),
            child: Text(
              _task.status.displayName,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w900,
                color: color,
                letterSpacing: 0.2,
              ),
            ),
          ),
          if (_task.completedDate != null) ...[
            const SizedBox(height: 10),
            Text(
              'Completed ${_fmtDate(_task.completedDate)}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.black.withValues(alpha: 0.5),
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: (canUpdate && !_saving) ? _openUpdateStatusSheet : null,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF1A1D26),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: const Icon(Icons.task_alt_rounded, size: 20),
              label: Text(
                !hasId
                    ? 'Status update unavailable'
                    : (!canUpdate ? 'Already completed' : 'Update status'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Owns [TextEditingController] for the note field so it is disposed only after the
/// modal route (and its animations) tear down — avoids "used after disposed" /
/// `_dependents.isEmpty` when completing from the sheet.
class _CompleteWithNoteSheet extends StatefulWidget {
  const _CompleteWithNoteSheet();

  @override
  State<_CompleteWithNoteSheet> createState() => _CompleteWithNoteSheetState();
}

class _CompleteWithNoteSheetState extends State<_CompleteWithNoteSheet> {
  late final TextEditingController _noteCtrl;

  @override
  void initState() {
    super.initState();
    _noteCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    FocusManager.instance.primaryFocus?.unfocus();
    Navigator.pop(context, _noteCtrl.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFF8F9FC),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
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
              const SizedBox(height: 16),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Update status',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () {
                      FocusManager.instance.primaryFocus?.unfocus();
                      Navigator.pop(context);
                    },
                    icon: const Icon(Icons.close_rounded),
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black87,
                    ),
                  ),
                ],
              ),
              Text(
                'Mark this task as completed. Add an optional note to save with the update.',
                style: TextStyle(
                  fontSize: 14,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                  color: Colors.black.withValues(alpha: 0.55),
                ),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: _noteCtrl,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  labelText: 'Add note',
                  hintText: 'Optional — visible with this update',
                  alignLabelWithHint: true,
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.12)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: Color(0xFF1A1D26), width: 1.5),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF2E7D32),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                icon: const Icon(Icons.check_circle_outline_rounded, size: 22),
                label: const Text(
                  'Completed',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
