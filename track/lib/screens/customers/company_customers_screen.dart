import 'dart:convert';

import 'package:flutter/material.dart';
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

  List<Customer> _customers = const [];
  List<CustomerFollowUpFeedItem> _followUps = const [];
  bool _loadingCustomers = true;
  bool _loadingFollowUps = false;
  String? _error;
  String? _userId;
  String _companyLine = 'Customers';

  int _tabIndex = 0;
  bool _filtersOpen = false;
  String _fuStatus = '';
  DateTime? _fromDate;
  DateTime? _toDate;

  static const List<DropdownMenuItem<String>> _fuStatusItems = [
    DropdownMenuItem(value: '', child: Text('All')),
    DropdownMenuItem(value: 'pending', child: Text('Upcoming (next date)')),
    DropdownMenuItem(value: 'overdue', child: Text('Overdue next date')),
  ];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
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
        from: _fromDate,
        to: _toDate,
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
    if (q.isEmpty) return _customers;
    return _customers.where((c) {
      final cn = (c.companyName ?? '').toLowerCase();
      final em = (c.emailId ?? c.email ?? '').toLowerCase();
      final ph = (c.customerNumber ?? '').toLowerCase();
      return c.customerName.toLowerCase().contains(q) || cn.contains(q) || em.contains(q) || ph.contains(q);
    }).toList();
  }

  String _fmtDateTime(DateTime? dt) {
    if (dt == null) return '--';
    final l = dt.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(l.day)}/${two(l.month)}/${l.year} ${two(l.hour)}:${two(l.minute)}';
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
    var customerId = _customers.first.id ?? '';
    final noteCtrl = TextEditingController();
    var actionType = 'call';
    DateTime? nextAt;
    var saving = false;
    String? err;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            Future<void> submit() async {
              if (customerId.isEmpty) {
                setLocal(() => err = 'Select a customer.');
                return;
              }
              if (noteCtrl.text.trim().isEmpty) {
                setLocal(() => err = 'Note is required.');
                return;
              }
              setLocal(() {
                saving = true;
                err = null;
              });
              try {
                await _customerService.addCustomerFollowUp(
                  customerId: customerId,
                  note: noteCtrl.text.trim(),
                  actionType: actionType,
                  nextFollowUpAt: nextAt,
                );
                if (ctx.mounted) Navigator.pop(ctx);
                await _loadFollowUps();
              } catch (e) {
                setLocal(() {
                  err = e.toString();
                  saving = false;
                });
              }
            }

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
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Add customer follow-up', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: customerId.isEmpty ? null : customerId,
                      decoration: const InputDecoration(labelText: 'Customer', border: OutlineInputBorder()),
                      items: _customers
                          .where((c) => (c.id ?? '').isNotEmpty)
                          .map(
                            (c) => DropdownMenuItem(
                              value: c.id,
                              child: Text('${c.customerName} · ${c.companyName ?? ''}', overflow: TextOverflow.ellipsis),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setLocal(() => customerId = v ?? ''),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: noteCtrl,
                      decoration: const InputDecoration(labelText: 'Note', border: OutlineInputBorder()),
                      maxLines: 3,
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: actionType,
                      decoration: const InputDecoration(labelText: 'Type', border: OutlineInputBorder()),
                      items: const [
                        DropdownMenuItem(value: 'call', child: Text('Call')),
                        DropdownMenuItem(value: 'visit', child: Text('Visit')),
                        DropdownMenuItem(value: 'message', child: Text('Message')),
                        DropdownMenuItem(value: 'other', child: Text('Other')),
                      ],
                      onChanged: (v) => setLocal(() => actionType = v ?? 'call'),
                    ),
                    const SizedBox(height: 10),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(nextAt == null ? 'Next follow-up (optional)' : _fmtDateTime(nextAt)),
                      trailing: TextButton(onPressed: () async {
                        final d = await showDatePicker(
                          context: ctx,
                          initialDate: DateTime.now(),
                          firstDate: DateTime.now().subtract(const Duration(days: 1)),
                          lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                        );
                        if (d != null) {
                          setLocal(() => nextAt = DateTime(d.year, d.month, d.day, 10));
                        }
                      }, child: const Text('Pick')),
                    ),
                    if (err != null) Text(err!, style: const TextStyle(color: Colors.red)),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: saving ? null : submit,
                      child: Text(saving ? 'Saving…' : 'Save'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    noteCtrl.dispose();
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

  @override
  Widget build(BuildContext context) {
    final busy = _tabIndex == 0 ? _loadingCustomers : _loadingFollowUps;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        bottom: false,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragEnd: (details) => handleMainShellSwipe(details, 3),
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
                        if (_tabIndex == 1)
                          IconButton(
                            onPressed: _showAddCustomerFollowUp,
                            icon: Icon(Icons.add_rounded, color: Colors.black.withValues(alpha: 0.85)),
                            tooltip: 'Add follow-up',
                          )
                        else
                          const SizedBox(width: 48),
                      ],
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'Customers · $_companyLine',
                        style: TextStyle(
                          color: Colors.black.withValues(alpha: 0.72),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
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
                      tooltip: 'Filters',
                      onPressed: () => setState(() => _filtersOpen = !_filtersOpen),
                      icon: Icon(
                        Icons.filter_list_rounded,
                        color: _filtersOpen ? AppColors.primary : Colors.grey.shade700,
                      ),
                    ),
                  ],
                ),
              ),
              if (_filtersOpen && _tabIndex == 1)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      DropdownButtonFormField<String>(
                        value: _fuStatus.isEmpty ? null : _fuStatus,
                        decoration: const InputDecoration(labelText: 'Follow-up status', border: OutlineInputBorder()),
                        items: _fuStatusItems,
                        onChanged: (v) {
                          setState(() => _fuStatus = v ?? '');
                          _loadFollowUps();
                        },
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _pickDate(from: true),
                              child: Text(_fromDate == null ? 'From (created)' : 'From: ${_fromDate!.toLocal().toString().split(' ').first}'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _pickDate(from: false),
                              child: Text(_toDate == null ? 'To (created)' : 'To: ${_toDate!.toLocal().toString().split(' ').first}'),
                            ),
                          ),
                          IconButton(onPressed: _clearDates, icon: const Icon(Icons.clear_rounded)),
                        ],
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
                                : (_followUps.isEmpty
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
                                        itemCount: _followUps.length,
                                        separatorBuilder: (_, __) => const Divider(height: 1),
                                        itemBuilder: (_, i) {
                                          final r = _followUps[i];
                                          return ListTile(
                                            title: Text('${r.customerName} · ${r.companyName}'),
                                            subtitle: Text(
                                              '${r.notesPreview}\n'
                                              '${r.followUpType.toUpperCase()} · Next: ${_fmtDateTime(r.nextFollowUpDate)} · ${_fmtDateTime(r.createdAt)}',
                                            ),
                                            isThreeLine: true,
                                            onTap: () {
                                              Customer? match;
                                              for (final c in _customers) {
                                                if (c.id == r.customerId) {
                                                  match = c;
                                                  break;
                                                }
                                              }
                                              if (match != null) _onCustomerTap(match);
                                            },
                                          );
                                        },
                                      )),
                          ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: OvalBottomNavBar(
        currentIndex: 3,
        onTap: (i) => pushMainShellByIndex(context, i),
      ),
    );
  }
}
