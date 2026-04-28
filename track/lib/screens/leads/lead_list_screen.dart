import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/lead.dart';
import 'package:track/navigation/main_shell_navigation.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/leads/follow_up_detail_screen.dart';
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
  final ScrollController _followUpDateScrollController = ScrollController();
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
  bool _filtersOpen = false;
  Timer? _leadSuggestDebounce;
  List<LeadItem> _leadSearchSuggestions = const [];
  bool _leadSuggestLoading = false;
  late DateTime _selectedFollowUpDay;
  static const int _followUpStripPastDays = 20;
  static const int _followUpStripDayCount = 41;
  static const double _followUpDayCellWidth = 52;

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
    _selectedFollowUpDay = _dateOnly(DateTime.now());
    _syncFollowUpDateRangeWithSelectedDay();
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
        from: null,
        to: null,
      );
      final followUps = await _leadService.listFollowUps(
        search: _searchCtrl.text.trim(),
        companyName: _companyCtrl.text.trim(),
        status: _status,
        // Date filtering is applied client-side by effective follow-up date:
        // nextFollowUpDate (assigned) fallback createdAt.
        from: null,
        to: null,
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
      if (mounted) {
        setState(() => _loading = false);
        if (_tabIndex == 1) {
          _scheduleScrollFollowUpStripToSelectedDay();
        }
      }
    }
  }

  @override
  void dispose() {
    _leadSuggestDebounce?.cancel();
    _searchCtrl.dispose();
    _companyCtrl.dispose();
    _followUpDateScrollController.dispose();
    super.dispose();
  }

  void _muteLeadSuggestionsOnly() {
    _leadSuggestDebounce?.cancel();
    _leadSearchSuggestions = const [];
    _leadSuggestLoading = false;
  }

  void _clearLeadSearchSuggestions() {
    _muteLeadSuggestionsOnly();
    setState(() {});
  }

  void _onLeadSearchQueryChanged(String value) {
    _leadSuggestDebounce?.cancel();
    if (_tabIndex != 0) return;
    final q = value.trim();
    if (q.length < 2) {
      setState(() {
        _leadSearchSuggestions = const [];
        _leadSuggestLoading = false;
      });
      return;
    }
    setState(() => _leadSuggestLoading = true);
    _leadSuggestDebounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final list = await _leadService.listLeads(
          search: q,
          status: _status,
          from: null,
          to: null,
        );
        if (!mounted) return;
        setState(() {
          _leadSearchSuggestions = list.where((e) => e.status.trim().toLowerCase() != 'customer').take(20).toList();
          _leadSuggestLoading = false;
        });
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _leadSearchSuggestions = const [];
          _leadSuggestLoading = false;
        });
      }
    });
  }

  void _selectLeadSearchSuggestion(LeadItem e) {
    FocusScope.of(context).unfocus();
    _clearLeadSearchSuggestions();
    setState(() {
      _searchCtrl.text = '${e.leadName} ${e.companyName}'.trim();
      _leadsPage = 1;
    });
    _load();
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  DateTime _followUpStripRangeStart() =>
      _dateOnly(DateTime.now()).subtract(const Duration(days: _followUpStripPastDays));

  void _syncFollowUpDateRangeWithSelectedDay() {
    final day = _dateOnly(_selectedFollowUpDay);
    _fromDate = day;
    _toDate = day.add(const Duration(hours: 23, minutes: 59, seconds: 59));
  }

  int _dayIndexInFollowUpStrip(DateTime day) {
    final start = _followUpStripRangeStart();
    return _dateOnly(day).difference(start).inDays.clamp(0, _followUpStripDayCount - 1);
  }

  void _scrollFollowUpStripToSelectedDay() {
    final c = _followUpDateScrollController;
    if (!c.hasClients) return;
    final idx = _dayIndexInFollowUpStrip(_selectedFollowUpDay);
    final maxScroll = c.position.maxScrollExtent;
    final cell = _followUpDayCellWidth;
    final target = (idx * cell - 56).clamp(0.0, maxScroll);
    c.jumpTo(target);
  }

  void _scheduleScrollFollowUpStripToSelectedDay() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_followUpDateScrollController.hasClients) {
        _scrollFollowUpStripToSelectedDay();
      } else {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _scrollFollowUpStripToSelectedDay();
        });
      }
    });
  }

  Widget _followUpDayCell(DateTime day) {
    final isSelected = _dateOnly(day) == _dateOnly(_selectedFollowUpDay);
    final isToday = _dateOnly(day) == _dateOnly(DateTime.now());
    final label = DateFormat('EEE').format(day).substring(0, 2).toUpperCase();
    return InkWell(
      onTap: () async {
        setState(() {
          _selectedFollowUpDay = _dateOnly(day);
          _syncFollowUpDateRangeWithSelectedDay();
          _followUpPage = 1;
        });
        await _load();
        if (mounted) _scheduleScrollFollowUpStripToSelectedDay();
      },
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: isSelected ? AppColors.primary : Colors.black45,
              ),
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
                border: !isSelected && isToday
                    ? Border.all(color: AppColors.primary.withValues(alpha: 0.55), width: 1.5)
                    : null,
              ),
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: isSelected ? Colors.black : Colors.black87,
                ),
              ),
            ),
            if (isToday)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  'Today',
                  style: TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w800,
                    color: isSelected ? Colors.black87 : Colors.black54,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _followUpDateStrip() {
    final start = _followUpStripRangeStart();
    final days = List.generate(_followUpStripDayCount, (i) => start.add(Duration(days: i)));
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
      child: Material(
        elevation: 6,
        shadowColor: Colors.black26,
        borderRadius: BorderRadius.circular(18),
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          child: SingleChildScrollView(
            controller: _followUpDateScrollController,
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final d in days)
                  SizedBox(
                    width: _followUpDayCellWidth,
                    child: _followUpDayCell(d),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
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

  String _fmtDateRangeSummary(DateTime? from, DateTime? to) {
    if (from == null && to == null) return 'Date: —';
    final df = DateFormat.yMMMd();
    final a = from != null ? df.format(from.toLocal()) : '…';
    final b = to != null ? df.format(to.toLocal()) : '…';
    if (from != null &&
        to != null &&
        _dateOnly(from) == _dateOnly(to)) {
      return 'Date: $a';
    }
    return 'Date: $a – $b';
  }

  String _statusDisplayLabel(String code) {
    if (code.isEmpty) return 'All statuses';
    for (final e in _statusItems) {
      if (e.value == code) {
        final w = e.child;
        if (w is Text) return w.data ?? code;
      }
    }
    return code.replaceAll('_', ' ');
  }

  bool get _followUpFiltersActive =>
      _tabIndex == 1 &&
      (_status.isNotEmpty || _companyCtrl.text.trim().isNotEmpty);

  void _openFollowUpFilterSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _FollowUpFiltersBottomSheet(
        appliedStatus: _status,
        appliedCompany: _companyCtrl.text,
        appliedFrom: _fromDate,
        appliedTo: _toDate,
        stripDay: _selectedFollowUpDay,
        statusItems: _statusItems,
        fmtDateRangeSummary: _fmtDateRangeSummary,
        statusDisplayLabel: _statusDisplayLabel,
        onApply: (status, company, rangeStart, rangeEnd) {
          if (!mounted) return;
          setState(() {
            _status = status;
            _companyCtrl.text = company;
            _fromDate = rangeStart;
            _toDate = rangeEnd;
            _followUpPage = 1;
          });
          _load();
        },
      ),
    );
  }

  List<FollowUpFeedItem> get _visibleFollowUpItems {
    final day = _dateOnly(_selectedFollowUpDay);
    bool scheduledOnSelectedDay(FollowUpFeedItem f) {
      final n = f.nextFollowUpDate;
      if (n == null) return false;
      return _dateOnly(n) == day;
    }

    int compareForDay(FollowUpFeedItem a, FollowUpFeedItem b) {
      final aSch = scheduledOnSelectedDay(a);
      final bSch = scheduledOnSelectedDay(b);
      if (aSch != bSch) return aSch ? -1 : 1;
      if (aSch && bSch) {
        final an = a.nextFollowUpDate!;
        final bn = b.nextFollowUpDate!;
        final byNext = an.compareTo(bn);
        if (byNext != 0) return byNext;
      }
      final ac = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bc = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bc.compareTo(ac);
    }

    final list = _followUpItems.where((f) {
      final effectiveDate = f.nextFollowUpDate ?? f.createdAt;
      if (_fromDate != null && effectiveDate != null && effectiveDate.isBefore(_fromDate!)) {
        return false;
      }
      if (_toDate != null && effectiveDate != null) {
        final toEnd = DateTime(
          _toDate!.year,
          _toDate!.month,
          _toDate!.day,
          23,
          59,
          59,
        );
        if (effectiveDate.isAfter(toEnd)) return false;
      }
      return true;
    }).toList()
      ..sort(compareForDay);
    return list;
  }

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
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddLeadFollowUpBottomSheet(
        leadService: _leadService,
        leads: _items,
        statusItems: _statusItems,
        fmtDateTime: _fmtDateTime,
      ),
    );
    if (saved == true && mounted) {
      await _load();
      if (mounted) setState(() => _tabIndex = 1);
    }
  }

  Future<void> _openFollowUpDetail(FollowUpFeedItem row) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => FollowUpDetailScreen(item: row)),
    );
    if (changed == true && mounted) await _load();
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
            'YOUR LEADS',
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
              onPressed: () {
                if (_tabIndex == 1) {
                  _openFollowUpFilterSheet();
                } else {
                  setState(() => _filtersOpen = !_filtersOpen);
                }
              },
              icon: Icon(
                Icons.filter_list_rounded,
                color: (_tabIndex == 0 && _filtersOpen) || (_tabIndex == 1 && _followUpFiltersActive)
                    ? Colors.black
                    : Colors.black.withValues(alpha: 0.82),
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
                        onTap: () {
                          setState(() {
                            _muteLeadSuggestionsOnly();
                            _tabIndex = 0;
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: _tabIndex == 0 ? AppColors.primary : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'Leads',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color: _tabIndex == 0 ? Colors.black : Colors.black87,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () {
                          setState(() {
                            _muteLeadSuggestionsOnly();
                            _tabIndex = 1;
                            _filtersOpen = false;
                            _selectedFollowUpDay = _dateOnly(DateTime.now());
                            _syncFollowUpDateRangeWithSelectedDay();
                            _followUpPage = 1;
                          });
                          _load();
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: _tabIndex == 1 ? AppColors.primary : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'Follow-up',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color: _tabIndex == 1 ? Colors.black : Colors.black87,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_tabIndex == 1) _followUpDateStrip(),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Column(
                children: [
                  if (_tabIndex == 0) ...[
                    TextField(
                      controller: _searchCtrl,
                      style: const TextStyle(color: Colors.black),
                      decoration: InputDecoration(
                        hintText: 'Search leads — type 2+ letters to see matches',
                        hintStyle: TextStyle(color: Colors.black.withValues(alpha: 0.45)),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.search_rounded, color: Colors.black54),
                          onPressed: _load,
                        ),
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onChanged: _onLeadSearchQueryChanged,
                      onSubmitted: (_) {
                        _clearLeadSearchSuggestions();
                        _load();
                      },
                    ),
                    if (_leadSuggestLoading || _leadSearchSuggestions.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Material(
                          elevation: 3,
                          borderRadius: BorderRadius.circular(12),
                          color: Colors.white,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxHeight: 220),
                            child: _leadSuggestLoading && _leadSearchSuggestions.isEmpty
                                ? const SizedBox(
                                    height: 52,
                                    child: Center(
                                      child: SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      ),
                                    ),
                                  )
                                : ListView.separated(
                                    shrinkWrap: true,
                                    padding: EdgeInsets.zero,
                                    itemCount: _leadSearchSuggestions.length,
                                    separatorBuilder: (_, __) => Divider(height: 1, color: Colors.grey.shade200),
                                    itemBuilder: (_, i) {
                                      final e = _leadSearchSuggestions[i];
                                      return ListTile(
                                        dense: true,
                                        title: Text(
                                          e.leadName,
                                          style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.black),
                                        ),
                                        subtitle: Text(
                                          '${e.companyName} · ${e.phoneNumber.isNotEmpty ? e.phoneNumber : e.emailId}',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(color: Colors.black87, fontSize: 12),
                                        ),
                                        onTap: () => _selectLeadSearchSuggestion(e),
                                      );
                                    },
                                  ),
                          ),
                        ),
                      ),
                  ] else
                    TextField(
                      controller: _searchCtrl,
                      style: const TextStyle(color: Colors.black),
                      decoration: InputDecoration(
                        hintText: 'Search lead / company',
                        hintStyle: TextStyle(color: Colors.black.withValues(alpha: 0.45)),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.search_rounded, color: Colors.black54),
                          onPressed: _load,
                        ),
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onSubmitted: (_) => _load(),
                    ),
                  if (_filtersOpen) ...[
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: _status.isEmpty ? null : _status,
                      decoration: const InputDecoration(
                        hintText: 'Lead status',
                        hintStyle: TextStyle(color: Colors.black54),
                      ),
                      dropdownColor: Colors.white,
                      style: const TextStyle(color: Colors.black),
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
                                          final statusText = row.status.replaceAll('_', ' ');
                                          return Card(
                                            margin: const EdgeInsets.fromLTRB(10, 6, 10, 6),
                                            elevation: 0,
                                            shape: RoundedRectangleBorder(
                                              borderRadius: BorderRadius.circular(14),
                                              side: BorderSide(color: Colors.black.withValues(alpha: 0.08)),
                                            ),
                                            child: ListTile(
                                              leading: Container(
                                                padding: const EdgeInsets.all(8),
                                                decoration: BoxDecoration(
                                                  color: AppColors.primary.withValues(alpha: 0.2),
                                                  borderRadius: BorderRadius.circular(10),
                                                ),
                                                child: const Icon(Icons.person_outline_rounded),
                                              ),
                                              title: Text(
                                                row.leadName,
                                                style: const TextStyle(fontWeight: FontWeight.w800),
                                              ),
                                              subtitle: Text(
                                                '${row.companyName}\n${row.phoneNumber.isNotEmpty ? row.phoneNumber : row.emailId}',
                                              ),
                                              isThreeLine: true,
                                              trailing: Container(
                                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                                decoration: BoxDecoration(
                                                  color: AppColors.primary.withValues(alpha: 0.18),
                                                  borderRadius: BorderRadius.circular(999),
                                                ),
                                                child: Text(
                                                  statusText,
                                                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                                                ),
                                              ),
                                              onTap: () {
                                                Navigator.push(
                                                  context,
                                                  MaterialPageRoute(
                                                    builder: (_) => LeadDetailScreen(leadId: row.id),
                                                  ),
                                                );
                                              },
                                            ),
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
                                final rows = _visibleFollowUpItems;
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
                                          return Card(
                                            margin: const EdgeInsets.fromLTRB(10, 6, 10, 6),
                                            elevation: 0,
                                            shape: RoundedRectangleBorder(
                                              borderRadius: BorderRadius.circular(14),
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
                                                  row.followUpType == 'visit'
                                                      ? Icons.storefront_rounded
                                                      : row.followUpType == 'message'
                                                          ? Icons.chat_bubble_outline_rounded
                                                          : Icons.call_outlined,
                                                ),
                                              ),
                                              title: Text(
                                                '${row.leadName} · ${row.companyName}',
                                                style: const TextStyle(fontWeight: FontWeight.w800),
                                              ),
                                              subtitle: Text(
                                                '${row.notesPreview}\n${row.followUpType.toUpperCase()}'
                                                '  |  Next: ${_fmtDateTime(row.nextFollowUpDate)}',
                                              ),
                                              isThreeLine: true,
                                              trailing: Icon(
                                                Icons.chevron_right_rounded,
                                                color: Colors.grey.shade500,
                                              ),
                                              onTap: () => _openFollowUpDetail(row),
                                            ),
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

class _FollowUpFiltersBottomSheet extends StatefulWidget {
  const _FollowUpFiltersBottomSheet({
    required this.appliedStatus,
    required this.appliedCompany,
    required this.appliedFrom,
    required this.appliedTo,
    required this.stripDay,
    required this.statusItems,
    required this.fmtDateRangeSummary,
    required this.statusDisplayLabel,
    required this.onApply,
  });

  final String appliedStatus;
  final String appliedCompany;
  final DateTime? appliedFrom;
  final DateTime? appliedTo;
  final DateTime stripDay;
  final List<DropdownMenuItem<String>> statusItems;
  final String Function(DateTime?, DateTime?) fmtDateRangeSummary;
  final String Function(String) statusDisplayLabel;
  final void Function(String status, String company, DateTime rangeStart, DateTime rangeEnd) onApply;

  @override
  State<_FollowUpFiltersBottomSheet> createState() => _FollowUpFiltersBottomSheetState();
}

class _FollowUpFiltersBottomSheetState extends State<_FollowUpFiltersBottomSheet> {
  late String _draftStatus;
  late TextEditingController _customerCtrl;
  DateTime? _draftFrom;
  DateTime? _draftTo;

  static DateTime _dOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  @override
  void initState() {
    super.initState();
    _draftStatus = widget.appliedStatus;
    _customerCtrl = TextEditingController(text: widget.appliedCompany);
    _draftFrom = widget.appliedFrom != null ? _dOnly(widget.appliedFrom!) : _dOnly(widget.stripDay);
    _draftTo = widget.appliedTo != null ? _dOnly(widget.appliedTo!) : _dOnly(widget.stripDay);
  }

  @override
  void dispose() {
    _customerCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDraftDate({required bool from}) async {
    final now = DateTime.now();
    final initial = from ? (_draftFrom ?? now) : (_draftTo ?? _draftFrom ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 3),
      lastDate: DateTime(now.year + 3),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (from) {
        _draftFrom = _dOnly(picked);
        if (_draftTo != null && _draftTo!.isBefore(_draftFrom!)) {
          _draftTo = _draftFrom;
        }
      } else {
        _draftTo = _dOnly(picked);
        if (_draftFrom != null && _draftTo!.isBefore(_draftFrom!)) {
          _draftFrom = _draftTo;
        }
      }
    });
  }

  void _apply() {
    final from = _draftFrom ?? _dOnly(widget.stripDay);
    var to = _draftTo ?? from;
    if (to.isBefore(from)) to = from;
    final start = DateTime(from.year, from.month, from.day);
    final end = DateTime(to.year, to.month, to.day, 23, 59, 59, 999);
    widget.onApply(_draftStatus, _customerCtrl.text.trim(), start, end);
    Navigator.of(context).pop();
  }

  InputDecoration _filterDec(String hint, [IconData? icon]) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Colors.black45),
      prefixIcon: icon == null ? null : Icon(icon, size: 20, color: Colors.black54),
      filled: true,
      fillColor: const Color(0xFFF3F4F6),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
        borderSide: const BorderSide(color: Colors.black87, width: 1.2),
      ),
    );
  }

  /// Today + all statuses + all companies: treat as default, hide applied chips entirely.
  bool get _hideAppliedBlockEntirely {
    final today = _dOnly(DateTime.now());
    if (_draftStatus.isNotEmpty || _customerCtrl.text.trim().isNotEmpty) return false;
    if (_draftFrom == null || _draftTo == null) return false;
    return _dOnly(_draftFrom!) == today && _dOnly(_draftTo!) == today;
  }

  List<Widget> _removableAppliedChips() {
    if (_hideAppliedBlockEntirely) return const [];
    final today = _dOnly(DateTime.now());
    final chips = <Widget>[];
    final dateIsTodayOnly =
        _draftFrom != null && _draftTo != null && _dOnly(_draftFrom!) == today && _dOnly(_draftTo!) == today;
    if (!dateIsTodayOnly) {
      chips.add(InputChip(
        label: Text(
          widget.fmtDateRangeSummary(_draftFrom, _draftTo),
          style: const TextStyle(color: Colors.black, fontSize: 13),
        ),
        deleteIcon: const Icon(Icons.close, size: 18, color: Colors.black54),
        onDeleted: () => setState(() {
          final d = _dOnly(widget.stripDay);
          _draftFrom = d;
          _draftTo = d;
        }),
        backgroundColor: const Color(0xFFE8E8E8),
        side: const BorderSide(color: Colors.black26),
        padding: const EdgeInsets.symmetric(horizontal: 4),
      ));
    }
    if (_draftStatus.isNotEmpty) {
      chips.add(InputChip(
        label: Text(
          widget.statusDisplayLabel(_draftStatus),
          style: const TextStyle(color: Colors.black, fontSize: 13),
        ),
        deleteIcon: const Icon(Icons.close, size: 18, color: Colors.black54),
        onDeleted: () => setState(() => _draftStatus = ''),
        backgroundColor: const Color(0xFFE8E8E8),
        side: const BorderSide(color: Colors.black26),
        padding: const EdgeInsets.symmetric(horizontal: 4),
      ));
    }
    if (_customerCtrl.text.trim().isNotEmpty) {
      chips.add(InputChip(
        label: Text(
          _customerCtrl.text.trim(),
          style: const TextStyle(color: Colors.black, fontSize: 13),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        deleteIcon: const Icon(Icons.close, size: 18, color: Colors.black54),
        onDeleted: () => setState(() => _customerCtrl.clear()),
        backgroundColor: const Color(0xFFE8E8E8),
        side: const BorderSide(color: Colors.black26),
        padding: const EdgeInsets.symmetric(horizontal: 4),
      ));
    }
    return chips;
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.paddingOf(context).bottom + 8;
    final appliedChips = _removableAppliedChips();
    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.42,
      maxChildSize: 0.92,
      expand: false,
      builder: (_, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          ),
          child: ListView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(16, 10, 16, bottomPad + 12),
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
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _pickDraftDate(from: true),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.black,
                        side: const BorderSide(color: Colors.black26),
                      ),
                      child: Text(
                        _draftFrom == null
                            ? 'From'
                            : 'From: ${_draftFrom!.toLocal().toString().split(' ').first}',
                        style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _pickDraftDate(from: false),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.black,
                        side: const BorderSide(color: Colors.black26),
                      ),
                      child: Text(
                        _draftTo == null
                            ? 'To'
                            : 'To: ${_draftTo!.toLocal().toString().split(' ').first}',
                        style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ],
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () {
                    setState(() {
                      final d = _dOnly(widget.stripDay);
                      _draftFrom = d;
                      _draftTo = d;
                    });
                  },
                  icon: const Icon(Icons.today_outlined, size: 20, color: Colors.black87),
                  label: const Text(
                    'Match calendar strip day',
                    style: TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              if (appliedChips.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: appliedChips),
              ],
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: _draftStatus.isEmpty ? '' : _draftStatus,
                decoration: _filterDec('Status', Icons.flag_outlined),
                dropdownColor: Colors.white,
                style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w500),
                items: widget.statusItems,
                onChanged: (v) => setState(() => _draftStatus = v ?? ''),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _customerCtrl,
                onChanged: (_) => setState(() {}),
                style: const TextStyle(color: Colors.black),
                decoration: _filterDec('Company / customer name', Icons.business_outlined),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        setState(() {
                          _draftStatus = '';
                          _customerCtrl.clear();
                          final d = _dOnly(widget.stripDay);
                          _draftFrom = d;
                          _draftTo = d;
                        });
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.black,
                        side: const BorderSide(color: Colors.black26),
                      ),
                      child: const Text('Clear', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: _apply,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.black,
                      ),
                      child: const Text('Apply filter', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
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

/// Dedicated stateful follow-up sheet to avoid StatefulBuilder/form disposal races.
class _AddLeadFollowUpBottomSheet extends StatefulWidget {
  const _AddLeadFollowUpBottomSheet({
    required this.leadService,
    required this.leads,
    required this.statusItems,
    required this.fmtDateTime,
  });

  final LeadService leadService;
  final List<LeadItem> leads;
  final List<DropdownMenuItem<String>> statusItems;
  final String Function(DateTime?) fmtDateTime;

  @override
  State<_AddLeadFollowUpBottomSheet> createState() =>
      _AddLeadFollowUpBottomSheetState();
}

class _AddLeadFollowUpBottomSheetState
    extends State<_AddLeadFollowUpBottomSheet> {
  late final TextEditingController _noteCtrl;
  late String _selectedLeadId;
  String _actionType = 'call';
  String _statusAfter = '';
  DateTime? _nextFollowUpAt;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _noteCtrl = TextEditingController();
    _selectedLeadId = widget.leads.first.id;
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickNextDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 365 * 3)),
    );
    if (!mounted || d == null) return;
    setState(() => _nextFollowUpAt = DateTime(d.year, d.month, d.day, 10));
  }

  Future<void> _submit() async {
    if (_noteCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Follow-up note is required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.leadService.addFollowUp(
        leadId: _selectedLeadId,
        note: _noteCtrl.text.trim(),
        actionType: _actionType,
        nextFollowUpAt: _nextFollowUpAt,
        statusAfter: _statusAfter.isEmpty ? null : _statusAfter,
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
              _leadModalFieldLabel('Lead'),
              DropdownButtonFormField<String>(
                value: _selectedLeadId,
                decoration: _leadModalInputDecoration(
                  hint: 'Select lead',
                  icon: Icons.person_outline_rounded,
                ),
                items: widget.leads
                    .map((e) => DropdownMenuItem(
                          value: e.id,
                          child: Text('${e.leadName} - ${e.companyName}'),
                        ))
                    .toList(),
                onChanged: _saving
                    ? null
                    : (v) => setState(() => _selectedLeadId = v ?? _selectedLeadId),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Notes'),
              TextField(
                controller: _noteCtrl,
                decoration: _leadModalInputDecoration(
                  hint: 'Enter follow-up notes',
                  icon: Icons.description_outlined,
                ),
                maxLines: 4,
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Follow-up type'),
              DropdownButtonFormField<String>(
                value: _actionType,
                decoration: _leadModalInputDecoration(
                  hint: 'Select follow-up type',
                  icon: Icons.call_outlined,
                ),
                items: const [
                  DropdownMenuItem(value: 'call', child: Text('Call')),
                  DropdownMenuItem(value: 'visit', child: Text('Visit')),
                  DropdownMenuItem(value: 'message', child: Text('Message')),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: _saving ? null : (v) => setState(() => _actionType = v ?? 'call'),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Status update (optional)'),
              DropdownButtonFormField<String>(
                value: _statusAfter.isEmpty ? null : _statusAfter,
                decoration: _leadModalInputDecoration(
                  hint: 'Select status',
                  icon: Icons.flag_outlined,
                ),
                items: widget.statusItems,
                onChanged: _saving ? null : (v) => setState(() => _statusAfter = v ?? ''),
              ),
              const SizedBox(height: 10),
              _leadModalFieldLabel('Next follow-up date'),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _nextFollowUpAt == null
                          ? 'No next follow-up date'
                          : 'Next: ${widget.fmtDateTime(_nextFollowUpAt)}',
                    ),
                  ),
                  TextButton(onPressed: _saving ? null : _pickNextDate, child: const Text('Pick')),
                ],
              ),
              if (_error != null) ...[
                const SizedBox(height: 6),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _saving ? null : _submit,
                icon: const Icon(Icons.check_circle_outline_rounded),
                label: Text(_saving ? 'Saving...' : 'Save Follow-up'),
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
