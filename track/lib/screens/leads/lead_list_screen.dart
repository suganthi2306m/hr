import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/lead.dart';
import 'package:track/navigation/main_shell_navigation.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/leads/lead_detail_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/services/lead_service.dart';
import 'package:track/widgets/app_shell_navigation.dart';

String _dioErrorMessage(Object e) {
  if (e is! DioException) return e.toString();
  final data = e.response?.data;
  if (data is Map && data['message'] is String) {
    final m = (data['message'] as String).trim();
    if (m.isNotEmpty) return m;
  }
  if (data is String && data.trim().isNotEmpty) return data;
  if (e.response?.statusCode == 403) {
    return 'Permission denied (403). If you are on the latest app, ask your admin to update the '
        'API server so field staff can create leads.';
  }
  return e.message?.trim().isNotEmpty == true ? e.message! : e.toString();
}

InputDecoration _leadModalInputDecoration({required String hint, IconData? icon}) {
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

Widget _leadModalFieldLabel(String text) {
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

class LeadListScreen extends StatefulWidget {
  const LeadListScreen({super.key});

  @override
  State<LeadListScreen> createState() => _LeadListScreenState();
}

class _LeadListScreenState extends State<LeadListScreen> with MainShellSwipeNavigation {
  final LeadService _leadService = LeadService();
  final TextEditingController _searchCtrl = TextEditingController();
  List<LeadItem> _items = const [];
  List<FollowUpFeedItem> _followUpItems = const [];
  bool _loading = true;
  String _error = '';
  String _status = '';
  int _tabIndex = 0; // 0=Leads, 1=Follow-up
  int _leadsPage = 1;
  int _followUpPage = 1;
  static const int _pageSize = 10;
  final TextEditingController _companyCtrl = TextEditingController();
  DateTime? _fromDate;
  DateTime? _toDate;
  DateTime? _leadFromDate;
  DateTime? _leadToDate;
  bool _filtersOpen = false;

  static const List<DropdownMenuItem<String>> _statusItems = [
    DropdownMenuItem(value: '', child: Text('All statuses')),
    DropdownMenuItem(value: 'new', child: Text('New')),
    DropdownMenuItem(value: 'in_progress', child: Text('In Progress')),
    DropdownMenuItem(value: 'follow_up', child: Text('Follow-up')),
    DropdownMenuItem(value: 'won', child: Text('Won')),
    DropdownMenuItem(value: 'dropped', child: Text('Dropped')),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final rows = await _leadService.listLeads(
        search: _searchCtrl.text.trim(),
        status: _status,
        from: _leadFromDate,
        to: _leadToDate,
      );
      final followUps = await _leadService.listFollowUps(
        search: _searchCtrl.text.trim(),
        companyName: _companyCtrl.text.trim(),
        status: _status,
        from: _fromDate,
        to: _toDate,
      );
      if (!mounted) return;
      setState(() {
        _items = rows.where((e) => e.status.trim().toLowerCase() != 'customer').toList();
        _followUpItems = followUps.where((e) => e.status.trim().toLowerCase() != 'customer').toList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _dioErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _companyCtrl.dispose();
    super.dispose();
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
        ).then((_) => _load());
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ).then((_) => _load());
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

  InputDecoration _formFieldDecoration({required String hint, IconData? icon}) =>
      _leadModalInputDecoration(hint: hint, icon: icon);

  Widget _fieldLabel(String text) => _leadModalFieldLabel(text);

  Future<void> _showAddLeadDialog() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddLeadBottomSheet(
        leadService: _leadService,
        statusMenuItems: _statusItems.where((e) => e.value!.isNotEmpty).toList(),
      ),
    );
    if (created == true && mounted) await _load();
  }

  Future<void> _showAddFollowUpDialog() async {
    if (_items.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No leads available to add follow-up.')),
      );
      return;
    }
    final noteCtrl = TextEditingController();
    var selectedLeadId = _items.first.id;
    var actionType = 'call';
    var statusAfter = '';
    DateTime? nextFollowUpAt;
    String? error;
    var saving = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            Future<void> pickNextDate() async {
              final now = DateTime.now();
              final d = await showDatePicker(
                context: ctx,
                initialDate: now,
                firstDate: now.subtract(const Duration(days: 365)),
                lastDate: now.add(const Duration(days: 365 * 3)),
              );
              if (d != null) {
                setLocal(() => nextFollowUpAt = DateTime(d.year, d.month, d.day, 10));
              }
            }

            Future<void> submit() async {
              if (noteCtrl.text.trim().isEmpty) {
                setLocal(() => error = 'Follow-up note is required.');
                return;
              }
              setLocal(() {
                saving = true;
                error = null;
              });
              var closedSheet = false;
              try {
                await _leadService.addFollowUp(
                  leadId: selectedLeadId,
                  note: noteCtrl.text.trim(),
                  actionType: actionType,
                  nextFollowUpAt: nextFollowUpAt,
                  statusAfter: statusAfter.isEmpty ? null : statusAfter,
                );
                if (!mounted || !ctx.mounted) return;
                Navigator.pop(ctx);
                closedSheet = true;
                await _load();
                if (mounted) setState(() => _tabIndex = 1);
              } catch (e) {
                if (ctx.mounted) setLocal(() => error = _dioErrorMessage(e));
              } finally {
                if (!closedSheet && ctx.mounted) setLocal(() => saving = false);
              }
            }

            return DraggableScrollableSheet(
              initialChildSize: 0.78,
              minChildSize: 0.52,
              maxChildSize: 0.95,
              expand: false,
              builder: (_, scrollController) {
                return Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
                  ),
                  child: ListView(
                    controller: scrollController,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 22),
                    children: [
                      Center(
                        child: Container(
                          width: 42,
                          height: 4,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      const Text('Create Follow-up', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 12),
                      _fieldLabel('Lead'),
                      DropdownButtonFormField<String>(
                        value: selectedLeadId,
                        decoration: _formFieldDecoration(
                          hint: 'Select lead',
                          icon: Icons.person_outline_rounded,
                        ),
                        items: _items
                            .map((e) => DropdownMenuItem(
                                  value: e.id,
                                  child: Text('${e.leadName} - ${e.companyName}'),
                                ))
                            .toList(),
                        onChanged: (v) => setLocal(() => selectedLeadId = v ?? selectedLeadId),
                      ),
                      const SizedBox(height: 10),
                      _fieldLabel('Notes'),
                      TextField(
                        controller: noteCtrl,
                        decoration: _formFieldDecoration(
                          hint: 'Enter follow-up notes',
                          icon: Icons.description_outlined,
                        ),
                        maxLines: 4,
                      ),
                      const SizedBox(height: 10),
                      _fieldLabel('Follow-up type'),
                      DropdownButtonFormField<String>(
                        value: actionType,
                        decoration: _formFieldDecoration(
                          hint: 'Select follow-up type',
                          icon: Icons.call_outlined,
                        ),
                        items: const [
                          DropdownMenuItem(value: 'call', child: Text('Call')),
                          DropdownMenuItem(value: 'visit', child: Text('Visit')),
                          DropdownMenuItem(value: 'message', child: Text('Message')),
                          DropdownMenuItem(value: 'other', child: Text('Other')),
                        ],
                        onChanged: (v) => setLocal(() => actionType = v ?? 'call'),
                      ),
                      const SizedBox(height: 10),
                      _fieldLabel('Status update (optional)'),
                      DropdownButtonFormField<String>(
                        value: statusAfter.isEmpty ? null : statusAfter,
                        decoration: _formFieldDecoration(
                          hint: 'Select status',
                          icon: Icons.flag_outlined,
                        ),
                        items: _statusItems,
                        onChanged: (v) => setLocal(() => statusAfter = v ?? ''),
                      ),
                      const SizedBox(height: 10),
                      _fieldLabel('Next follow-up date'),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              nextFollowUpAt == null
                                  ? 'No next follow-up date'
                                  : 'Next: ${_fmtDateTime(nextFollowUpAt)}',
                            ),
                          ),
                          TextButton(onPressed: pickNextDate, child: const Text('Pick')),
                        ],
                      ),
                      if (error != null) ...[
                        const SizedBox(height: 6),
                        Text(error!, style: const TextStyle(color: Colors.red)),
                      ],
                      const SizedBox(height: 14),
                      FilledButton.icon(
                        onPressed: saving ? null : submit,
                        icon: const Icon(Icons.check_circle_outline_rounded),
                        label: Text(saving ? 'Saving...' : 'Save Follow-up'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.black,
                          minimumSize: const Size.fromHeight(48),
                          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: saving ? null : () => Navigator.pop(ctx),
                        child: const Text('Cancel'),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
    noteCtrl.dispose();
  }

  Future<void> _pickDate({required bool from}) async {
    final now = DateTime.now();
    final initial = from ? (_fromDate ?? now) : (_toDate ?? _fromDate ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (from) {
        _fromDate = picked;
        if (_toDate != null && _toDate!.isBefore(_fromDate!)) _toDate = _fromDate;
      } else {
        _toDate = picked;
      }
      _followUpPage = 1;
    });
    await _load();
  }

  Future<void> _pickLeadListDate({required bool from}) async {
    final now = DateTime.now();
    final initial = from ? (_leadFromDate ?? now) : (_leadToDate ?? _leadFromDate ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (from) {
        _leadFromDate = picked;
        if (_leadToDate != null && _leadToDate!.isBefore(_leadFromDate!)) _leadToDate = _leadFromDate;
      } else {
        _leadToDate = picked;
      }
      _leadsPage = 1;
    });
    await _load();
  }

  void _clearLeadDates() {
    setState(() {
      _leadFromDate = null;
      _leadToDate = null;
      _leadsPage = 1;
    });
    _load();
  }

  void _clearFollowUpDates() {
    setState(() {
      _fromDate = null;
      _toDate = null;
      _followUpPage = 1;
    });
    _load();
  }

  void _openFollowUpDetail(FollowUpFeedItem row) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${row.leadName} · ${row.companyName}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Lead status: ${row.status.replaceAll('_', ' ')}'),
            Text('Type: ${row.followUpType}'),
            Text('Next: ${_fmtDateTime(row.nextFollowUpDate)}'),
            Text('Created: ${_fmtDateTime(row.createdAt)}'),
            Text('Created by: ${row.createdByName.isEmpty ? '--' : row.createdByName}'),
            if ((row.statusAfter ?? '').isNotEmpty) Text('Status updated to: ${row.statusAfter!.replaceAll('_', ' ')}'),
            const SizedBox(height: 8),
            const Text('Notes', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(row.notes.isEmpty ? '--' : row.notes),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: row.leadId)),
                  );
                },
                child: const Text('Open lead'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pagination({
    required int page,
    required int totalItems,
    required ValueChanged<int> onChange,
  }) {
    final totalPages = (totalItems / _pageSize).ceil().clamp(1, 9999);
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        IconButton(
          onPressed: page > 1 ? () => onChange(page - 1) : null,
          icon: const Icon(Icons.chevron_left_rounded),
        ),
        Text('Page $page / $totalPages', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        IconButton(
          onPressed: page < totalPages ? () => onChange(page + 1) : null,
          icon: const Icon(Icons.chevron_right_rounded),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragEnd: (d) => handleMainShellSwipe(d, 3),
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.black,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
          centerTitle: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(bottom: Radius.circular(20)),
          ),
          leading: IconButton(
            onPressed: () => _openAppMenu(context),
            icon: Icon(
              Icons.menu_rounded,
              color: Colors.black.withValues(alpha: 0.85),
            ),
            tooltip: 'Menu',
          ),
          title: const Text(
            'YOUR SALES',
            style: TextStyle(
              color: Colors.black,
              fontSize: 20,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.35,
            ),
          ),
          actions: [
            IconButton(
              onPressed: _tabIndex == 0 ? _showAddLeadDialog : _showAddFollowUpDialog,
              icon: Icon(
                Icons.add_rounded,
                color: Colors.black.withValues(alpha: 0.82),
              ),
              tooltip: _tabIndex == 0 ? 'Add lead' : 'Add follow-up',
            ),
            IconButton(
              onPressed: _load,
              icon: Icon(
                Icons.refresh_rounded,
                color: Colors.black.withValues(alpha: 0.82),
              ),
            ),
            IconButton(
              onPressed: () => setState(() => _filtersOpen = !_filtersOpen),
              icon: Icon(
                Icons.filter_list_rounded,
                color: _filtersOpen ? Colors.black : Colors.black.withValues(alpha: 0.82),
              ),
              tooltip: 'Filters',
            ),
          ],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF6F6F6),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => setState(() => _tabIndex = 0),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: _tabIndex == 0 ? AppColors.primary : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'Leads',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => setState(() => _tabIndex = 1),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: _tabIndex == 1 ? AppColors.primary : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'Follow-up',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Column(
                children: [
                  TextField(
                    controller: _searchCtrl,
                    decoration: InputDecoration(
                      hintText: _tabIndex == 0 ? 'Search company / phone / email' : 'Search lead / company',
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.search_rounded),
                        onPressed: _load,
                      ),
                    ),
                    onSubmitted: (_) => _load(),
                  ),
                  if (_filtersOpen) ...[
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: _status.isEmpty ? null : _status,
                      decoration: const InputDecoration(hintText: 'Lead status'),
                      items: _statusItems,
                      onChanged: (v) {
                        setState(() {
                          _status = v ?? '';
                          _leadsPage = 1;
                          _followUpPage = 1;
                        });
                        _load();
                      },
                    ),
                    if (_tabIndex == 0) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Lead created date (optional)',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade700),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _pickLeadListDate(from: true),
                              child: Text(
                                _leadFromDate == null
                                    ? 'From'
                                    : 'From: ${_leadFromDate!.toLocal().toString().split(' ').first}',
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _pickLeadListDate(from: false),
                              child: Text(
                                _leadToDate == null
                                    ? 'To'
                                    : 'To: ${_leadToDate!.toLocal().toString().split(' ').first}',
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Clear lead dates',
                            onPressed: _clearLeadDates,
                            icon: const Icon(Icons.clear_rounded),
                          ),
                        ],
                      ),
                    ],
                    if (_tabIndex == 1) ...[
                      const SizedBox(height: 8),
                      TextField(
                        controller: _companyCtrl,
                        decoration: InputDecoration(
                          hintText: 'Filter by company name',
                          suffixIcon: IconButton(
                            icon: const Icon(Icons.search_rounded),
                            onPressed: _load,
                          ),
                        ),
                        onSubmitted: (_) => _load(),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Follow-up created date (optional)',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade700),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _pickDate(from: true),
                              child: Text(
                                _fromDate == null
                                    ? 'From'
                                    : 'From: ${_fromDate!.toLocal().toString().split(' ').first}',
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _pickDate(from: false),
                              child: Text(
                                _toDate == null
                                    ? 'To'
                                    : 'To: ${_toDate!.toLocal().toString().split(' ').first}',
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Clear date range',
                            onPressed: _clearFollowUpDates,
                            icon: const Icon(Icons.clear_rounded),
                          ),
                        ],
                      ),
                    ],
                  ],
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error.isNotEmpty
                      ? Center(child: Text(_error))
                      : _tabIndex == 0
                          ? Builder(
                              builder: (_) {
                                if (_items.isEmpty) return const Center(child: Text('No assigned leads'));
                                final total = _items.length;
                                final start = (_leadsPage - 1) * _pageSize;
                                final end = (start + _pageSize).clamp(0, total);
                                final pageItems = _items.sublist(start.clamp(0, total), end);
                                return Column(
                                  children: [
                                    Expanded(
                                      child: ListView.separated(
                                        itemCount: pageItems.length,
                                        separatorBuilder: (_, __) => const Divider(height: 1),
                                        itemBuilder: (_, i) {
                                          final row = pageItems[i];
                                          return ListTile(
                                            title: Text(row.leadName),
                                            subtitle: Text(
                                              '${row.companyName}\n${row.phoneNumber.isNotEmpty ? row.phoneNumber : row.emailId}',
                                            ),
                                            isThreeLine: true,
                                            trailing: Text(
                                              row.status.replaceAll('_', ' '),
                                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                            ),
                                            onTap: () {
                                              Navigator.push(
                                                context,
                                                MaterialPageRoute(
                                                  builder: (_) => LeadDetailScreen(leadId: row.id),
                                                ),
                                              );
                                            },
                                          );
                                        },
                                      ),
                                    ),
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
                                      child: _pagination(
                                        page: _leadsPage,
                                        totalItems: total,
                                        onChange: (p) => setState(() => _leadsPage = p),
                                      ),
                                    ),
                                  ],
                                );
                              },
                            )
                          : Builder(
                              builder: (_) {
                                final rows = _followUpItems;
                                if (rows.isEmpty) return const Center(child: Text('No follow-up history'));
                                final total = rows.length;
                                final start = (_followUpPage - 1) * _pageSize;
                                final end = (start + _pageSize).clamp(0, total);
                                final pageItems = rows.sublist(start.clamp(0, total), end);
                                return Column(
                                  children: [
                                    Expanded(
                                      child: ListView.separated(
                                        itemCount: pageItems.length,
                                        separatorBuilder: (_, __) => const Divider(height: 1),
                                        itemBuilder: (_, i) {
                                          final row = pageItems[i];
                                          return ListTile(
                                            title: Text('${row.leadName} · ${row.companyName}'),
                                            subtitle: Text(
                                              '${row.notesPreview}\n${row.followUpType.toUpperCase()}'
                                              '  |  Next: ${_fmtDateTime(row.nextFollowUpDate)}'
                                              '  |  Added: ${_fmtDateTime(row.createdAt)}'
                                              '  |  By: ${row.createdByName.isEmpty ? '--' : row.createdByName}',
                                            ),
                                            isThreeLine: true,
                                            trailing: Text(
                                              row.status.replaceAll('_', ' '),
                                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                            ),
                                            onTap: () => _openFollowUpDetail(row),
                                          );
                                        },
                                      ),
                                    ),
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
                                      child: _pagination(
                                        page: _followUpPage,
                                        totalItems: total,
                                        onChange: (p) => setState(() => _followUpPage = p),
                                      ),
                                    ),
                                  ],
                                );
                              },
                            ),
            ),
          ],
        ),
        bottomNavigationBar: OvalBottomNavBar(
          currentIndex: 3,
          onTap: (idx) => pushMainShellByIndex(context, idx),
        ),
      ),
    );
  }
}

