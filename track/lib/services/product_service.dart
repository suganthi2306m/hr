// track/lib/services/product_service.dart
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/models/company_product.dart';
import 'api_client.dart';

class ProductService {
  final ApiClient _api = ApiClient();

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
    return CompanyProductHome.fromJson(data);
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
        .map((e) => CompanyProductCard.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<CompanyProductDetail?> fetchById(String id) async {
    await _setToken();
    final response = await _api.dio.get<Map<String, dynamic>>('/products/$id');
    final body = response.data;
    final item = body?['item'];
    if (item is! Map) return null;
    return CompanyProductDetail.fromJson(Map<String, dynamic>.from(item));
  }
}
