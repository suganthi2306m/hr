import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/profile/employee_more_details_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/utils/employee_custom_fields_display.dart';
import 'package:track/widgets/app_feedback.dart';
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

  String? _valueByPaths(
    Map<String, dynamic>? source,
    List<String> paths,
  ) {
    if (source == null) return null;
    for (final path in paths) {
      dynamic current = source;
      var missing = false;
      for (final part in path.split('.')) {
        if (current is Map && current.containsKey(part)) {
          current = current[part];
        } else {
          missing = true;
          break;
        }
      }
      if (missing) continue;
      final t = _trimmed(current);
      if (t != null) return t;
    }
    return null;
  }

  List<_ProfileItem> _buildWorkItems(Map<String, dynamic>? u) {
    return [
      _ProfileItem('Role', _valueByPaths(u, ['role'])),
      _ProfileItem('Department', _valueByPaths(u, ['department'])),
      _ProfileItem(
        'Designation',
        _valueByPaths(u, ['designation', 'jobTitle', 'title']),
      ),
      _ProfileItem('Employee ID', _valueByPaths(u, ['employeeId', 'empId', 'employeeCode'])),
      _ProfileItem('Work shift', _valueByPaths(u, ['workShift', 'shiftName', 'shift.name'])),
      _ProfileItem('Date of joining', _valueByPaths(u, ['dateOfJoining', 'joiningDate'])),
      _ProfileItem('Employment type', _valueByPaths(u, ['employmentType'])),
      _ProfileItem('Reporting manager', _valueByPaths(u, ['reportingManagerName', 'reportingManager.name'])),
    ];
  }

  List<_ProfileItem> _buildContactItems(Map<String, dynamic>? u) {
    return [
      _ProfileItem('Work phone', _valueByPaths(u, ['phone', 'mobile', 'phoneNumber'])),
      _ProfileItem('Personal mobile', _valueByPaths(u, ['personalMobile', 'personalPhone'])),
      _ProfileItem('Personal email', _valueByPaths(u, ['personalEmail'])),
      _ProfileItem('Emergency contact', _valueByPaths(u, ['emergencyContact'])),
      _ProfileItem('Permanent address', _valueByPaths(u, ['permanentAddress', 'address', 'streetAddress'])),
      _ProfileItem('Local address', _valueByPaths(u, ['localAddress'])),
      _ProfileItem('City', _valueByPaths(u, ['city'])),
      _ProfileItem('State', _valueByPaths(u, ['state', 'region'])),
      _ProfileItem('PIN code', _valueByPaths(u, ['pincode', 'postalCode', 'zipCode'])),
    ];
  }

  List<_ProfileItem> _buildPersonalItems(Map<String, dynamic>? u) {
    return [
      _ProfileItem('First name', _valueByPaths(u, ['firstName'])),
      _ProfileItem('Last name', _valueByPaths(u, ['lastName'])),
      _ProfileItem('Date of birth', _valueByPaths(u, ['dateOfBirth', 'dob'])),
      _ProfileItem('Gender', _valueByPaths(u, ['gender'])),
      _ProfileItem('Marital status', _valueByPaths(u, ['maritalStatus'])),
      _ProfileItem('Nationality', _valueByPaths(u, ['nationality'])),
      _ProfileItem('Blood group', _valueByPaths(u, ['bloodGroup'])),
    ];
  }

  List<_ProfileItem> _buildBankItems(Map<String, dynamic>? u) {
    return [
      _ProfileItem('Payment mode', _valueByPaths(u, ['paymentMode'])),
      _ProfileItem('Bank', _valueByPaths(u, ['bankName'])),
      _ProfileItem('Account number', _valueByPaths(u, ['accountNumber'])),
      _ProfileItem('IFSC', _valueByPaths(u, ['ifscCode'])),
      _ProfileItem('Branch', _valueByPaths(u, ['branchName'])),
      _ProfileItem('Beneficiary code', _valueByPaths(u, ['beneficiaryCode'])),
    ];
  }

  List<_ProfileItem> _buildIdentityItems(Map<String, dynamic>? u) {
    return [
      _ProfileItem('PAN', _valueByPaths(u, ['pan'])),
      _ProfileItem('Aadhaar', _valueByPaths(u, ['aadhaar'])),
      _ProfileItem('UAN', _valueByPaths(u, ['uan'])),
      _ProfileItem('PF number', _valueByPaths(u, ['pfNumber'])),
    ];
  }

  Future<void> _showPersonalEditSheet() async {
    final u = _user ?? const <String, dynamic>{};
    final parentContext = context;
    await showModalBottomSheet<void>(
      context: parentContext,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => _PersonalDetailsEditSheet(
        parentContext: parentContext,
        phone: _valueByPaths(u, ['phone', 'mobile', 'phoneNumber']) ?? '',
        personalEmail: _valueByPaths(u, ['personalEmail']) ?? '',
        emergency: _valueByPaths(u, ['emergencyContact']) ?? '',
        permanentAddress:
            _valueByPaths(u, ['permanentAddress', 'address', 'streetAddress']) ?? '',
        localAddress: _valueByPaths(u, ['localAddress']) ?? '',
        onReloadProfile: _loadProfile,
      ),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required List<_ProfileItem> items,
    bool editable = false,
    VoidCallback? onEdit,
    String? subtitle,
  }) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.black.withValues(alpha: 0.08)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                  ),
                ),
                if (editable && onEdit != null)
                  TextButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    label: const Text('Edit'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.black87,
                    ),
                  ),
              ],
            ),
            if (subtitle != null && subtitle.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.black.withValues(alpha: 0.55),
                  ),
                ),
              ),
            if (items.where((e) => e.hasValue).isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  'No details available',
                  style: TextStyle(
                    color: Colors.black.withValues(alpha: 0.45),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              )
            else
              ...items.where((e) => e.hasValue).map(
                (item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 130,
                        child: Text(
                          item.label,
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Colors.black.withValues(alpha: 0.5),
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          item.value!,
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _showChangePasswordDialog() async {
    final message = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _ChangePasswordDialog(),
    );
    if (message != null && message.isNotEmpty && mounted) {
      AppFeedback.success(context, message);
    }
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
                color: AppColors.primaryOnLightText,
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
    final showMoreDetails = activeEmployeeCustomFieldDefs(u?['employeeCustomFieldDefs']).isNotEmpty;
    final name = u?['name']?.toString().trim().isNotEmpty == true
        ? u!['name'].toString().trim()
        : (u?['fullName']?.toString().trim().isNotEmpty == true ? u!['fullName'].toString().trim() : 'User');
    final subtitle = _trimmed(u?['email']) ?? _trimmed(u?['role']) ?? '';
    final workItems = _buildWorkItems(u);
    final contactItems = _buildContactItems(u);
    final personalItems = _buildPersonalItems(u);
    final bankItems = _buildBankItems(u);
    final identityItems = _buildIdentityItems(u);

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
                      _buildSectionCard(
                        title: 'Work information',
                        subtitle: 'Role and department are managed by your admin.',
                        items: workItems,
                      ),
                      const SizedBox(height: 12),
                      _buildSectionCard(
                        title: 'Contact',
                        items: contactItems,
                        editable: true,
                        onEdit: _showPersonalEditSheet,
                      ),
                      const SizedBox(height: 12),
                      _buildSectionCard(
                        title: 'Personal',
                        items: personalItems,
                        editable: true,
                        onEdit: _showPersonalEditSheet,
                      ),
                      const SizedBox(height: 12),
                      _buildSectionCard(
                        title: 'Bank',
                        items: bankItems,
                      ),
                      const SizedBox(height: 12),
                      _buildSectionCard(
                        title: 'Identity',
                        items: identityItems,
                      ),
                      const SizedBox(height: 20),
                      _PasswordUpdateCard(onTap: _showChangePasswordDialog),
                      if (showMoreDetails && u != null) ...[
                        const SizedBox(height: 12),
                        _ProfileMenuCard(
                          icon: Icons.tune_rounded,
                          label: 'More details',
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => EmployeeMoreDetailsScreen(user: Map<String, dynamic>.from(u)),
                              ),
                            );
                          },
                        ),
                      ],
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

/// Tappable card — same visual language as Support, for changing password.
class _PasswordUpdateCard extends StatelessWidget {
  const _PasswordUpdateCard({required this.onTap});

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
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.45), width: 1.2),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.lock_reset_rounded, color: Colors.black87, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Update password',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.black87),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Change your sign-in password',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.black.withValues(alpha: 0.48),
                      ),
                    ),
                  ],
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

