/// Company [employeeCustomFieldDefs] + User [employeeProfile.custom] helpers for profile UI.

List<Map<String, dynamic>> activeEmployeeCustomFieldDefs(dynamic raw) {
  if (raw is! List) return const [];
  final out = <Map<String, dynamic>>[];
  for (final e in raw) {
    if (e is! Map) continue;
    final m = Map<String, dynamic>.from(e);
    if (m['isActive'] == false) continue;
    final key = m['key']?.toString().trim();
    if (key == null || key.isEmpty) continue;
    out.add(m);
  }
  return out;
}

Map<String, dynamic> employeeProfileCustomMap(Map<String, dynamic>? user) {
  if (user == null) return {};
  final ep = user['employeeProfile'];
  if (ep is! Map) return {};
  final c = ep['custom'];
  if (c is! Map) return {};
  return c.map((k, v) => MapEntry(k.toString(), v));
}

String displayCustomFieldValue(Map<String, dynamic> def, dynamic rawValue) {
  if (rawValue == null) return '—';
  final fieldType = def['fieldType']?.toString().toLowerCase() ?? 'text';
  if (fieldType == 'checkbox' || fieldType == 'boolean') {
    final b = rawValue == true || rawValue == 'true' || rawValue == 1 || rawValue == '1';
    return b ? 'Yes' : 'No';
  }
  final rawStr = rawValue.toString().trim();
  if (rawStr.isEmpty) return '—';
  final opts = def['options'];
  if (opts is List) {
    for (final o in opts) {
      if (o is! Map) continue;
      final ov = o['value']?.toString();
      if (ov != null && ov == rawStr) {
        final lab = o['label']?.toString().trim();
        return lab != null && lab.isNotEmpty ? lab : rawStr;
      }
    }
  }
  return rawStr;
}
