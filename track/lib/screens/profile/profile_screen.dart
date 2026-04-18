import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/location_loader.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  static const String supportCompanyLabel = 'abc company';
  static const String supportPhone = '9876543210';

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _user;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  String? _extractId(dynamic value) {
    if (value == null) return null;
    if (value is String) return value;
    if (value is Map) {
      final map = Map<String, dynamic>.from(value);
      final nested = map['_id'] ?? map[r'$oid'] ?? map['id'];
      if (nested is String) return nested;
      if (nested != null) return nested.toString();
    }
    return value.toString();
  }

  Future<void> _loadProfile() async {
    setState(() => _loading = true);
    final prefs = await SharedPreferences.getInstance();
    final userRaw = prefs.getString('user');
    Map<String, dynamic>? sessionUser;
    try {
      if (userRaw != null && userRaw.isNotEmpty) {
        final parsed = jsonDecode(userRaw);
        if (parsed is Map<String, dynamic>) {
          sessionUser = parsed;
        } else if (parsed is Map) {
          sessionUser = Map<String, dynamic>.from(parsed);
        }
      }
    } catch (_) {
      sessionUser = null;
    }

    final profileRes = await AuthService().getProfile();
    Map<String, dynamic>? profileData;
    if (profileRes['success'] == true && profileRes['data'] is Map) {
      final data = profileRes['data'] as Map;
      final profile = data['profile'];
      if (profile is Map<String, dynamic>) {
        profileData = profile;
      } else if (profile is Map) {
        profileData = Map<String, dynamic>.from(profile);
      }
    }

    final merged = <String, dynamic>{...?sessionUser, ...?profileData};
    final companyId = _extractId(merged['companyId'] ?? merged['businessId']);
    if (companyId != null && companyId.isNotEmpty) {
      merged['companyId'] = companyId;
      merged['businessId'] = companyId;
    }

    if (!mounted) return;
    setState(() {
      _user = merged.isEmpty ? null : merged;
      _loading = false;
    });
  }

  String? _trimmed(dynamic v) {
    if (v == null) return null;
    final s = v.toString().trim();
    return s.isEmpty ? null : s;
  }

  List<MapEntry<String, String>> _detailRows(Map<String, dynamic>? u) {
    if (u == null) return const [];
    final rows = <MapEntry<String, String>>[];

    void add(String label, String? value) {
      if (value != null) rows.add(MapEntry(label, value));
    }

    add('Name', _trimmed(u['name'] ?? u['fullName']));
    add('Email', _trimmed(u['email']));
    add('Phone', _trimmed(u['phone'] ?? u['mobile'] ?? u['phoneNumber']));
    add('Role', _trimmed(u['role']));

    String? company = _trimmed(u['companyName']);
    if (company == null && u['company'] is Map) {
      final c = Map<String, dynamic>.from(u['company'] as Map);
      company = _trimmed(c['name']);
    }
    add('Company', company);

    add('Company ID', _trimmed(u['companyId'] ?? u['businessId']));
    add('Employee ID', _trimmed(u['employeeId'] ?? u['empId'] ?? u['employeeCode']));
    add('Department', _trimmed(u['department']));
    add('Designation', _trimmed(u['designation'] ?? u['jobTitle'] ?? u['title']));
    add('Address', _trimmed(u['address'] ?? u['streetAddress']));
    add('City', _trimmed(u['city']));
    add('State', _trimmed(u['state'] ?? u['region']));
    add('PIN code', _trimmed(u['pincode'] ?? u['postalCode'] ?? u['zipCode']));

    return rows;
  }

  Future<void> _showChangePasswordDialog() async {
    final messenger = ScaffoldMessenger.of(context);
    final oldController = TextEditingController();
    final newController = TextEditingController();
    final confirmController = TextEditingController();
    bool submitting = false;
    String? error;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocalState) => AlertDialog(
          backgroundColor: Colors.white,
          title: const Text('Update password'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: oldController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Current password'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: newController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'New password'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: confirmController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Confirm new password'),
                ),
                if (error != null) ...[
                  const SizedBox(height: 10),
                  Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: submitting ? null : () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.black,
              ),
              onPressed: submitting
                  ? null
                  : () async {
                      final oldPassword = oldController.text.trim();
                      final newPassword = newController.text.trim();
                      final confirm = confirmController.text.trim();
                      if (oldPassword.isEmpty || newPassword.isEmpty || confirm.isEmpty) {
                        setLocalState(() => error = 'All password fields are required');
                        return;
                      }
                      if (newPassword.length < 6) {
                        setLocalState(() => error = 'New password must be at least 6 characters');
                        return;
                      }
                      if (newPassword != confirm) {
                        setLocalState(() => error = 'New password and confirm do not match');
                        return;
                      }
                      setLocalState(() {
                        submitting = true;
                        error = null;
                      });
                      final result = await AuthService().changePassword(
                        oldPassword: oldPassword,
                        newPassword: newPassword,
                      );
                      if (!mounted || !ctx.mounted) return;
                      if (result['success'] == true) {
                        Navigator.of(ctx).pop();
                        messenger.showSnackBar(
                          SnackBar(
                            content: Text(
                              result['message']?.toString() ?? 'Password updated successfully',
                            ),
                          ),
                        );
                      } else {
                        setLocalState(() {
                          submitting = false;
                          error = result['message']?.toString() ?? 'Failed to update password';
                        });
                      }
                    },
              child: submitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: LocationLoader(size: 20),
                    )
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
    oldController.dispose();
    newController.dispose();
    confirmController.dispose();
  }

  void _showSupportDialog() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text('Support'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              ProfileScreen.supportCompanyLabel,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.black87),
            ),
            const SizedBox(height: 12),
            SelectableText(
              ProfileScreen.supportPhone,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Phone',
              style: TextStyle(fontSize: 12, color: Colors.black.withValues(alpha: 0.45)),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK'),
          ),
        ],
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

  Widget _buildAvatar(Map<String, dynamic>? u) {
    const double size = 104;
    const double borderWidth = 3;
    final ring = BoxDecoration(
      shape: BoxShape.circle,
      color: const Color(0xFF1A1A1A),
      border: Border.all(color: AppColors.primary, width: borderWidth),
    );

    final raw = u?['profileImage'] ?? u?['profilePic'] ?? u?['avatar'] ?? u?['photo'];
    final url = raw?.toString();
    if (url != null && url.startsWith('http')) {
      return Container(
        width: size,
        height: size,
        padding: const EdgeInsets.all(borderWidth),
        decoration: ring,
        child: ClipOval(
          child: Image.network(
            url,
            width: size - borderWidth * 2,
            height: size - borderWidth * 2,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Center(
              child: Icon(Icons.person_rounded, size: 52, color: AppColors.primary),
            ),
          ),
        ),
      );
    }
    return Container(
      width: size,
      height: size,
      decoration: ring,
      alignment: Alignment.center,
      child: Icon(Icons.person_rounded, size: 56, color: AppColors.primary),
    );
  }

  @override
  Widget build(BuildContext context) {
    final u = _user;
    final name = u?['name']?.toString().trim().isNotEmpty == true
        ? u!['name'].toString().trim()
        : (u?['fullName']?.toString().trim().isNotEmpty == true ? u!['fullName'].toString().trim() : 'User');
    final subtitle = _trimmed(u?['email']) ?? _trimmed(u?['role']) ?? '';
    final details = _detailRows(u);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Back',
          onPressed: () {
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop();
            } else {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => const DashboardScreen()),
              );
            }
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.menu_rounded),
            tooltip: 'Menu',
            onPressed: () {
              showAppDrawerMenu(
                context,
                onProfile: () {},
                onSettings: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const SettingsScreen()),
                  ).then((_) => _loadProfile());
                },
                onLogout: _logout,
              );
            },
          ),
        ],
        title: const Text('Your Profile', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: LocationLoader(size: 40))
            : RefreshIndicator(
                color: AppColors.primary,
                onRefresh: _loadProfile,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(child: _buildAvatar(u)),
                      const SizedBox(height: 16),
                      Text(
                        name,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.black),
                      ),
                      if (subtitle.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          subtitle,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.black.withValues(alpha: 0.55),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Text(
                        'Your details',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: Colors.black.withValues(alpha: 0.88),
                        ),
                      ),
                      const SizedBox(height: 10),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
                        ),
                        child: details.isEmpty
                            ? const Padding(
                                padding: EdgeInsets.all(20),
                                child: Text('No profile details available.'),
                              )
                            : ListView.separated(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: details.length,
                                separatorBuilder: (_, __) => Divider(
                                  height: 1,
                                  thickness: 1,
                                  color: Colors.black.withValues(alpha: 0.06),
                                ),
                                itemBuilder: (context, i) {
                                  final e = details[i];
                                  final label = e.key;
                                  final value = e.value;
                                  return Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        SizedBox(
                                          width: 112,
                                          child: Text(
                                            label,
                                            style: TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 13,
                                              color: Colors.black.withValues(alpha: 0.5),
                                            ),
                                          ),
                                        ),
                                        Expanded(
                                          child: SelectableText(
                                            value,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 14,
                                              color: Colors.black87,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        onPressed: _showChangePasswordDialog,
                        icon: const Icon(Icons.lock_reset_rounded),
                        label: const Text('Update password'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                      ),
                      const SizedBox(height: 12),
                      _ProfileMenuCard(
                        icon: Icons.support_agent_rounded,
                        label: 'Support',
                        onTap: _showSupportDialog,
                      ),
                      const SizedBox(height: 24),
                      OutlinedButton(
                        onPressed: _logout,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red.shade700,
                          side: BorderSide(color: Colors.red.shade200),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          backgroundColor: Colors.white,
                        ),
                        child: const Text('Log out', style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _ProfileMenuCard extends StatelessWidget {
  const _ProfileMenuCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      elevation: 1,
      shadowColor: Colors.black26,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: Colors.black87, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.black87),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.06),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.chevron_right_rounded, color: Colors.black54),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