class _ChangePasswordDialog extends StatefulWidget {
  const _ChangePasswordDialog();

  @override
  State<_ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<_ChangePasswordDialog> {
  final _old = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  bool _hideOld = true;
  bool _hideNew = true;
  bool _hideConfirm = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _old.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  InputDecoration _fieldDecoration(
    BuildContext context, {
    required String label,
    required IconData icon,
    required bool obscure,
    required VoidCallback onToggleVisibility,
  }) {
    final borderColor = Colors.black.withValues(alpha: 0.09);
    return InputDecoration(
      labelText: label,
      labelStyle: TextStyle(
        fontWeight: FontWeight.w600,
        color: Colors.black.withValues(alpha: 0.55),
        fontSize: 14,
      ),
      prefixIcon: Icon(icon, size: 22, color: Colors.black.withValues(alpha: 0.45)),
      suffixIcon: IconButton(
        tooltip: obscure ? 'Show' : 'Hide',
        onPressed: onToggleVisibility,
        icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 22),
      ),
      filled: true,
      fillColor: const Color(0xFFF4F4F6),
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: borderColor)),
      enabledBorder:
          OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: borderColor)),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppColors.primary, width: 1.8),
      ),
    );
  }

  Future<void> _submit() async {
    final oldPassword = _old.text.trim();
    final newPassword = _new.text.trim();
    final confirm = _confirm.text.trim();
    if (oldPassword.isEmpty || newPassword.isEmpty || confirm.isEmpty) {
      setState(() => _error = 'All password fields are required');
      return;
    }
    if (newPassword.length < 6) {
      setState(() => _error = 'New password must be at least 6 characters');
      return;
    }
    if (newPassword != confirm) {
      setState(() => _error = 'New password and confirmation do not match');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final result = await AuthService().changePassword(
      oldPassword: oldPassword,
      newPassword: newPassword,
    );
    if (!mounted) return;
    if (result['success'] == true) {
      final msg = result['message']?.toString().trim();
      Navigator.of(context).pop(
        msg != null && msg.isNotEmpty ? msg : 'Password updated successfully',
      );
    } else {
      setState(() {
        _submitting = false;
        _error = result['message']?.toString() ?? 'Failed to update password';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 28),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.24),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.lock_reset_rounded, size: 28, color: Colors.black87),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Update password',
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.15),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Use at least 6 characters. You will stay signed in.',
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.35,
                            color: Colors.black.withValues(alpha: 0.5),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _submitting ? null : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                    style: IconButton.styleFrom(foregroundColor: Colors.black45),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              TextField(
                controller: _old,
                obscureText: _hideOld,
                textInputAction: TextInputAction.next,
                decoration: _fieldDecoration(
                  context,
                  label: 'Current password',
                  icon: Icons.key_outlined,
                  obscure: _hideOld,
                  onToggleVisibility: () => setState(() => _hideOld = !_hideOld),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _new,
                obscureText: _hideNew,
                textInputAction: TextInputAction.next,
                decoration: _fieldDecoration(
                  context,
                  label: 'New password',
                  icon: Icons.lock_outline_rounded,
                  obscure: _hideNew,
                  onToggleVisibility: () => setState(() => _hideNew = !_hideNew),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _confirm,
                obscureText: _hideConfirm,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submitting ? null : _submit(),
                decoration: _fieldDecoration(
                  context,
                  label: 'Confirm new password',
                  icon: Icons.lock_person_outlined,
                  obscure: _hideConfirm,
                  onToggleVisibility: () => setState(() => _hideConfirm = !_hideConfirm),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.errorContainer.withValues(alpha: 0.85),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: _submitting ? null : () => Navigator.of(context).pop(),
                    child: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: LocationLoader(size: 20),
                          )
                        : const Text('Save password', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PersonalDetailsEditSheet extends StatefulWidget {
  const _PersonalDetailsEditSheet({
    required this.parentContext,
    required this.phone,
    required this.personalEmail,
    required this.emergency,
    required this.permanentAddress,
    required this.localAddress,
    required this.onReloadProfile,
  });

  final BuildContext parentContext;
  final String phone;
  final String personalEmail;
  final String emergency;
  final String permanentAddress;
  final String localAddress;
  final Future<void> Function() onReloadProfile;

  @override
  State<_PersonalDetailsEditSheet> createState() => _PersonalDetailsEditSheetState();
}

class _PersonalDetailsEditSheetState extends State<_PersonalDetailsEditSheet> {
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _personalEmailCtrl;
  late final TextEditingController _emergencyCtrl;
  late final TextEditingController _permanentAddressCtrl;
  late final TextEditingController _localAddressCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _phoneCtrl = TextEditingController(text: widget.phone);
    _personalEmailCtrl = TextEditingController(text: widget.personalEmail);
    _emergencyCtrl = TextEditingController(text: widget.emergency);
    _permanentAddressCtrl = TextEditingController(text: widget.permanentAddress);
    _localAddressCtrl = TextEditingController(text: widget.localAddress);
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _personalEmailCtrl.dispose();
    _emergencyCtrl.dispose();
    _permanentAddressCtrl.dispose();
    _localAddressCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final payload = <String, dynamic>{
      'phone': _phoneCtrl.text.trim(),
      'personalEmail': _personalEmailCtrl.text.trim(),
      'emergencyContact': _emergencyCtrl.text.trim(),
      'permanentAddress': _permanentAddressCtrl.text.trim(),
      'localAddress': _localAddressCtrl.text.trim(),
    };
    payload.removeWhere((_, value) => value.toString().trim().isEmpty);
    final res = await AuthService().updateProfile(payload);
    if (!mounted) return;
    if (res['success'] == true) {
      Navigator.of(context).pop();
      if (widget.parentContext.mounted) {
        AppFeedback.success(widget.parentContext, 'Personal details updated');
      }
      await widget.onReloadProfile();
      return;
    }
    setState(() => _saving = false);
    if (widget.parentContext.mounted) {
      AppFeedback.error(
        widget.parentContext,
        res['message']?.toString() ?? 'Failed to update details',
      );
    }
  }

  static const Color _editLabelGrey = Color(0xFF757575);
  static const Color _editHintGrey = Color(0xFF9E9E9E);

  InputDecoration _deco(String label, {IconData? icon}) => InputDecoration(
        labelText: label,
        floatingLabelBehavior: FloatingLabelBehavior.auto,
        labelStyle: const TextStyle(
          color: _editLabelGrey,
          fontWeight: FontWeight.w500,
          fontSize: 15,
        ),
        floatingLabelStyle: const TextStyle(
          color: Color(0xFF616161),
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
        hintStyle: const TextStyle(
          color: _editHintGrey,
          fontWeight: FontWeight.w400,
          fontSize: 15,
        ),
        prefixIcon: icon == null ? null : Icon(icon, size: 20, color: _editLabelGrey),
        filled: true,
        fillColor: const Color(0xFFF7F7F8),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        14,
        16,
        MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Edit personal details',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: _deco('Phone', icon: Icons.call_outlined),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _personalEmailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: _deco('Personal email', icon: Icons.mail_outline),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _emergencyCtrl,
              keyboardType: TextInputType.phone,
              decoration: _deco('Emergency contact', icon: Icons.contact_phone_outlined),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _permanentAddressCtrl,
              maxLines: 2,
              decoration: _deco('Permanent address'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _localAddressCtrl,
              maxLines: 2,
              decoration: _deco('Local address'),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.black87,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.black54,
                      ),
                    )
                  : const Text(
                      'Save',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
            ),
          ],
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

class _ProfileItem {
  const _ProfileItem(this.label, this.value);

  final String label;
  final String? value;

  bool get hasValue => value != null && value!.trim().isNotEmpty;
}
