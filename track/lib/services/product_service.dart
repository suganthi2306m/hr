// track/lib/services/product_service.dart
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/models/company_product.dart';
import 'api_client.dart';

class ProductService {
  final ApiClient _api = ApiClient();

  bool _isActiveAndVisible(Map<String, dynamic> item) {
    final status = '${item['status'] ?? 'active'}'.trim().toLowerCase();
    final showInApp = item['showInApp'];
    final visible = showInApp == null ? true : showInApp == true;
    return status == 'active' && visible;
  }

  Future<void> _setToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token != null) _api.setAuthToken(token);
  }

  Future<CompanyProductHome> fetchHome() async {
    await _setToken();
    final response = await _api.dio.get<Map<String, dynamic>>('/products/home');
    final data = response.data;
    if (data == null) return CompanyProductHome.empty();
    List<Map<String, dynamic>> keep(dynamic raw) {
      if (raw is! List) return const [];
      return raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .where(_isActiveAndVisible)
          .toList();
    }

    return CompanyProductHome.fromJson({
      ...data,
      'banners': keep(data['banners']),
      'highlighted': keep(data['highlighted']),
    });
  }

  Future<List<CompanyProductCard>> fetchCatalog() async {
    await _setToken();
    final response = await _api.dio.get<Map<String, dynamic>>('/products');
    final body = response.data;
    if (body == null) return [];
    final raw = body['items'];
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where(_isActiveAndVisible)
        .map(CompanyProductCard.fromJson)
        .toList();
  }

  Future<CompanyProductDetail?> fetchById(String id) async {
    await _setToken();
    final response = await _api.dio.get<Map<String, dynamic>>('/products/$id');
    final body = response.data;
    final item = body?['item'];
    if (item is! Map) return null;
    final mapped = Map<String, dynamic>.from(item);
    if (!_isActiveAndVisible(mapped)) return null;
    return CompanyProductDetail.fromJson(mapped);
  }
}
