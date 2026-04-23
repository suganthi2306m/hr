/// Server-backed check-in / check-out reminder times (`/attendance/alarms`).
class AttendanceAlarmSettings {
  const AttendanceAlarmSettings({
    required this.checkInEnabled,
    required this.checkOutEnabled,
    required this.checkInMinutes,
    required this.checkOutMinutes,
  });

  final bool checkInEnabled;
  final bool checkOutEnabled;
  /// Minutes from local midnight (0–1439).
  final int checkInMinutes;
  final int checkOutMinutes;

  static AttendanceAlarmSettings fromJson(Map<String, dynamic>? json) {
    if (json == null || json.isEmpty) {
      return const AttendanceAlarmSettings(
        checkInEnabled: false,
        checkOutEnabled: false,
        checkInMinutes: 9 * 60,
        checkOutMinutes: 18 * 60,
      );
    }
    bool b(dynamic v) => v == true || v.toString().toLowerCase() == 'true';
    int m(dynamic v, int fallback) {
      final n = int.tryParse(v?.toString() ?? '');
      if (n == null) return fallback;
      return n.clamp(0, 24 * 60 - 1);
    }

    return AttendanceAlarmSettings(
      checkInEnabled: b(json['checkInEnabled']),
      checkOutEnabled: b(json['checkOutEnabled']),
      checkInMinutes: m(json['checkInMinutes'], 9 * 60),
      checkOutMinutes: m(json['checkOutMinutes'], 18 * 60),
    );
  }

  Map<String, dynamic> toJson() => {
        'checkInEnabled': checkInEnabled,
        'checkOutEnabled': checkOutEnabled,
        'checkInMinutes': checkInMinutes,
        'checkOutMinutes': checkOutMinutes,
      };
}
