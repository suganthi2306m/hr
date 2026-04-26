import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/customer.dart';
import 'package:track/models/customer_followup_feed.dart';
import 'package:track/navigation/main_shell_navigation.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/customers/customer_detail_tabs_screen.dart';
import 'package:track/screens/geo/add_customer_screen.dart';
import 'package:track/screens/geo/add_task_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/services/customer_service.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/location_loader.dart';

/// Company customers (all) + your customer follow-ups (`followupCustomer` on API).
class CompanyCustomersScreen extends StatefulWidget {
  const CompanyCustomersScreen({super.key});

  @override
  State<CompanyCustomersScreen> createState() => _CompanyCustomersScreenState();
}

class _CompanyCustomersScreenState extends State<CompanyCustomersScreen>
    with MainShellSwipeNavigation {
  final CustomerService _customerService = CustomerService();
  final TextEditingController _searchCtrl = TextEditingController();
  final ScrollController _followUpDateScrollController = ScrollController();

  List<Customer> _customers = const [];
  List<CustomerFollowUpFeedItem> _followUps = const [];
  bool _loadingCustomers = true;
  bool _loadingFollowUps = false;
  String? _error;
  String? _userId;
  String _companyLine = 'Customers';

  int _tabIndex = 0;
  bool _customerSortAsc = true;
  String _fuStatus = '';
  String _fuType = '';
  String _fuCustomerId = '';
  DateTime? _fromDate;
  DateTime? _toDate;
  late DateTime _selectedFollowUpDay;

  static const int _followUpStripPastDays = 20;
  static const int _followUpStripDayCount = 41;
  static const double _followUpDayCellWidth = 52;

  static const List<DropdownMenuItem<String>> _fuStatusItems = [
    DropdownMenuItem(value: '', child: Text('All')),
    DropdownMenuItem(value: 'pending', child: Text('Upcoming (next date)')),
    DropdownMenuItem(value: 'overdue', child: Text('Overdue next date')),
    DropdownMenuItem(value: 'none', child: Text('No next date')),
  ];

  static const List<DropdownMenuItem<String>> _fuTypeItems = [
    DropdownMenuItem(value: '', child: Text('All types')),
    DropdownMenuItem(value: 'call', child: Text('Call')),
    DropdownMenuItem(value: 'visit', child: Text('Visit')),
    DropdownMenuItem(value: 'message', child: Text('Message')),
    DropdownMenuItem(value: 'other', child: Text('Other')),
  ];

  @override
  void initState() {
    super.initState();
    _selectedFollowUpDay = _dateOnly(DateTime.now());
    _syncFollowUpDateRangeWithSelectedDay();
    _bootstrap();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _followUpDateScrollController.dispose();
    super.dispose();
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static bool _sameCalendarDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  DateTime _followUpStripRangeStart() =>
      _dateOnly(DateTime.now()).subtract(const Duration(days: _followUpStripPastDays));

  int? _indexInFollowUpStrip(DateTime day) {
    final start = _followUpStripRangeStart();
    final idx = _dateOnly(day).difference(start).inDays;
    if (idx < 0 || idx >= _followUpStripDayCount) return null;
    return idx;
  }

  void _scheduleScrollFollowUpStripToDate(DateTime day) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _scrollFollowUpStripDateToCenter(day);
    });
  }

  void _scrollFollowUpStripDateToCenter(DateTime day) {
    if (!_followUpDateScrollController.hasClients) return;
    final idx = _indexInFollowUpStrip(day);
    if (idx == null) return;
    final viewport = _followUpDateScrollController.position.viewportDimension;
    final maxExtent = _followUpDateScrollController.position.maxScrollExtent;
    final cellCenter = idx * _followUpDayCellWidth + _followUpDayCellWidth / 2;
    final offset = (cellCenter - viewport / 2).clamp(0.0, maxExtent);
    _followUpDateScrollController.jumpTo(offset);
  }

  void _syncFollowUpDateRangeWithSelectedDay() {
    final day = _dateOnly(_selectedFollowUpDay);
    _fromDate = day;
    _toDate = day.add(const Duration(hours: 23, minutes: 59, seconds: 59));
  }

  Future<void> _readUserLine() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('user');
    if (raw != null && raw.isNotEmpty) {
      final map = jsonDecode(raw);
      if (map is Map) {
        final id = map['_id'] ?? map['id'] ?? map['userId'];
        if (id != null) {
          _userId = id is String ? id : id.toString();
        }
        final cn = (map['companyName'] ?? map['company']?['name'])?.toString().trim();
        if (cn != null && cn.isNotEmpty) {
          _companyLine = cn;
        }
      }
    }
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loadingCustomers = true;
      _error = null;
    });
    try {
      await _readUserLine();
      final list = await _customerService.getAllCustomers();
      if (!mounted) return;
      setState(() {
        _customers = list;
        _loadingCustomers = false;
      });
      if (_tabIndex == 1) await _loadFollowUps();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loadingCustomers = false;
      });
    }
  }

  Future<void> _loadFollowUps() async {
    setState(() {
      _loadingFollowUps = true;
      _error = null;
    });
    try {
      final list = await _customerService.listCustomerFollowUps(
        search: _searchCtrl.text.trim(),
        status: _fuStatus,
        // Date filtering is applied client-side by effective follow-up date:
        // nextFollowUpDate (assigned) fallback createdAt.
        from: null,
        to: null,
      );
      if (!mounted) return;
      setState(() {
        _followUps = list;
        _loadingFollowUps = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loadingFollowUps = false;
      });
    }
  }

  List<CustomerFollowUpFeedItem> get _visibleFollowUps {
    final query = _searchCtrl.text.trim().toLowerCase();
    return _followUps.where((f) {
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
      if (_fuCustomerId.isNotEmpty && f.customerId != _fuCustomerId) return false;
      if (_fuType.isNotEmpty && f.followUpType.toLowerCase() != _fuType.toLowerCase()) {
        return false;
      }
      if (_fuStatus == 'none' && f.nextFollowUpDate != null) return false;
      if (query.isNotEmpty) {
        final match = f.customerName.toLowerCase().contains(query) ||
            f.companyName.toLowerCase().contains(query) ||
            f.notes.toLowerCase().contains(query) ||
            f.notesPreview.toLowerCase().contains(query);
        if (!match) return false;
      }
      return true;
    }).toList();
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
    });
    if (_tabIndex == 1) await _loadFollowUps();
  }

  void _clearDates() {
    setState(() {
      _fromDate = null;
      _toDate = null;
    });
    if (_tabIndex == 1) _loadFollowUps();
  }

  List<Customer> get _visibleCustomers {
    final q = _searchCtrl.text.trim().toLowerCase();
    final out = _customers.where((c) {
      final cn = (c.companyName ?? '').toLowerCase();
      final em = (c.emailId ?? c.email ?? '').toLowerCase();
      final ph = (c.customerNumber ?? '').toLowerCase();
      return c.customerName.toLowerCase().contains(q) || cn.contains(q) || em.contains(q) || ph.contains(q);
    }).toList();
    out.sort(
      (a, b) => _customerSortAsc
          ? a.customerName.toLowerCase().compareTo(b.customerName.toLowerCase())
          : b.customerName.toLowerCase().compareTo(a.customerName.toLowerCase()),
    );
    return out;
  }

  String _fmtDateTime(DateTime? dt) {
    if (dt == null) return '--';
    final l = dt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(l.day)}/${two(l.month)}/${l.year} ${two(l.hour)}:${two(l.minute)}';
  }

  String _fmtDateOnly(DateTime dt) => DateFormat('dd MMM yyyy').format(dt.toLocal());


  IconData _followUpTypeIcon(String type) {
    switch (type.toLowerCase()) {
      case 'visit':
        return Icons.storefront_rounded;
      case 'message':
        return Icons.chat_bubble_outline_rounded;
      case 'call':
      default:
        return Icons.call_rounded;
    }
  }

  void _onTopAddPressed() {
    if (_tabIndex == 0) {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AddCustomerScreen()),
      ).then((_) => _bootstrap());
      return;
    }
    _showAddCustomerFollowUp();
  }

  Future<void> _openCustomerFilterSheet() async {
    var tempAsc = _customerSortAsc;
    final apply = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Customer filters',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              RadioListTile<bool>(
                value: true,
                groupValue: tempAsc,
                onChanged: (v) {
                  if (v == null) return;
                  setSheetState(() => tempAsc = v);
                },
                title: const Text('Sort name A → Z'),
              ),
              RadioListTile<bool>(
                value: false,
                groupValue: tempAsc,
                onChanged: (v) {
                  if (v == null) return;
                  setSheetState(() => tempAsc = v);
                },
                title: const Text('Sort name Z → A'),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () {
                    _searchCtrl.clear();
                    Navigator.pop(ctx, true);
                  },
                  icon: const Icon(Icons.clear_rounded),
                  label: const Text('Clear search'),
                ),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Apply'),
              ),
            ],
          ),
        ),
      ),
    );
    if (apply != true || !mounted) return;
    setState(() => _customerSortAsc = tempAsc);
  }


  Future<void> _openFollowUpFiltersSheet() async {
    var tempCustomerId = _fuCustomerId;
    var tempStatus = _fuStatus;
    var tempType = _fuType;
    var tempFrom = _fromDate;
    var tempTo = _toDate;

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
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
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Follow-up filters',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Colors.black,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          icon: const Icon(Icons.close_rounded, color: Colors.black),
                          tooltip: 'Close',
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: tempCustomerId.isEmpty ? null : tempCustomerId,
                      decoration: const InputDecoration(
                        labelText: 'Customer',
                        border: OutlineInputBorder(),
                        labelStyle: TextStyle(color: Colors.black),
                        hintStyle: TextStyle(color: Colors.black54),
                      ),
                      style: const TextStyle(color: Colors.black),
                      dropdownColor: Colors.white,
                      iconEnabledColor: Colors.black,
                      items: [
                        const DropdownMenuItem(value: '', child: Text('All customers')),
                        ..._customers
                            .where((c) => (c.id ?? '').isNotEmpty)
                            .map(
                              (c) => DropdownMenuItem(
                                value: c.id,
                                child: Text(
                                  '${c.customerName} · ${c.companyName ?? ''}',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                      ],
                      onChanged: (v) => setSheetState(() => tempCustomerId = v ?? ''),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: tempStatus.isEmpty ? null : tempStatus,
                      decoration: const InputDecoration(
                        labelText: 'Status',
                        border: OutlineInputBorder(),
                        labelStyle: TextStyle(color: Colors.black),
                        hintStyle: TextStyle(color: Colors.black54),
                      ),
                      style: const TextStyle(color: Colors.black),
                      dropdownColor: Colors.white,
                      iconEnabledColor: Colors.black,
                      items: _fuStatusItems,
                      onChanged: (v) => setSheetState(() => tempStatus = v ?? ''),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: tempType.isEmpty ? null : tempType,
                      decoration: const InputDecoration(
                        labelText: 'Type',
                        border: OutlineInputBorder(),
                        labelStyle: TextStyle(color: Colors.black),
                        hintStyle: TextStyle(color: Colors.black54),
                      ),
                      style: const TextStyle(color: Colors.black),
                      dropdownColor: Colors.white,
                      iconEnabledColor: Colors.black,
                      items: _fuTypeItems,
                      onChanged: (v) => setSheetState(() => tempType = v ?? ''),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () async {
                              final picked = await showDatePicker(
                                context: ctx,
                                initialDate: tempFrom ?? DateTime.now(),
                                firstDate: DateTime.now().subtract(const Duration(days: 365 * 3)),
                                lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                              );
                              if (picked == null) return;
                              setSheetState(() {
                                tempFrom = _dateOnly(picked);
                                if (tempTo != null && tempTo!.isBefore(tempFrom!)) {
                                  tempTo = tempFrom;
                                }
                              });
                            },
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.black,
                              side: BorderSide(color: Colors.black.withValues(alpha: 0.2)),
                            ),
                            child: Text(
                              tempFrom == null ? 'From date' : _fmtDateOnly(tempFrom!),
                              style: const TextStyle(color: Colors.black),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () async {
                              final picked = await showDatePicker(
                                context: ctx,
                                initialDate: tempTo ?? tempFrom ?? DateTime.now(),
                                firstDate: DateTime.now().subtract(const Duration(days: 365 * 3)),
                                lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                              );
                              if (picked == null) return;
                              setSheetState(() => tempTo = _dateOnly(picked));
                            },
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.black,
                              side: BorderSide(color: Colors.black.withValues(alpha: 0.2)),
                            ),
                            child: Text(
                              tempTo == null ? 'To date' : _fmtDateOnly(tempTo!),
                              style: const TextStyle(color: Colors.black),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Applied filters',
                      style: TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (tempCustomerId.isNotEmpty)
                          Chip(
                            label: Text(
                              'Customer',
                              style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
                            ),
                            onDeleted: () => setSheetState(() => tempCustomerId = ''),
                          ),
                        if (tempStatus.isNotEmpty)
                          Chip(
                            label: Text(
                              'Status',
                              style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
                            ),
                            onDeleted: () => setSheetState(() => tempStatus = ''),
                          ),
                        if (tempType.isNotEmpty)
                          Chip(
                            label: Text(
                              'Type',
                              style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
                            ),
                            onDeleted: () => setSheetState(() => tempType = ''),
                          ),
                        if (tempFrom != null || tempTo != null)
                          Chip(
                            label: Text(
                              'Date',
                              style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
                            ),
                            onDeleted: () => setSheetState(() {
                              tempFrom = null;
                              tempTo = null;
                            }),
                          ),
                        if (tempCustomerId.isEmpty &&
                            tempStatus.isEmpty &&
                            tempType.isEmpty &&
                            tempFrom == null &&
                            tempTo == null)
                          Text(
                            'No filters selected',
                            style: TextStyle(color: Colors.black.withValues(alpha: 0.55)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () => setSheetState(() {
                          tempCustomerId = '';
                          tempStatus = '';
                          tempType = '';
                          tempFrom = null;
                          tempTo = null;
                        }),
                        style: TextButton.styleFrom(foregroundColor: Colors.black),
                        icon: const Icon(Icons.clear_rounded, color: Colors.black),
                        label: const Text(
                          'Clear all filters',
                          style: TextStyle(color: Colors.black),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Apply filters'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (applied != true || !mounted) return;
    setState(() {
      _fuCustomerId = tempCustomerId;
      _fuStatus = tempStatus;
      _fuType = tempType;
      _fromDate = tempFrom;
      _toDate = tempTo;
    });
    await _loadFollowUps();
  }


  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onAddTask: _userId != null && _userId!.isNotEmpty
          ? () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => AddTaskScreen(userId: _userId!)),
              ).then((_) => _bootstrap());
            }
          : null,
      onAddCustomer: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddCustomerScreen()),
        ).then((_) => _bootstrap());
      },
      onProfile: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        ).then((_) => _bootstrap());
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ).then((_) => _bootstrap());
      },
      onLogout: _logout,
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

  void _onCustomerTap(Customer c) {
    final id = c.id;
    if (id == null || id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This customer has no id yet.')),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => CustomerDetailTabsScreen(customer: c),
      ),
    );
  }

  Future<void> _showAddCustomerFollowUp() async {
    if (_customers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No customers to attach a follow-up to.')),
      );
      return;
    }
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _AddCustomerFollowUpBottomSheet(
        customerService: _customerService,
        customers: _customers,
        fmtDateTime: _fmtDateTime,
      ),
    );
    if (saved == true && mounted) {
      await _loadFollowUps();
    }
  }

  Widget _customerCard(Customer c) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: Colors.grey.shade300),
        ),
        child: InkWell(
          onTap: () => _onCustomerTap(c),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.business_rounded, color: Colors.grey.shade900, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c.customerName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF1A1A1A),
                        ),
                      ),
                      if (c.companyName != null && c.companyName!.trim().isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          c.companyName!.trim(),
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade700, fontWeight: FontWeight.w500),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 6),
                      Text(
                        '${c.city} · ${c.pincode}',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: Colors.grey.shade500),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _followUpDayCell(DateTime day, DateTime selected) {
    final isSelected = _sameCalendarDay(day, selected);
    final label = DateFormat('EEE').format(day).substring(0, 2).toUpperCase();
    return InkWell(
      onTap: () async {
        setState(() {
          _selectedFollowUpDay = _dateOnly(day);
          _syncFollowUpDateRangeWithSelectedDay();
        });
        _scheduleScrollFollowUpStripToDate(_selectedFollowUpDay);
        await _loadFollowUps();
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
              ),
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: isSelected ? Colors.black : Colors.black87,
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
    final days = List.generate(
      _followUpStripDayCount,
      (i) => start.add(Duration(days: i)),
    );
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
                for (final day in days)
                  SizedBox(
                    width: _followUpDayCellWidth,
                    child: _followUpDayCell(day, _selectedFollowUpDay),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openFollowUpDetail(CustomerFollowUpFeedItem r) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.55,
          minChildSize: 0.35,
          maxChildSize: 0.9,
          builder: (_, scroll) {
            return ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              child: Material(
                color: Colors.white,
                child: ListView(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.black12,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      r.customerName,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF1A1A1A),
                      ),
                    ),
                    if (r.companyName.isNotEmpty)
                      Text(
                        r.companyName,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.black.withValues(alpha: 0.6),
                        ),
                      ),
                    const SizedBox(height: 16),
                    _followUpDetailRow(Icons.category_outlined, 'Type', r.followUpType.toUpperCase()),
                    _followUpDetailRow(Icons.schedule_rounded, 'Next follow-up', _fmtDateTime(r.nextFollowUpDate)),
                    _followUpDetailRow(Icons.event_note_rounded, 'Created at', _fmtDateTime(r.createdAt)),
                    _followUpDetailRow(
                      Icons.person_outline_rounded,
                      'Created by',
                      r.createdByName.trim().isEmpty ? '--' : r.createdByName.trim(),
                    ),
                    _followUpDetailRow(
                      Icons.notes_rounded,
                      'Notes',
                      r.notes.trim().isEmpty ? '--' : r.notes.trim(),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _followUpDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Colors.black.withValues(alpha: 0.6),
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.black87,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _followUpCard(CustomerFollowUpFeedItem r) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.black.withValues(alpha: 0.08)),
      ),
      child: InkWell(
        onTap: () => _openFollowUpDetail(r),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(_followUpTypeIcon(r.followUpType), color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${r.customerName} · ${r.companyName}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      r.notesPreview.trim().isEmpty ? '--' : r.notesPreview,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.black.withValues(alpha: 0.68),
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _followUpMetaChip(Icons.schedule_rounded, 'Next: ${_fmtDateTime(r.nextFollowUpDate)}'),
                        _followUpMetaChip(Icons.event_note_rounded, _fmtDateTime(r.createdAt)),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: Colors.grey.shade500),
            ],
          ),
        ),
      ),
    );
  }

  Widget _followUpMetaChip(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: Colors.black54),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final busy = _tabIndex == 0 ? _loadingCustomers : _loadingFollowUps;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        bottom: false,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragEnd: (details) => handleMainShellSwipe(details, 2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
                ),
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          onPressed: () => _openAppMenu(context),
                          icon: Icon(Icons.menu_rounded, color: Colors.black.withValues(alpha: 0.85)),
                          tooltip: 'Menu',
                        ),
                        const Expanded(
                          child: Text(
                            'CUSTOMERS',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.35,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: _onTopAddPressed,
                          icon: Icon(Icons.add_rounded, color: Colors.black.withValues(alpha: 0.85)),
                          tooltip: _tabIndex == 0 ? 'Add customer' : 'Add follow-up',
                        ),
                        IconButton(
                          onPressed: () async {
                            if (_tabIndex == 0) {
                              await _bootstrap();
                            } else {
                              await _loadFollowUps();
                            }
                          },
                          icon: Icon(Icons.refresh_rounded, color: Colors.black.withValues(alpha: 0.85)),
                          tooltip: 'Refresh',
                        ),
                        IconButton(
                          onPressed: () {
                            if (_tabIndex == 1) {
                              _openFollowUpFiltersSheet();
                            } else {
                              _openCustomerFilterSheet();
                            }
                          },
                          icon: Icon(Icons.filter_alt_outlined, color: Colors.black.withValues(alpha: 0.85)),
                          tooltip: 'Filter',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
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
                            child: const Text('Customer', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ),
                      Expanded(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () {
                            setState(() => _tabIndex = 1);
                            _scheduleScrollFollowUpStripToDate(_selectedFollowUpDay);
                            _loadFollowUps();
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: BoxDecoration(
                              color: _tabIndex == 1 ? AppColors.primary : Colors.transparent,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text('Follow-up', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (_tabIndex == 1) _followUpDateStrip(),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchCtrl,
                        decoration: InputDecoration(
                          hintText: _tabIndex == 0 ? 'Search name / company' : 'Search customer / notes',
                          isDense: true,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          suffixIcon: IconButton(
                          icon: const Icon(Icons.search_rounded),
                          onPressed: () {
                            if (_tabIndex == 0) {
                              setState(() {});
                            } else {
                              _loadFollowUps();
                            }
                          },
                        ),
                        ),
                        onSubmitted: (_) {
                          if (_tabIndex == 0) {
                            setState(() {});
                          } else {
                            _loadFollowUps();
                          }
                        },
                      ),
                    ),
                    IconButton(
                      tooltip: 'Refresh',
                      onPressed: () async {
                        if (_tabIndex == 0) {
                          await _bootstrap();
                        } else {
                          await _loadFollowUps();
                        }
                      },
                      icon: const Icon(Icons.refresh_rounded),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _error != null && !busy
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_error!, textAlign: TextAlign.center),
                        ),
                      )
                    : busy
                        ? const Center(child: LocationLoader(size: 44))
                        : RefreshIndicator(
                            color: AppColors.primary,
                            onRefresh: () async {
                              if (_tabIndex == 0) {
                                await _bootstrap();
                              } else {
                                await _loadFollowUps();
                              }
                            },
                            child: _tabIndex == 0
                                ? (_visibleCustomers.isEmpty
                                    ? ListView(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        children: [
                                          const SizedBox(height: 80),
                                          Center(
                                            child: Text(
                                              _customers.isEmpty
                                                  ? 'No customers found for your company.'
                                                  : 'No customers match your search.',
                                            ),
                                          ),
                                        ],
                                      )
                                    : ListView.builder(
                                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        itemCount: _visibleCustomers.length,
                                        itemBuilder: (_, i) => _customerCard(_visibleCustomers[i]),
                                      ))
                                : (_visibleFollowUps.isEmpty
                                    ? ListView(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        children: const [
                                          SizedBox(height: 80),
                                          Center(child: Text('No follow-ups assigned to you.')),
                                        ],
                                      )
                                    : ListView.separated(
                                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        itemCount: _visibleFollowUps.length,
                                        separatorBuilder: (_, __) => const SizedBox(height: 0),
                                        itemBuilder: (_, i) {
                                          final r = _visibleFollowUps[i];
                                          return _followUpCard(r);
                                        },
                                      )),
                          ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: OvalBottomNavBar(
        currentIndex: null,
        onTap: (i) => pushMainShellByIndex(context, i),
      ),
    );
  }
}

