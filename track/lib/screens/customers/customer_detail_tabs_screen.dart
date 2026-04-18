import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/company_visit.dart';
import 'package:track/models/customer.dart';
import 'package:track/navigation/main_shell_navigation.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/geo/add_customer_screen.dart';
import 'package:track/screens/geo/add_task_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/services/company_visit_service.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/location_loader.dart';

/// Customer profile with **Details** and **Visits** (your visits to this customer).
class CustomerDetailTabsScreen extends StatefulWidget {
  const CustomerDetailTabsScreen({super.key, required this.customer});

  final Customer customer;

  @override
  State<CustomerDetailTabsScreen> createState() => _CustomerDetailTabsScreenState();
}

class _CustomerDetailTabsScreenState extends State<CustomerDetailTabsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final CompanyVisitService _visitService = CompanyVisitService();

  String? _userId;
  List<CompanyVisitRecord> _visits = const [];
  bool _visitsLoading = false;
  String? _visitsError;

  Customer get c => widget.customer;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _loadUserId();
      if (mounted) await _loadVisits();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadUserId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user');
      if (raw == null || raw.isEmpty) return;
      final map = jsonDecode(raw);
      if (map is! Map) return;
      final id = map['_id'] ?? map['id'] ?? map['userId'];
      if (id != null && mounted) {
        setState(() => _userId = id is String ? id : id.toString());
      }
    } catch (_) {}
  }

  Future<void> _loadVisits() async {
    final cid = c.id;
    if (cid == null || cid.isEmpty) return;
    setState(() {
      _visitsLoading = true;
      _visitsError = null;
    });
    try {
      final to = DateTime.now();
      final from = to.subtract(const Duration(days: 365));
      final list = await _visitService.fetchVisitsForCustomer(
        customerId: cid,
        from: from,
        to: to,
        staffUserId: _userId,
      );
      if (!mounted) return;
      setState(() {
        _visits = list;
        _visitsLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _visitsError = e.toString();
        _visitsLoading = false;
      });
    }
  }

  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onAddTask: _userId != null && _userId!.isNotEmpty
          ? () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => AddTaskScreen(userId: _userId!)),
              );
            }
          : null,
      onAddCustomer: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddCustomerScreen()),
        );
      },
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

  Future<void> _logout() async {
    await AuthService().logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  Widget _detailsBody() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      children: [
        _detailRow(Icons.person_outline_rounded, 'Name', c.customerName),
        if (c.customerNumber != null && c.customerNumber!.trim().isNotEmpty)
          _detailRow(Icons.phone_outlined, 'Phone', c.customerNumber!.trim()),
        if (c.effectiveEmail != null && c.effectiveEmail!.trim().isNotEmpty)
          _detailRow(Icons.email_outlined, 'Email', c.effectiveEmail!.trim()),
        _detailRow(Icons.place_outlined, 'Address', c.address),
        _detailRow(Icons.location_city_outlined, 'City', c.city),
        _detailRow(Icons.local_post_office_outlined, 'Pincode', c.pincode),
        if (c.companyName != null && c.companyName!.trim().isNotEmpty)
          _detailRow(Icons.business_outlined, 'Company', c.companyName!.trim()),
      ],
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
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
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1A1A1A),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _visitsBody() {
    if (_visitsLoading) {
      return const Center(child: LocationLoader(size: 40));
    }
    if (_visitsError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_visitsError!, textAlign: TextAlign.center),
        ),
      );
    }
    if (_visits.isEmpty) {
      return RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _loadVisits,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 72),
            Center(child: Text('No visits recorded for you at this customer yet.')),
          ],
        ),
      );
    }
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _loadVisits,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _visits.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          final v = _visits[i];
          return Material(
            color: Colors.grey.shade50,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(color: Colors.grey.shade300),
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: v.isOpen
                              ? Colors.orange.shade100
                              : Colors.green.shade100,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          v.status.toUpperCase(),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: v.isOpen ? Colors.orange.shade900 : Colors.green.shade900,
                          ),
                        ),
                      ),
                      const Spacer(),
                      Text(
                        DateDisplayUtil.formatVisitsDateTime(v.checkInTime),
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                  if (v.siteAddress != null && v.siteAddress!.trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      v.siteAddress!.trim(),
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade800),
                    ),
                  ],
                  if (v.checkOutTime != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Out: ${DateDisplayUtil.formatVisitsDateTime(v.checkOutTime)}'
                      '${v.durationMinutes != null ? ' · ${v.durationMinutes} min' : ''}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                  if (v.source != null && v.source!.trim().isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'Source: ${v.source}',
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
              ),
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
              child: Column(
                children: [
                  Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: Icon(
                          Icons.arrow_back_rounded,
                          color: Colors.black.withValues(alpha: 0.85),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          c.customerName,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => _openAppMenu(context),
                        icon: Icon(
                          Icons.menu_rounded,
                          color: Colors.black.withValues(alpha: 0.85),
                        ),
                        tooltip: 'Menu',
                      ),
                    ],
                  ),
                  TabBar(
                    controller: _tabController,
                    labelColor: Colors.black,
                    unselectedLabelColor: Colors.black54,
                    indicatorColor: Colors.black,
                    indicatorWeight: 3,
                    tabs: const [
                      Tab(text: 'Details'),
                      Tab(text: 'Visits'),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _detailsBody(),
                  _visitsBody(),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: OvalBottomNavBar(
        currentIndex: 0,
        onTap: (i) => pushMainShellByIndex(context, i),
      ),
    );
  }
}
