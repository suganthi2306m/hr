/// Attendance template collection has been removed from app usage.
/// This store is intentionally no-op for backward compatibility.
library;

class AttendanceTemplateStore {
  static Future<void> saveTemplateDetails(Map<String, dynamic> details) async {
    // no-op
  }

  static Future<Map<String, dynamic>?> loadTemplateDetails() async {
    return null;
  }

  static Future<Map<String, dynamic>?> loadEffectiveTemplateMap() async {
    return null;
  }

  static Future<String> appendRequireSelfieGeolocationToMessage(
    String message,
  ) async {
    return message;
  }

  static Future<void> clear() async {
    // no-op
  }
}
