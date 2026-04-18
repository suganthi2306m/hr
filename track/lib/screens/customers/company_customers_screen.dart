import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/customer.dart';
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

/// Lists customers for the signed-in user's company (same payload as [CustomerService.getAllCustomers]).
class CompanyCustomersScreen extends StatefulWidget {
  const CompanyCustomersScreen({super.key});

  @override
  State<CompanyCustomersScreen> createState() => _CompanyCustomersScreenState();
}

class _CompanyCustomersScreenState extends State<CompanyCustomersScreen> {
  final CustomerService _customerService = CustomerService();

  List<Customer> _customers = const [];
  bool _loading = true;
  String? _error;
  String? _userId;
  String _companyLine = 'Customers';

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
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
      final list = await _customerService.getAllCustomers();
      if (!mounted) return;
      setState(() {
        _customers = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
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
              width: double.infinity,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
              ),
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      IconButton(
                        onPressed: () => _openAppMenu(context),
                        icon: Icon(
                          Icons.menu_rounded,
                          color: Colors.black.withValues(alpha: 0.85),
                        ),
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
                      const SizedBox(width: 48),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      _companyLine,
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
            Expanded(
              child: _loading
                  ? const Center(child: LocationLoader(size: 44))
                  : _error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.grey.shade700),
                            ),
                          ),
                        )
                      : RefreshIndicator(
                          color: AppColors.primary,
                          onRefresh: _bootstrap,
                          child: _customers.isEmpty
                              ? ListView(
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  children: const [
                                    SizedBox(height: 80),
                                    Center(
                                      child: Text('No customers found for your company.'),
                                    ),
                                  ],
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  itemCount: _customers.length,
                                  itemBuilder: (context, i) {
                                    final c = _customers[i];
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
                                                  child: Icon(
                                                    Icons.business_rounded,
                                                    color: Colors.grey.shade900,
                                                    size: 24,
                                                  ),
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
                                                      if (c.companyName != null &&
                                                          c.companyName!.trim().isNotEmpty) ...[
                                                        const SizedBox(height: 4),
                                                        Text(
                                                          c.companyName!.trim(),
                                                          style: TextStyle(
                                                            fontSize: 13,
                                                            color: Colors.grey.shade700,
                                                            fontWeight: FontWeight.w500,
                                                          ),
                                                          maxLines: 1,
                                                          overflow: TextOverflow.ellipsis,
                                                        ),
                                                      ],
                                                      const SizedBox(height: 6),
                                                      Text(
                                                        '${c.city} · ${c.pincode}',
                                                        style: TextStyle(
                                                          fontSize: 12,
                                                          color: Colors.grey.shade600,
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                                Icon(
                                                  Icons.chevron_right_rounded,
                                                  color: Colors.grey.shade500,
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
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