/// Dedicated stateful bottom-sheet avoids `_dependents.isEmpty` assertion seen with
/// StatefulBuilder + form fields/controller disposal races.
class _AddCustomerFollowUpBottomSheet extends StatefulWidget {
  const _AddCustomerFollowUpBottomSheet({
    required this.customerService,
    required this.customers,
    required this.fmtDateTime,
  });

  final CustomerService customerService;
  final List<Customer> customers;
  final String Function(DateTime?) fmtDateTime;

  @override
  State<_AddCustomerFollowUpBottomSheet> createState() =>
      _AddCustomerFollowUpBottomSheetState();
}

class _AddCustomerFollowUpBottomSheetState
    extends State<_AddCustomerFollowUpBottomSheet> {
  late final TextEditingController _noteCtrl;
  late String _customerId;
  String _actionType = 'call';
  DateTime? _nextAt;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _noteCtrl = TextEditingController();
    _customerId = widget.customers.firstWhere(
      (c) => (c.id ?? '').isNotEmpty,
      orElse: () => widget.customers.first,
    ).id ??
        '';
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_customerId.isEmpty) {
      setState(() => _error = 'Select a customer.');
      return;
    }
    if (_noteCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Note is required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.customerService.addCustomerFollowUp(
        customerId: _customerId,
        note: _noteCtrl.text.trim(),
        actionType: _actionType,
        nextFollowUpAt: _nextAt,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _saving = false;
      });
    }
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
    );
    if (d == null || !mounted) return;
    setState(() => _nextAt = DateTime(d.year, d.month, d.day, 10));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Add customer follow-up',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Colors.black,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                  icon: const Icon(Icons.close_rounded, color: Colors.black),
                  tooltip: 'Close',
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _customerId.isEmpty ? null : _customerId,
              decoration: const InputDecoration(
                labelText: 'Customer',
                border: OutlineInputBorder(),
                labelStyle: TextStyle(color: Colors.black),
                hintStyle: TextStyle(color: Colors.black54),
              ),
              style: const TextStyle(color: Colors.black),
              dropdownColor: Colors.white,
              iconEnabledColor: Colors.black,
              items: widget.customers
                  .where((c) => (c.id ?? '').isNotEmpty)
                  .map(
                    (c) => DropdownMenuItem(
                      value: c.id,
                      child: Text(
                        '${c.customerName} · ${c.companyName ?? ''}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _customerId = v ?? ''),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _noteCtrl,
              style: const TextStyle(color: Colors.black),
              decoration: const InputDecoration(
                labelText: 'Note',
                border: OutlineInputBorder(),
                labelStyle: TextStyle(color: Colors.black),
                hintStyle: TextStyle(color: Colors.black54),
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: _actionType,
              decoration: const InputDecoration(
                labelText: 'Type',
                border: OutlineInputBorder(),
                labelStyle: TextStyle(color: Colors.black),
                hintStyle: TextStyle(color: Colors.black54),
              ),
              style: const TextStyle(color: Colors.black),
              dropdownColor: Colors.white,
              iconEnabledColor: Colors.black,
              items: const [
                DropdownMenuItem(value: 'call', child: Text('Call')),
                DropdownMenuItem(value: 'visit', child: Text('Visit')),
                DropdownMenuItem(value: 'message', child: Text('Message')),
                DropdownMenuItem(value: 'other', child: Text('Other')),
              ],
              onChanged: (v) => setState(() => _actionType = v ?? 'call'),
            ),
            const SizedBox(height: 10),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                _nextAt == null
                    ? 'Next follow-up (optional)'
                    : widget.fmtDateTime(_nextAt),
                style: const TextStyle(color: Colors.black),
              ),
              trailing: TextButton(
                onPressed: _pickDate,
                style: TextButton.styleFrom(foregroundColor: Colors.black),
                child: const Text(
                  'Pick',
                  style: TextStyle(color: Colors.black),
                ),
              ),
            ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _saving ? null : _submit,
              child: Text(_saving ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      ),
    );
  }
}
