import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/lead.dart';
import 'package:track/screens/leads/lead_detail_screen.dart';
import 'package:track/services/lead_service.dart';

String _dioMessage(Object e) {
  if (e is! DioException) return e.toString();
  final data = e.response?.data;
  if (data is Map && data['message'] is String) {
    final m = (data['message'] as String).trim();
    if (m.isNotEmpty) return m;
  }
  return e.message ?? e.toString();
}

/// Full-screen follow-up from the feed: view details, edit notes, type, next date, and lead status.
class FollowUpDetailScreen extends StatefulWidget {
  const FollowUpDetailScreen({super.key, required this.item});

  final FollowUpFeedItem item;

  @override
  State<FollowUpDetailScreen> createState() => _FollowUpDetailScreenState();
}

class _FollowUpDetailScreenState extends State<FollowUpDetailScreen> {
  static const Set<String> _leadStatusKeys = {
    'new',
    'in_progress',
    'follow_up',
    'won',
    'dropped',
    'customer',
  };

  final LeadService _leadService = LeadService();
  final TextEditingController _noteCtrl = TextEditingController();
  late String _actionType;
  DateTime? _nextAt;
  late String _statusAfter;
  LeadItem? _lead;
  bool _loadingLead = true;
  bool _saving = false;
  String? _error;

  FollowUpFeedItem get _i => widget.item;

  String get _leadStatusDropdownValue =>
      _leadStatusKeys.contains(_statusAfter) ? _statusAfter : 'follow_up';

  @override
  void initState() {
    super.initState();
    _noteCtrl.text = _i.notes;
    _actionType = _i.followUpType.isEmpty ? 'call' : _i.followUpType;
    _nextAt = _i.nextFollowUpDate;
    _statusAfter = _i.status;
    _loadLead();
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadLead() async {
    setState(() {
      _loadingLead = true;
      _error = null;
    });
    try {
      final row = await _leadService.getLeadById(_i.leadId);
      if (!mounted) return;
      setState(() => _lead = row);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _dioMessage(e));
    } finally {
      if (mounted) setState(() => _loadingLead = false);
    }
  }

