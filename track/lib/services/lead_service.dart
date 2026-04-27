import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import '../models/lead.dart';

class LeadService {
  final ApiClient _api = ApiClient();

  Future<void> _setToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token != null) _api.setAuthToken(token);
  }

  Future<List<LeadItem>> listLeads({String search = '', String status = '', DateTime? from, DateTime? to}) async {
    await _setToken();
    final qp = <String, dynamic>{};
    if (search.trim().isNotEmpty) qp['search'] = search.trim();
    if (status.trim().isNotEmpty) qp['status'] = status.trim();
    if (from != null) qp['from'] = from.toIso8601String();
    if (to != null) qp['to'] = to.toIso8601String();
    final res = await _api.dio.get<Map<String, dynamic>>('/leads', queryParameters: qp);
    final items = (res.data?['items'] is List) ? (res.data!['items'] as List) : const [];
    return items.whereType<Map<String, dynamic>>().map(LeadItem.fromJson).toList();
  }

  Future<LeadItem> getLeadById(String id) async {
    await _setToken();
    final res = await _api.dio.get<Map<String, dynamic>>('/leads/$id');
    final item = (res.data?['item'] is Map<String, dynamic>) ? res.data!['item'] as Map<String, dynamic> : <String, dynamic>{};
    return LeadItem.fromJson(item);
  }

  /// All follow-ups on this lead visible to the logged-in user (embedded + web), newest first.
  Future<List<FollowUpFeedItem>> listLeadFollowUpHistory(String leadId) async {
    await _setToken();
    final res = await _api.dio.get<Map<String, dynamic>>('/leads/$leadId/followups/history');
    final items = (res.data?['items'] is List) ? (res.data!['items'] as List) : const [];
    return items.whereType<Map<String, dynamic>>().map(FollowUpFeedItem.fromJson).toList();
  }

  Future<void> createLead({
    required String leadName,
    required String companyName,
    required String emailId,
    required String phoneNumber,
    required String source,
    required String status,
    required String addressText,
  }) async {
    await _setToken();
    await _api.dio.post('/leads', data: {
      'leadName': leadName.trim(),
      'companyName': companyName.trim(),
      'emailId': emailId.trim(),
      'phoneNumber': phoneNumber.trim(),
      'source': source.trim(),
      'status': status.trim().isEmpty ? 'new' : status.trim(),
      'address': {'text': addressText.trim()},
    });
  }

  Future<void> addFollowUp({
    required String leadId,
    required String note,
    required String actionType,
    DateTime? nextFollowUpAt,
    String? statusAfter,
  }) async {
    await _setToken();
    await _api.dio.post('/leads/$leadId/followups', data: {
      'note': note.trim(),
      'actionType': actionType,
      'nextFollowUpAt': nextFollowUpAt?.toIso8601String(),
      'statusAfter': statusAfter,
    });
  }

  Future<List<FollowUpFeedItem>> listFollowUps({
    String search = '',
    String companyName = '',
    String status = '',
    DateTime? from,
    DateTime? to,
  }) async {
    await _setToken();
    final qp = <String, dynamic>{};
    if (search.trim().isNotEmpty) qp['search'] = search.trim();
    if (companyName.trim().isNotEmpty) qp['companyName'] = companyName.trim();
    if (status.trim().isNotEmpty) qp['status'] = status.trim();
    if (from != null) qp['from'] = from.toIso8601String();
    if (to != null) qp['to'] = to.toIso8601String();
    final res = await _api.dio.get<Map<String, dynamic>>('/leads/followups', queryParameters: qp);
    final items = (res.data?['items'] is List) ? (res.data!['items'] as List) : const [];
    return items.whereType<Map<String, dynamic>>().map(FollowUpFeedItem.fromJson).toList();
  }

  Future<void> updateFollowUp({
    required String leadId,
    required String followUpId,
    required String note,
    required String actionType,
    DateTime? nextFollowUpAt,
    String? statusAfter,
  }) async {
    await _setToken();
    await _api.dio.put('/leads/$leadId/followups/$followUpId', data: {
      'note': note.trim(),
      'actionType': actionType,
      'nextFollowUpAt': nextFollowUpAt?.toIso8601String(),
      'statusAfter': statusAfter,
    });
  }

  Future<void> updateStatus(String leadId, String status) async {
    await _setToken();
    await _api.dio.put('/leads/$leadId', data: {'status': status});
  }

  Future<void> convertToCustomer(String leadId) async {
    await _setToken();
    await _api.dio.post('/leads/$leadId/convert');
  }

  Future<List<Map<String, dynamic>>> upcomingFollowUps() async {
    await _setToken();
    final res = await _api.dio.get<Map<String, dynamic>>('/leads/followups/upcoming');
    final items = (res.data?['items'] is List) ? (res.data!['items'] as List) : const [];
    return items.whereType<Map<String, dynamic>>().toList();
  }
}
