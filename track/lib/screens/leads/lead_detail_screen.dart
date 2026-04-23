import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:track/models/lead.dart';
import 'package:track/services/lead_service.dart';

class LeadDetailScreen extends StatefulWidget {
  final String leadId;
  const LeadDetailScreen({super.key, required this.leadId});

  @override
  State<LeadDetailScreen> createState() => _LeadDetailScreenState();
}

class _LeadDetailScreenState extends State<LeadDetailScreen> with SingleTickerProviderStateMixin {
  final LeadService _leadService = LeadService();
  late final TabController _tab;
  LeadItem? _item;
  bool _loading = true;
  String _error = '';

  final TextEditingController _noteCtrl = TextEditingController();
  String _followType = 'call';
  String _statusAfter = '';
  DateTime? _nextDate;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final row = await _leadService.getLeadById(widget.leadId);
      if (!mounted) return;
      setState(() => _item = row);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addFollowUp() async {
    if (_noteCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Notes are required.')));
      return;
    }
    try {
      await _leadService.addFollowUp(
        leadId: widget.leadId,
        note: _noteCtrl.text.trim(),
        actionType: _followType,
        nextFollowUpAt: _nextDate,
        statusAfter: _statusAfter.isEmpty ? null : _statusAfter,
      );
      _noteCtrl.clear();
      setState(() {
        _statusAfter = '';
        _nextDate = null;
      });
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Follow-up saved.')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _setStatus(String status) async {
    try {
      await _leadService.updateStatus(widget.leadId, status);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _convertToCustomer() async {
    try {
      await _leadService.convertToCustomer(widget.leadId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lead converted to customer.')),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> _launchIf(String uri) async {
    if (uri.trim().isEmpty) return;
    final u = Uri.parse(uri);
    if (await canLaunchUrl(u)) await launchUrl(u, mode: LaunchMode.externalApplication);
  }

  InputDecoration _formFieldDecoration({
    required String hint,
    IconData? icon,
  }) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: icon == null ? null : Icon(icon, size: 18, color: const Color(0xFFE0A51B)),
      filled: true,
      fillColor: const Color(0xFFF7F7F7),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.12)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.12)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFE0A51B), width: 1.1),
      ),
      isDense: true,
    );
  }

  Widget _fieldLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: Colors.black.withValues(alpha: 0.7),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final row = _item;
    return Scaffold(
      appBar: AppBar(
        title: Text(row?.leadName ?? 'Lead details'),
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(text: 'Lead Details'),
            Tab(text: 'Follow-up History'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error.isNotEmpty
              ? Center(child: Text(_error))
              : row == null
                  ? const Center(child: Text('Lead not found'))
                  : TabBarView(
                      controller: _tab,
                      children: [
                        ListView(
                          padding: const EdgeInsets.all(12),
                          children: [
                            Text(row.companyName, style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 6),
                            Text('Status: ${row.status.replaceAll('_', ' ')}'),
                            Text('Source: ${row.source.isEmpty ? '-' : row.source}'),
                            Text('Assigned: ${row.assignedToName.isEmpty ? '-' : row.assignedToName}'),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              children: [
                                if (row.phoneNumber.isNotEmpty)
                                  OutlinedButton.icon(
                                    onPressed: () => _launchIf('tel:${row.phoneNumber}'),
                                    icon: const Icon(Icons.call_outlined),
                                    label: const Text('Call'),
                                  ),
                                if (row.phoneNumber.isNotEmpty)
                                  OutlinedButton.icon(
                                    onPressed: () => _launchIf('https://wa.me/${row.phoneNumber.replaceAll(RegExp(r'\\D'), '')}'),
                                    icon: const Icon(Icons.message_outlined),
                                    label: const Text('WhatsApp'),
                                  ),
                                if (row.emailId.isNotEmpty)
                                  OutlinedButton.icon(
                                    onPressed: () => _launchIf('mailto:${row.emailId}'),
                                    icon: const Icon(Icons.email_outlined),
                                    label: const Text('Email'),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            if (row.addressText.isNotEmpty) Text('Address: ${row.addressText}'),
                            if (row.lat != null && row.lng != null)
                              TextButton(
                                onPressed: () => _launchIf('https://maps.google.com/?q=${row.lat},${row.lng}'),
                                child: const Text('Open map'),
                              ),
                            const Divider(height: 24),
                            const Text('Quick status update'),
                            Wrap(
                              spacing: 8,
                              children: [
                                for (final s in const ['new', 'in_progress', 'follow_up', 'won', 'dropped'])
                                  ActionChip(
                                    label: Text(s.replaceAll('_', ' ')),
                                    onPressed: () => _setStatus(s),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            if (row.status != 'customer')
                              FilledButton.icon(
                                onPressed: _convertToCustomer,
                                icon: const Icon(Icons.swap_horiz_rounded),
                                label: const Text('Convert to customer'),
                              ),
                          ],
                        ),
                        ListView(
                          padding: const EdgeInsets.all(12),
                          children: [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _fieldLabel('Add Follow-up'),
                                  TextField(
                                    controller: _noteCtrl,
                                    minLines: 2,
                                    maxLines: 4,
                                    decoration: _formFieldDecoration(
                                      hint: 'Enter follow-up notes',
                                      icon: Icons.description_outlined,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  _fieldLabel('Type'),
                                  DropdownButtonFormField<String>(
                                    initialValue: _followType,
                                    decoration: _formFieldDecoration(
                                      hint: 'Select type',
                                      icon: Icons.call_outlined,
                                    ),
                                    items: const [
                                      DropdownMenuItem(value: 'call', child: Text('Call')),
                                      DropdownMenuItem(value: 'visit', child: Text('Visit')),
                                      DropdownMenuItem(value: 'message', child: Text('Message')),
                                    ],
                                    onChanged: (v) => setState(() => _followType = v ?? 'call'),
                                  ),
                                  const SizedBox(height: 10),
                                  _fieldLabel('Status update (optional)'),
                                  DropdownButtonFormField<String>(
                                    initialValue: _statusAfter.isEmpty ? null : _statusAfter,
                                    decoration: _formFieldDecoration(
                                      hint: 'Select status',
                                      icon: Icons.flag_outlined,
                                    ),
                                    items: const [
                                      DropdownMenuItem(value: 'new', child: Text('New')),
                                      DropdownMenuItem(value: 'in_progress', child: Text('In Progress')),
                                      DropdownMenuItem(value: 'follow_up', child: Text('Follow-up')),
                                      DropdownMenuItem(value: 'won', child: Text('Won')),
                                      DropdownMenuItem(value: 'dropped', child: Text('Dropped')),
                                    ],
                                    onChanged: (v) => setState(() => _statusAfter = v ?? ''),
                                  ),
                                  const SizedBox(height: 10),
                                  _fieldLabel('Next follow-up date'),
                                  OutlinedButton(
                                    onPressed: () async {
                                      final now = DateTime.now();
                                      final picked = await showDatePicker(
                                        context: context,
                                        firstDate: now,
                                        lastDate: DateTime(now.year + 3),
                                        initialDate: _nextDate ?? now,
                                      );
                                      if (picked != null) {
                                        if (!mounted) return;
                                        setState(() => _nextDate = picked);
                                      }
                                    },
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: Colors.black87,
                                      side: BorderSide(color: Colors.black.withValues(alpha: 0.2)),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                      minimumSize: const Size.fromHeight(44),
                                    ),
                                    child: Text(
                                      _nextDate == null
                                          ? 'Select date'
                                          : 'Next: ${_nextDate!.toLocal().toString().split(' ').first}',
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  FilledButton.icon(
                                    onPressed: _addFollowUp,
                                    icon: const Icon(Icons.check_circle_outline_rounded),
                                    label: const Text('Save Follow-up'),
                                    style: FilledButton.styleFrom(
                                      backgroundColor: const Color(0xFFE0A51B),
                                      foregroundColor: Colors.black,
                                      minimumSize: const Size.fromHeight(48),
                                      textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Divider(height: 24),
                            const Text('History', style: TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            if (row.followUps.isEmpty)
                              const Text('No follow-ups yet.')
                            else
                              ...row.followUps.reversed.map(
                                (f) => ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(f.note),
                                  subtitle: Text(
                                    '${f.actionType} • ${f.createdAt?.toLocal().toString() ?? ''}'
                                    '${f.statusAfter != null ? ' • status: ${f.statusAfter}' : ''}',
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
    );
  }
}
