// hrms/lib/services/customer_service.dart
import 'dart:convert';

import 'package:track/models/customer.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';

class CustomerService {
  final ApiClient _api = ApiClient();

  Future<void> _setToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token != null) _api.setAuthToken(token);
  }

  Future<Customer> getCustomerById(String id) async {
    await _setToken();
    final response = await _api.dio.get<Map<String, dynamic>>('/customers/$id');
    final data = response.data;
    if (data == null) throw Exception('Failed to load customer');
    return Customer.fromJson(data);
  }

  Future<List<Customer>> getAllCustomers() async {
    await _setToken();
    final response = await _api.dio.get<dynamic>('/customers');
    final body = response.data;
    if (body is List) {
      return List<Customer>.from(
        (body).map((e) => Customer.fromJson(e as Map<String, dynamic>)),
      );
    }
    if (body is Map && body['data'] != null) {
      final list = body['data'] as List;
      return List<Customer>.from(
        list.map((e) => Customer.fromJson(e as Map<String, dynamic>)),
      );
    }
    throw Exception('Failed to load customers');
  }

  Future<Customer> createCustomer(Customer customer) async {
    await _setToken();
    final prefs = await SharedPreferences.getInstance();
    final raw = Map<String, dynamic>.from(customer.toJson());
    raw.removeWhere((k, v) => v == null || (v is String && v.trim().isEmpty));
    final userRaw = prefs.getString('user');
    Map<String, dynamic> user = <String, dynamic>{};
    if (userRaw != null && userRaw.isNotEmpty) {
      user = customerFromJsonSafe(userRaw);
    }
    // Ensure backend receives tenant/company context when required.
    if (!raw.containsKey('companyId') && !raw.containsKey('businessId')) {
      try {
        final companyId = _extractId(user['companyId']);
        final businessId = _extractId(user['businessId']);
        if (companyId != null && companyId.isNotEmpty) {
          raw['companyId'] = companyId;
        }
        if (businessId != null && businessId.isNotEmpty) {
          raw['businessId'] = businessId;
        } else if (companyId != null && companyId.isNotEmpty) {
          // Backend variants may validate either businessId or companyId.
          raw['businessId'] = companyId;
        }
      } catch (_) {
        // Ignore parse issues; backend will return validation error if needed.
      }
    }
    if (!raw.containsKey('companyName') ||
        (raw['companyName'] is String &&
            (raw['companyName'] as String).trim().isEmpty)) {
      final userCompanyName = user['companyName']?.toString().trim();
      if (userCompanyName != null && userCompanyName.isNotEmpty) {
        raw['companyName'] = userCompanyName;
      } else if (user['company'] is Map &&
          user['company']['name'] != null &&
          user['company']['name'].toString().trim().isNotEmpty) {
        raw['companyName'] = user['company']['name'].toString().trim();
      }
    }
    final response = await _api.dio.post<Map<String, dynamic>>(
      '/customers',
      data: raw,
    );
    final data = response.data;
    if (data == null) throw Exception('Failed to create customer');
    return Customer.fromJson(data);
  }

  Future<Customer> updateCustomer(String id, Customer customer) async {
    await _setToken();
    final response = await _api.dio.put<Map<String, dynamic>>(
      '/customers/$id',
      data: customer.toJson(),
    );
    final data = response.data;
    if (data == null) throw Exception('Failed to update customer');
    return Customer.fromJson(data);
  }

  Future<void> deleteCustomer(String id) async {
    await _setToken();
    final response = await _api.dio.delete('/customers/$id');
    if (response.statusCode != 204 && response.statusCode != 200) {
      throw Exception('Failed to delete customer');
    }
  }

  Map<String, dynamic> customerFromJsonSafe(String jsonString) {
    try {
      final decoded = jsonDecode(jsonString);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
      return <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
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
}
