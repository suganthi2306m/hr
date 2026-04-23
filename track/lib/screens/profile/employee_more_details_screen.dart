import 'package:flutter/material.dart';
import 'package:track/utils/employee_custom_fields_display.dart';

/// Shows company-configured employee custom fields and values from [user] (merged session + profile).
class EmployeeMoreDetailsScreen extends StatelessWidget {
  const EmployeeMoreDetailsScreen({super.key, required this.user});

  final Map<String, dynamic> user;

  @override
  Widget build(BuildContext context) {
    final defs = activeEmployeeCustomFieldDefs(user['employeeCustomFieldDefs']);
    final custom = employeeProfileCustomMap(user);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        centerTitle: true,
        title: const Text('More details', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: defs.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'No extra fields are configured for your organization.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 15,
                    color: Colors.black.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              itemCount: defs.length,
              separatorBuilder: (_, __) => Divider(height: 1, color: Colors.black.withValues(alpha: 0.06)),
              itemBuilder: (context, i) {
                final def = defs[i];
                final key = def['key']?.toString() ?? '';
                final label = def['label']?.toString().trim().isNotEmpty == true
                    ? def['label'].toString().trim()
                    : key;
                final category = def['category']?.toString().trim();
                final raw = custom[key];
                final valueText = displayCustomFieldValue(def, raw);
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 2,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              label,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                                color: Colors.black87,
                              ),
                            ),
                            if (category != null && category.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  category,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.black.withValues(alpha: 0.45),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      Expanded(
                        flex: 3,
                        child: SelectableText(
                          valueText,
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
    );
  }
}