  String _fmtDateTime(DateTime? dt) {
    if (dt == null) return 'Not set';
    final l = dt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(l.day)}/${two(l.month)}/${l.year} ${two(l.hour)}:${two(l.minute)}';
  }

  InputDecoration _decoration({required String hint, IconData? icon}) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: const Color(0xFFF8F9FA),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.08)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.primary, width: 1.4),
      ),
      prefixIcon: icon != null ? Icon(icon, size: 22, color: Colors.black54) : null,
    );
  }

  Future<void> _pickNextDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
      initialDate: _nextAt ?? now,
    );
    if (picked != null && mounted) setState(() => _nextAt = picked);
  }

  Future<void> _save() async {
    if (_noteCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Notes are required.')),
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _leadService.updateFollowUp(
        leadId: _i.leadId,
        followUpId: _i.followUpId,
        note: _noteCtrl.text.trim(),
        actionType: _actionType,
        nextFollowUpAt: _nextAt,
        statusAfter: _statusAfter.trim().isEmpty ? null : _statusAfter.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Follow-up updated.')),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _dioMessage(e));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_dioMessage(e))),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final leadStatus = _lead?.status ?? _i.status;
    final statusLabel = leadStatus.replaceAll('_', ' ');

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.black,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text(
          'Follow-up',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
        ),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(18)),
        ),
      ),
      body: _loadingLead && _lead == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadLead,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                children: [
                  Material(
                    elevation: 2,
                    shadowColor: Colors.black26,
                    borderRadius: BorderRadius.circular(20),
                    color: Colors.white,
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.25),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Icon(
                                  _actionType == 'visit'
                                      ? Icons.storefront_rounded
                                      : _actionType == 'message'
                                          ? Icons.chat_bubble_outline_rounded
                                          : Icons.call_outlined,
                                  size: 28,
                                  color: Colors.black87,
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _i.leadName,
                                      style: const TextStyle(
                                        fontSize: 20,
                                        fontWeight: FontWeight.w900,
                                        height: 1.2,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      _i.companyName,
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: Colors.grey.shade700,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              Chip(
                                avatar: const Icon(Icons.flag_outlined, size: 18),
                                label: Text('Lead: $statusLabel'),
                                visualDensity: VisualDensity.compact,
                                backgroundColor: AppColors.primary.withValues(alpha: 0.2),
                              ),
                              Chip(
                                avatar: const Icon(Icons.person_outline, size: 18),
                                label: Text(
                                  _i.createdByName.isEmpty ? 'Unknown' : _i.createdByName,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                visualDensity: VisualDensity.compact,
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Created ${_fmtDateTime(_i.createdAt)}'
                            '${_i.updatedAt != null ? ' · Updated ${_fmtDateTime(_i.updatedAt)}' : ''}',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Edit & update',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.grey.shade800,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Material(
                    elevation: 1,
                    borderRadius: BorderRadius.circular(20),
                    color: Colors.white,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('Notes', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.grey.shade800)),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _noteCtrl,
                            minLines: 4,
                            maxLines: 8,
                            decoration: _decoration(
                              hint: 'Add or update follow-up notes',
                              icon: Icons.notes_rounded,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text('Contact type', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.grey.shade800)),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            value: _actionType,
                            decoration: _decoration(hint: 'Type', icon: Icons.touch_app_outlined),
                            items: const [
                              DropdownMenuItem(value: 'call', child: Text('Call')),
                              DropdownMenuItem(value: 'visit', child: Text('Visit')),
                              DropdownMenuItem(value: 'message', child: Text('Message')),
                              DropdownMenuItem(value: 'other', child: Text('Other')),
                            ],
                            onChanged: _saving ? null : (v) => setState(() => _actionType = v ?? 'call'),
                          ),
                          const SizedBox(height: 16),
                          Text('Next follow-up', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.grey.shade800)),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            onPressed: _saving ? null : _pickNextDate,
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              side: BorderSide(color: Colors.black.withValues(alpha: 0.12)),
                            ),
                            icon: const Icon(Icons.calendar_month_rounded),
                            label: Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                _nextAt == null ? 'Tap to set date (optional)' : _fmtDateTime(_nextAt),
                                style: const TextStyle(fontWeight: FontWeight.w600),
                              ),
                            ),
                          ),
                          if (_nextAt != null)
                            TextButton(
                              onPressed: _saving ? null : () => setState(() => _nextAt = null),
                              child: const Text('Clear next date'),
                            ),
                          const SizedBox(height: 16),
                          Text(
                            'Lead status',
                            style: TextStyle(fontWeight: FontWeight.w700, color: Colors.grey.shade800),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Updates the lead when you save (final statuses may require manager).',
                            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            value: _leadStatusDropdownValue,
                            decoration: _decoration(hint: 'Status', icon: Icons.flag_circle_outlined),
                            items: const [
                              DropdownMenuItem(value: 'new', child: Text('New')),
                              DropdownMenuItem(value: 'in_progress', child: Text('In progress')),
                              DropdownMenuItem(value: 'follow_up', child: Text('Follow-up')),
                              DropdownMenuItem(value: 'won', child: Text('Won')),
                              DropdownMenuItem(value: 'dropped', child: Text('Dropped')),
                              DropdownMenuItem(value: 'customer', child: Text('Customer')),
                            ],
                            onChanged: _saving
                                ? null
                                : (v) => setState(() => _statusAfter = v ?? 'new'),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
                          ],
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: _saving ? null : _save,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.black,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                if (_saving) ...[
                                  const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black54),
                                  ),
                                  const SizedBox(width: 10),
                                ] else
                                  const Icon(Icons.save_rounded, color: Colors.black87, size: 22),
                                Text(
                                  _saving ? 'Saving…' : 'Save changes',
                                  style: const TextStyle(fontWeight: FontWeight.w800),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: _i.leadId)),
                      ).then((_) => _loadLead());
                    },
                    icon: const Icon(Icons.open_in_new_rounded),
                    label: const Text('Open full lead'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
