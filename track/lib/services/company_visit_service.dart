import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/company_visit.dart';
import 'api_client.dart';

class CompanyVisitService {
  CompanyVisitService._();
  static final CompanyVisitService _instance = CompanyVisitService._();
  factory CompanyVisitService() => _instance;

  final ApiClient _api = ApiClient();
  static final _dayKey = DateFormat('yyyy-MM-dd');

  Future<void> _setAuthToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token != null && token.isNotEmpty) {
      _api.setAuthToken(token.replaceAll('"', ''));
    }
  }

  static List<Map<String, dynamic>> _visitRowsFromBody(dynamic body) {
    if (body is! Map) return [];
    final m = Map<String, dynamic>.from(body);
    final data = m['data'];
    if (data is List) {
      return data
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e.cast<String, dynamic>()))
          .toList();
    }
    if (data is Map && data['items'] is List) {
      final list = data['items'] as List;
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e.cast<String, dynamic>()))
          .toList();
    }
    final items = m['items'];
    if (items is List) {
      return items
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e.cast<String, dynamic>()))
          .toList();
    }
    return [];
  }

  /// [date] calendar day; [status] `open`, `completed`, or null for both.
  Future<List<CompanyVisitRecord>> fetchMyVisits({
    required DateTime date,
    String? status,
  }) async {
    await _setAuthToken();
    final q = <String, dynamic>{'date': _dayKey.format(date)};
    if (status != null && status.isNotEmpty) {
      q['status'] = status;
    }
    final res = await _api.request<Map<String, dynamic>>(
      '/company-visits',
      method: 'GET',
      queryParameters: q,
    );
    final rows = _visitRowsFromBody(res.data);
    return rows.map(CompanyVisitRecord.fromJson).toList();
  }

  /// Visits for [customerId] in [from]..[to] (inclusive calendar days), optional [staffUserId] filter.
  Future<List<CompanyVisitRecord>> fetchVisitsForCustomer({
    required String customerId,
    required DateTime from,
    required DateTime to,
    String? staffUserId,
    int limit = 200,
  }) async {
    await _setAuthToken();
    final q = <String, dynamic>{
      'customerId': customerId,
      'dateFrom': _dayKey.format(from),
      'dateTo': _dayKey.format(to),
      'limit': limit,
      'page': 1,
    };
    if (staffUserId != null && staffUserId.isNotEmpty) {
      q['userId'] = staffUserId;
    }
    final res = await _api.request<Map<String, dynamic>>(
      '/company-visits',
      method: 'GET',
      queryParameters: q,
    );
    final rows = _visitRowsFromBody(res.data);
    var list = rows.map(CompanyVisitRecord.fromJson).toList();
    if (staffUserId != null && staffUserId.isNotEmpty) {
      final attributed = list.where((v) => v.staffUserId != null).toList();
      if (attributed.isNotEmpty) {
        list = list.where((v) => v.staffUserId == staffUserId).toList();
      }
    }
    list.sort((a, b) => b.checkInTime.compareTo(a.checkInTime));
    return list;
  }
}