/// Own [State] + controller [dispose] avoids StatefulBuilder + FormField disposal bugs (`_dependents.isEmpty`).
class _AddLeadBottomSheet extends StatefulWidget {
  const _AddLeadBottomSheet({
    required this.leadService,
    required this.statusMenuItems,
  });

  final LeadService leadService;
  final List<DropdownMenuItem<String>> statusMenuItems;

  @override
  State<_AddLeadBottomSheet> createState() => _AddLeadBottomSheetState();
}

class _AddLeadBottomSheetState extends State<_AddLeadBottomSheet> {
  late final TextEditingController _leadNameCtrl;
  late final TextEditingController _companyCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _sourceCtrl;
  late final TextEditingController _addressCtrl;
  String _status = 'new';
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _leadNameCtrl = TextEditingController();
    _companyCtrl = TextEditingController();
    _emailCtrl = TextEditingController();
    _phoneCtrl = TextEditingController();
    _sourceCtrl = TextEditingController();
    _addressCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _leadNameCtrl.dispose();
    _companyCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _sourceCtrl.dispose();
    _addressCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final leadName = _leadNameCtrl.text.trim();
    final companyName = _companyCtrl.text.trim();
    final email = _emailCtrl.text.trim();
    final phone = _phoneCtrl.text.trim();
    if (leadName.isEmpty || companyName.isEmpty) {
      setState(() => _error = 'Lead name and company name are required.');
      return;
    }
    if (email.isEmpty && phone.isEmpty) {
      setState(() => _error = 'Provide email or phone.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.leadService.createLead(
        leadName: leadName,
        companyName: companyName,
        emailId: email,
        phoneNumber: phone,
        source: _sourceCtrl.text.trim(),
        status: _status,
        addressText: _addressCtrl.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _dioErrorMessage(e);
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.65,
      maxChildSize: 0.96,
      expand: false,
      builder: (_, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 22),
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Add Lead',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 14),
              _leadModalFieldLabel('Lead name'),
              TextField(
                controller: _leadNameCtrl,
                decoration: _leadModalInputDecoration(
                  hint: 'Enter lead name',
                  icon: Icons.person_outline_rounded,
                ),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Company name'),
              TextField(
                controller: _companyCtrl,
                decoration: _leadModalInputDecoration(
                  hint: 'Enter company name',
                  icon: Icons.business_outlined,
                ),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Phone'),
              TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: _leadModalInputDecoration(
                  hint: 'Enter phone number',
                  icon: Icons.phone_outlined,
                ),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Email'),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: _leadModalInputDecoration(
                  hint: 'Enter email address',
                  icon: Icons.email_outlined,
                ),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Source'),
              TextField(
                controller: _sourceCtrl,
                decoration: _leadModalInputDecoration(
                  hint: 'Lead source',
                  icon: Icons.campaign_outlined,
                ),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Status'),
              DropdownButtonFormField<String>(
                value: _status,
                decoration: _leadModalInputDecoration(
                  hint: 'Select status',
                  icon: Icons.flag_outlined,
                ),
                items: widget.statusMenuItems,
                onChanged: _saving
                    ? null
                    : (v) => setState(() => _status = v ?? 'new'),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Address'),
              TextField(
                controller: _addressCtrl,
                maxLines: 2,
                decoration: _leadModalInputDecoration(
                  hint: 'Enter address',
                  icon: Icons.location_on_outlined,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Optional: select on map from lead detail page.',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.black.withValues(alpha: 0.45),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _saving ? null : _submit,
                icon: const Icon(Icons.add_rounded),
                label: Text(_saving ? 'Saving...' : 'Create Lead'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.black,
                  minimumSize: const Size.fromHeight(48),
                  textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                child: const Text('Cancel'),
              ),
            ],
          ),
        );
      },
    );
  }
}
