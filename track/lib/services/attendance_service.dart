import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/attendance_record.dart';
import 'api_client.dart';

class AttendanceService {
  AttendanceService._();
  static final AttendanceService _instance = AttendanceService._();
  factory AttendanceService() => _instance;

  static const String _pendingOpsKey = 'attendance_pending_ops_v1';
  final ApiClient _api = ApiClient();

  /// Cleared on logout so a new session always reloads the token from prefs.
  String? _cachedTokenForApi;

  static void invalidateAuthMemo() {
    _instance._cachedTokenForApi = null;
  }

  /// Some gateways or older stacks expose `check-in` / `check-out` instead of `checkin` / `checkout`.
  static String? _alternateAttendancePathOn404(String path) {
    switch (path) {
      case '/attendance/checkin':
        return '/attendance/check-in';
      case '/attendance/checkout':
        return '/attendance/check-out';
      default:
        return null;
    }
  }

  static String _dioErrorMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map) {
      final m = data['message']?.toString();
      if (m != null && m.trim().isNotEmpty) return m.trim();
      final c = data['code']?.toString();
      if (c != null && c.trim().isNotEmpty) return c.trim();
    }
    return e.message?.trim().isNotEmpty == true ? e.message!.trim() : e.toString();
  }

  /// Queue only when retry might succeed (network / server errors), not 4xx validation failures.
  static bool _shouldQueueAttendanceOp(DioException e) {
    final code = e.response?.statusCode;
    if (code == null) return true;
    if (code == 429) return true;
    if (code >= 500) return true;
    return false;
  }

  Future<Response<Map<String, dynamic>>> _postAttendanceMultipart(
    String path,
    FormData form,
  ) async {
    final punchOptions = Options(
      receiveTimeout: const Duration(seconds: 40),
      sendTimeout: const Duration(seconds: 90),
    );
    try {
      return await _api.request<Map<String, dynamic>>(
        path,
        method: 'POST',
        data: form,
        options: punchOptions,
      );
    } on DioException catch (e) {
      if (e.response?.statusCode != 404) rethrow;
      final alt = _alternateAttendancePathOn404(path);
      if (alt == null) rethrow;
      return await _api.request<Map<String, dynamic>>(
        alt,
        method: 'POST',
        data: form,
        options: punchOptions,
      );
    }
  }

  /// Warms auth + token cache while the camera opens so the punch POST starts sooner.
  Future<void> warmupAuth() => _setAuthToken();

  Future<void> _setAuthToken() async {
    if (_cachedTokenForApi != null && _cachedTokenForApi!.isNotEmpty) {
      _api.setAuthToken(_cachedTokenForApi!);
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('token');
    if (raw == null || raw.isEmpty) {
      _cachedTokenForApi = null;
      return;
    }
    final token = raw.replaceAll('"', '');
    _cachedTokenForApi = token;
    _api.setAuthToken(token);
  }

  /// When [from] and [to] are set, loads that date range (paginates server-side up to 200 rows per page).
  /// When omitted, uses the default `/attendance/history` behaviour (recent page, same as before).
  Future<List<AttendanceRecord>> fetchHistory({
    DateTime? from,
    DateTime? to,
  }) async {
    await _setAuthToken();
    if (from != null && to != null) {
      return _fetchHistoryDateRange(from, to);
    }
    final res = await _api.request<Map<String, dynamic>>(
      '/attendance/history',
      method: 'GET',
    );
    final list = (res.data?['data'] as List?) ?? const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(AttendanceRecord.fromJson)
        .toList();
  }

  Future<List<AttendanceRecord>> _fetchHistoryDateRange(
    DateTime from,
    DateTime to,
  ) async {
    final out = <AttendanceRecord>[];
    var page = 1;
    while (true) {
      final res = await _api.request<Map<String, dynamic>>(
        '/attendance/history',
        method: 'GET',
        queryParameters: <String, dynamic>{
          'from': from.toIso8601String(),
          'to': to.toIso8601String(),
          'limit': 200,
          'page': page,
        },
      );
      final list = (res.data?['data'] as List?) ?? const [];
      final batch = list
          .whereType<Map<String, dynamic>>()
          .map(AttendanceRecord.fromJson)
          .toList();
      out.addAll(batch);
      final pag = res.data?['pagination'];
      final totalPages = pag is Map
          ? (pag['pages'] as num?)?.toInt() ?? 1
          : 1;
      if (page >= totalPages || batch.length < 200) break;
      page++;
    }
    return out;
  }

  Future<List<LeaveRequestRecord>> fetchLeaveStatus() async {
    await _setAuthToken();
    final res = await _api.request<Map<String, dynamic>>(
      '/leave/status',
      method: 'GET',
    );
    final list = (res.data?['data'] as List?) ?? const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(LeaveRequestRecord.fromJson)
        .toList();
  }

  Future<Map<String, dynamic>> checkIn({
    required String selfiePath,
    required Position position,
    String? address,
  }) {
    return _submitAttendance(
      path: '/attendance/checkin',
      selfiePath: selfiePath,
      position: position,
      address: address,
      queueType: 'checkin',
    );
  }

  Future<Map<String, dynamic>> checkOut({
    required String selfiePath,
    required Position position,
    String? address,
  }) {
    return _submitAttendance(
      path: '/attendance/checkout',
      selfiePath: selfiePath,
      position: position,
      address: address,
      queueType: 'checkout',
    );
  }

  /// After a successful online check-in, drop any queued check-outs — they would hit the
  /// new open session and look like an "automatic checkout". After check-out, drop queued
  /// check-ins to avoid duplicate-day punches when replaying.
  Future<void> _purgeConflictingPendingAfterSuccess(String succeededQueueType) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pendingOpsKey);
    if (raw == null || raw.isEmpty) return;
    final list = (jsonDecode(raw) as List).whereType<Map<String, dynamic>>().toList();
    if (succeededQueueType == 'checkin') {
      list.removeWhere((op) => op['type']?.toString() == 'checkout');
    } else if (succeededQueueType == 'checkout') {
      list.removeWhere((op) => op['type']?.toString() == 'checkin');
    }
    await prefs.setString(_pendingOpsKey, jsonEncode(list));
  }

  Future<Map<String, dynamic>> _submitAttendance({
    required String path,
    required String selfiePath,
    required Position position,
    required String queueType,
    String? address,
  }) async {
    await _setAuthToken();
    final file = File(selfiePath);
    if (!file.existsSync()) {
      throw Exception('Selfie file not found');
    }
    // Text fields before the file — some multipart stacks parse fields more reliably this way.
    final form = FormData.fromMap({
      'lat': position.latitude.toString(),
      'lng': position.longitude.toString(),
      'latitude': position.latitude.toString(),
      'longitude': position.longitude.toString(),
      'accuracy': position.accuracy.toString(),
      'isMocked': position.isMocked.toString(),
      'address': address ?? '',
      'selfie': await MultipartFile.fromFile(
        selfiePath,
        filename: selfiePath.split(Platform.pathSeparator).last,
      ),
    });

    try {
      final res = await _postAttendanceMultipart(path, form);
      await _purgeConflictingPendingAfterSuccess(queueType);
      return res.data ?? <String, dynamic>{};
    } on DioException catch (e) {
      if (_shouldQueueAttendanceOp(e)) {
        await _enqueuePendingOp({
          'type': queueType,
          'selfiePath': selfiePath,
          'lat': position.latitude,
          'lng': position.longitude,
          'accuracy': position.accuracy,
          'isMocked': position.isMocked,
          'address': address ?? '',
          'createdAt': DateTime.now().toIso8601String(),
        });
      }
      throw Exception(_dioErrorMessage(e));
    }
  }

  Future<Map<String, dynamic>> applyLeave({
    required String leaveType,
    required DateTime fromDate,
    required DateTime toDate,
    required String reason,
  }) async {
    await _setAuthToken();
    final res = await _api.request<Map<String, dynamic>>(
      '/leave/apply',
      method: 'POST',
      data: {
        'leaveType': leaveType,
        'fromDate': fromDate.toIso8601String(),
        'toDate': toDate.toIso8601String(),
        'reason': reason,
      },
    );
    return res.data ?? <String, dynamic>{};
  }

  Future<void> syncPendingOps() async {
    await _setAuthToken();
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pendingOpsKey);
    if (raw == null || raw.isEmpty) return;
    final pending = (jsonDecode(raw) as List)
        .whereType<Map<String, dynamic>>()
        .toList();
    if (pending.isEmpty) return;

    pending.sort((a, b) {
      final ca = a['type']?.toString() == 'checkout' ? 1 : 0;
      final cb = b['type']?.toString() == 'checkout' ? 1 : 0;
      return ca.compareTo(cb);
    });

    final work = List<Map<String, dynamic>>.from(pending);
    final stillPending = <Map<String, dynamic>>[];
    while (work.isNotEmpty) {
      final op = work.removeAt(0);
      final selfiePath = op['selfiePath']?.toString() ?? '';
      final file = File(selfiePath);
      if (!file.existsSync()) continue;
      final type = op['type']?.toString() ?? 'checkin';
      final endpoint =
          type == 'checkout' ? '/attendance/checkout' : '/attendance/checkin';
      try {
        final lat = '${op['lat'] ?? ''}';
        final lng = '${op['lng'] ?? ''}';
        final form = FormData.fromMap({
          'lat': lat,
          'lng': lng,
          'latitude': lat,
          'longitude': lng,
          'accuracy': '${op['accuracy'] ?? ''}',
          'isMocked': '${op['isMocked'] ?? false}',
          'address': op['address']?.toString() ?? '',
          'selfie': await MultipartFile.fromFile(
            selfiePath,
            filename: selfiePath.split(Platform.pathSeparator).last,
          ),
        });
        await _postAttendanceMultipart(endpoint, form);
        await _purgeConflictingPendingAfterSuccess(type);
        if (type == 'checkin') {
          work.removeWhere((o) => o['type']?.toString() == 'checkout');
        } else if (type == 'checkout') {
          work.removeWhere((o) => o['type']?.toString() == 'checkin');
        }
      } on DioException catch (e) {
        final code = e.response?.statusCode;
        final msg = _dioErrorMessage(e).toLowerCase();
        final staleCheckout = type == 'checkout' &&
            code == 400 &&
            (msg.contains('no active check-in') ||
                msg.contains('no active') ||
                msg.contains('already checked in') ||
                msg.contains('already marked for today'));
        if (!staleCheckout) {
          stillPending.add(op);
        }
      } catch (_) {
        stillPending.add(op);
      }
    }
    await prefs.setString(_pendingOpsKey, jsonEncode(stillPending));
  }

  Future<void> _enqueuePendingOp(Map<String, dynamic> op) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pendingOpsKey);
    final list = raw == null || raw.isEmpty
        ? <Map<String, dynamic>>[]
        : (jsonDecode(raw) as List).whereType<Map<String, dynamic>>().toList();
    list.add(op);
    await prefs.setString(_pendingOpsKey, jsonEncode(list));
  }
}
