import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/lead.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/services/lead_service.dart';
import 'package:track/widgets/app_shell_navigation.dart';

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
  bool _historyFiltersOpen = false;
  bool _showInlineAddFollowUp = false;
  String _historyTypeFilter = '';
  String _historyStatusAfterFilter = '';
  DateTime? _historyFrom;
  DateTime? _historyTo;

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

  @override
  void dispose() {
    _tab.dispose();
    _noteCtrl.dispose();
    super.dispose();
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

  Future<void> _logout() async {
    await AuthService().logout();
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onProfile: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        );
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        );
      },
      onLogout: _logout,
    );
  }

  String _fmtDateTime(DateTime? dt) {
    if (dt == null) return '--';
    final l = dt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(l.day)}/${two(l.month)}/${l.year} ${two(l.hour)}:${two(l.minute)}';
  }

  List<LeadFollowUp> _visibleFollowUpHistory(LeadItem row) {
    return row.followUps.where((f) {
      if (_historyTypeFilter.isNotEmpty && f.actionType.toLowerCase() != _historyTypeFilter) {
        return false;
      }
      if (_historyStatusAfterFilter.isNotEmpty &&
          (f.statusAfter ?? '').toLowerCase() != _historyStatusAfterFilter) {
        return false;
      }
      if (_historyFrom != null && f.createdAt != null) {
        if (f.createdAt!.isBefore(_historyFrom!)) return false;
      }
      if (_historyTo != null && f.createdAt != null) {
        final toEnd = DateTime(
          _historyTo!.year,
          _historyTo!.month,
          _historyTo!.day,
          23,
          59,
          59,
        );
        if (f.createdAt!.isAfter(toEnd)) return false;
      }
      return true;
    }).toList()
      ..sort((a, b) => (b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0))
          .compareTo(a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0)));
  }

  Future<void> _pickHistoryDate({required bool from}) async {
    final now = DateTime.now();
    final initial = from ? (_historyFrom ?? now) : (_historyTo ?? _historyFrom ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (from) {
        _historyFrom = picked;
      } else {
        _historyTo = picked;
      }
    });
  }

  Future<void> _showAddFollowUpSheet() async {
    final noteCtrl = TextEditingController();
    String followType = 'call';
    String statusAfter = '';
    DateTime? nextAt;
    String? localError;
    bool saving = false;

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Add Follow-up',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: noteCtrl,
                  minLines: 2,
                  maxLines: 4,
                  decoration: _formFieldDecoration(
                    hint: 'Enter follow-up notes',
                    icon: Icons.description_outlined,
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: followType,
                  decoration: _formFieldDecoration(
                    hint: 'Select type',
                    icon: Icons.call_outlined,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'call', child: Text('Call')),
                    DropdownMenuItem(value: 'visit', child: Text('Visit')),
                    DropdownMenuItem(value: 'message', child: Text('Message')),
                    DropdownMenuItem(value: 'other', child: Text('Other')),
                  ],
                  onChanged: (v) => setSheetState(() => followType = v ?? 'call'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: statusAfter.isEmpty ? null : statusAfter,
                  decoration: _formFieldDecoration(
                    hint: 'Status update (optional)',
                    icon: Icons.flag_outlined,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'new', child: Text('New')),
                    DropdownMenuItem(value: 'in_progress', child: Text('In Progress')),
                    DropdownMenuItem(value: 'follow_up', child: Text('Follow-up')),
                    DropdownMenuItem(value: 'won', child: Text('Won')),
                    DropdownMenuItem(value: 'dropped', child: Text('Dropped')),
                  ],
                  onChanged: (v) => setSheetState(() => statusAfter = v ?? ''),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      firstDate: now,
                      lastDate: DateTime(now.year + 3),
                      initialDate: nextAt ?? now,
                    );
                    if (picked != null) {
                      setSheetState(() => nextAt = picked);
                    }
                  },
                  icon: const Icon(Icons.calendar_month_rounded),
                  label: Text(nextAt == null ? 'Select next date (optional)' : _fmtDateTime(nextAt)),
                ),
                if (localError != null) ...[
                  const SizedBox(height: 8),
                  Text(localError!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: saving
                      ? null
                      : () async {
                          if (noteCtrl.text.trim().isEmpty) {
                            setSheetState(() => localError = 'Notes are required.');
                            return;
                          }
                          setSheetState(() {
                            saving = true;
                            localError = null;
                          });
                          try {
                            await _leadService.addFollowUp(
                              leadId: widget.leadId,
                              note: noteCtrl.text.trim(),
                              actionType: followType,
                              nextFollowUpAt: nextAt,
                              statusAfter: statusAfter.isEmpty ? null : statusAfter,
                            );
                            if (ctx.mounted) Navigator.pop(ctx, true);
                          } catch (e) {
                            setSheetState(() {
                              localError = e.toString();
                              saving = false;
                            });
                          }
                        },
                  child: Text(saving ? 'Saving...' : 'Save Follow-up'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    // Dispose after the sheet route/frame fully settles to avoid
    // "TextEditingController used after being disposed" during pop animation.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      noteCtrl.dispose();
    });
    if (ok == true && mounted) {
      await _load();
      setState(() {
        _tab.index = 1;
      });
    }
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
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.black,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: Icon(Icons.arrow_back_rounded, color: Colors.black.withValues(alpha: 0.85)),
          tooltip: 'Back',
        ),
        title: Text(
          row?.leadName ?? 'Lead details',
          style: const TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w900,
          ),
        ),
        actions: [
          IconButton(
            onPressed: () => _openAppMenu(context),
            icon: Icon(Icons.menu_rounded, color: Colors.black.withValues(alpha: 0.85)),
            tooltip: 'Menu',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFFF6F6F6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: TabBar(
                controller: _tab,
                indicator: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.95),
                  borderRadius: BorderRadius.circular(12),
                ),
                indicatorSize: TabBarIndicatorSize.tab,
                dividerColor: Colors.transparent,
                labelColor: Colors.black,
                unselectedLabelColor: Colors.black87,
                labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                tabs: const [
                  Tab(text: 'Lead Details'),
                  Tab(text: 'Follow-up History'),
                ],
              ),
            ),
          ),
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
                            Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    row.companyName,
                                    style: const TextStyle(
                                      color: Colors.black,
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  _detailLine(Icons.flag_outlined, 'Status', row.status.replaceAll('_', ' ')),
                                  _detailLine(Icons.campaign_outlined, 'Source', row.source.isEmpty ? '-' : row.source),
                                  _detailLine(Icons.person_outline_rounded, 'Assigned', row.assignedToName.isEmpty ? '-' : row.assignedToName),
                                  if (row.addressText.isNotEmpty)
                                    _detailLine(Icons.place_outlined, 'Address', row.addressText),
                                ],
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Divider(height: 24),
                            const Text(
                              'Quick status update',
                              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                for (final s in const ['new', 'in_progress', 'follow_up', 'won', 'dropped'])
                                  ChoiceChip(
                                    selected: row.status == s,
                                    label: Text(
                                      s.replaceAll('_', ' '),
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: row.status == s ? Colors.black : Colors.black87,
                                      ),
                                    ),
                                    selectedColor: AppColors.primary.withValues(alpha: 0.35),
                                    onSelected: (_) => _setStatus(s),
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
                            Row(
                              children: [
                                const Expanded(
                                  child: Text(
                                    'Follow-up history',
                                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                                  ),
                                ),
                                IconButton(
                                  onPressed: _showAddFollowUpSheet,
                                  icon: const Icon(Icons.add_rounded),
                                  tooltip: 'Add follow-up',
                                ),
                                IconButton(
                                  onPressed: () => setState(
                                    () => _historyFiltersOpen = !_historyFiltersOpen,
                                  ),
                                  icon: Icon(
                                    _historyFiltersOpen ? Icons.filter_alt : Icons.filter_alt_outlined,
                                  ),
                                  tooltip: 'Filter history',
                                ),
                              ],
                            ),
                            if (_historyFiltersOpen) ...[
                              const SizedBox(height: 8),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
                                ),
                                child: Column(
                                  children: [
                                    DropdownButtonFormField<String>(
                                      initialValue: _historyTypeFilter.isEmpty ? null : _historyTypeFilter,
                                      decoration: _formFieldDecoration(hint: 'Filter by type', icon: Icons.call_outlined),
                                      items: const [
                                        DropdownMenuItem(value: '', child: Text('All types')),
                                        DropdownMenuItem(value: 'call', child: Text('Call')),
                                        DropdownMenuItem(value: 'visit', child: Text('Visit')),
                                        DropdownMenuItem(value: 'message', child: Text('Message')),
                                        DropdownMenuItem(value: 'other', child: Text('Other')),
                                      ],
                                      onChanged: (v) => setState(() => _historyTypeFilter = v ?? ''),
                                    ),
                                    const SizedBox(height: 8),
                                    DropdownButtonFormField<String>(
                                      initialValue: _historyStatusAfterFilter.isEmpty ? null : _historyStatusAfterFilter,
                                      decoration: _formFieldDecoration(hint: 'Filter by status changed to', icon: Icons.flag_outlined),
                                      items: const [
                                        DropdownMenuItem(value: '', child: Text('All statuses')),
                                        DropdownMenuItem(value: 'new', child: Text('New')),
                                        DropdownMenuItem(value: 'in_progress', child: Text('In Progress')),
                                        DropdownMenuItem(value: 'follow_up', child: Text('Follow-up')),
                                        DropdownMenuItem(value: 'won', child: Text('Won')),
                                        DropdownMenuItem(value: 'dropped', child: Text('Dropped')),
                                      ],
                                      onChanged: (v) => setState(() => _historyStatusAfterFilter = v ?? ''),
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: OutlinedButton(
                                            onPressed: () => _pickHistoryDate(from: true),
                                            child: Text(
                                              _historyFrom == null
                                                  ? 'From date'
                                                  : _historyFrom!.toLocal().toString().split(' ').first,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: OutlinedButton(
                                            onPressed: () => _pickHistoryDate(from: false),
                                            child: Text(
                                              _historyTo == null
                                                  ? 'To date'
                                                  : _historyTo!.toLocal().toString().split(' ').first,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    Align(
                                      alignment: Alignment.centerLeft,
                                      child: TextButton.icon(
                                        onPressed: () => setState(() {
                                          _historyTypeFilter = '';
                                          _historyStatusAfterFilter = '';
                                          _historyFrom = null;
                                          _historyTo = null;
                                        }),
                                        icon: const Icon(Icons.clear_rounded),
                                        label: const Text('Clear filters'),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 8),
                            if (_visibleFollowUpHistory(row).isEmpty)
                              const Text('No follow-ups yet.')
                            else
                              ..._visibleFollowUpHistory(row).map(
                                (f) => Card(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  elevation: 0,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    side: BorderSide(color: Colors.black.withValues(alpha: 0.08)),
                                  ),
                                  child: ListTile(
                                    leading: Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withValues(alpha: 0.2),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Icon(
                                        f.actionType == 'visit'
                                            ? Icons.storefront_rounded
                                            : f.actionType == 'message'
                                                ? Icons.chat_bubble_outline_rounded
                                                : Icons.call_outlined,
                                        size: 18,
                                      ),
                                    ),
                                    title: Text(
                                      f.note,
                                      style: const TextStyle(fontWeight: FontWeight.w700),
                                    ),
                                    subtitle: Text(
                                      '${f.actionType.toUpperCase()} · ${_fmtDateTime(f.createdAt)}'
                                      '${f.statusAfter != null ? ' · status: ${f.statusAfter}' : ''}',
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
    );
  }

  Widget _detailLine(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Colors.black.withValues(alpha: 0.7)),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: const TextStyle(color: Colors.black87, fontSize: 14),
                children: [
                  TextSpan(
                    text: '$label: ',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: value),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
