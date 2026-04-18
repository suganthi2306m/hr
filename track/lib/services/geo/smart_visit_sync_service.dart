import 'dart:async';
import 'dart:convert';
import 'dart:developer' as dev;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:track/config/constants.dart';
import 'package:geolocator/geolocator.dart' as gl;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/services/api_client.dart';
import 'package:track/services/fcm_service.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:track/utils/snackbar_utils.dart';

/// Smart geofence-based company visit auto check-in/out with offline queue.
/// Only one open visit at a time locally; after checkout, the same customer can auto check-in again the same day.
/// Uses backend endpoints:
/// - GET /customers/nearby?lat=..&lng=..&maxDistance=2000 (customers must have geoLocation)
/// - POST /company-visits/checkin
/// - POST /company-visits/checkout
class SmartVisitSyncService {
  SmartVisitSyncService._();
  static final SmartVisitSyncService _instance = SmartVisitSyncService._();
  factory SmartVisitSyncService() => _instance;

  static const String _logTag = '[CompanyVisitAuto]';

  static const _kVisit = 'smart_visit_current';
  static const _kQueue = 'smart_visit_queue';
  static const _kLastProcessMs = 'smart_visit_last_process_ms';

  static const double checkInRadiusM = 50;
  static const double checkOutRadiusM = 50;
  static const int checkoutDelaySeconds = 30;
  static const int minVisitDurationSeconds = 120;
  static const int processCooldownMs = 8000;
  static const Duration _autoVisitSnackDuration = Duration(seconds: 4);
  final ApiClient _api = ApiClient();
  Timer? _checkoutTimer;

  /// DevTools Logging (name `CompanyVisitAuto`) + debug console when [kDebugMode].
  void _visitLog(String message) {
    if (AppConstants.logSmartVisitToDevTools) {
      dev.log(message, name: 'CompanyVisitAuto');
    }
    if (kDebugMode) {
      debugPrint(message);
    }
  }

  Future<void> _delayedCheckout({
    required String scheduledCustomerId,
    required double lat,
    required double lng,
  }) async {
    try {
      final latestVisit = await _loadVisit();
      if (latestVisit == null) return;
      if (latestVisit.customerId != scheduledCustomerId) return;
      final elapsed =
          DateTime.now().difference(latestVisit.checkInTime).inSeconds;
      if (elapsed < minVisitDurationSeconds) return;
      await _checkOut(latestVisit, lat, lng);
    } catch (e, _) {
      _visitLog('$_logTag delayed checkout error: $e');
    }
  }

  Future<void> onLocationUpdate({required double lat, required double lng}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      final lastMs = prefs.getInt(_kLastProcessMs) ?? 0;
      if (nowMs - lastMs < processCooldownMs) {
        _visitLog(
          '$_logTag tick skip cooldown '
          '${nowMs - lastMs}ms < ${processCooldownMs}ms',
        );
        return;
      }
      await prefs.setInt(_kLastProcessMs, nowMs);

      await _flushQueue();

      final visit = await _loadVisit();
      final nearby = await _fetchNearby(lat: lat, lng: lng);

      _visitLog(
        '$_logTag tick lat=${lat.toStringAsFixed(6)} lng=${lng.toStringAsFixed(6)} '
        'openVisit=${visit != null} (customerId=${visit?.customerId ?? "—"}) '
        'nearbyWithGeo=${nearby.length}',
      );

      if (visit == null) {
        // Auto check-in: nearest within 50m.
        final inRange = nearby.where((n) => (n.distanceM ?? 1e9) <= checkInRadiusM).toList();
        if (nearby.isNotEmpty) {
          for (final n in nearby) {
            _visitLog(
              '$_logTag   candidate id=${n.customerId} '
              'dist=${n.distanceM?.toStringAsFixed(1) ?? "—"}m '
              'label=${n.displayName ?? "—"}',
            );
          }
        }
        if (inRange.isNotEmpty) {
          final selected = inRange.first;
          _visitLog(
            '$_logTag AUTO CHECK-IN → customerId=${selected.customerId} '
            'name=${selected.displayName ?? "—"} '
            'distance=${selected.distanceM?.toStringAsFixed(1) ?? "—"}m '
            '(radius<=${checkInRadiusM}m)',
          );
          await _checkIn(selected, lat, lng);
        } else if (nearby.isNotEmpty) {
          _visitLog(
            '$_logTag no auto check-in: ${nearby.length} nearby but none within '
            '${checkInRadiusM}m',
          );
        }
        return;
      }

      final stillNear = nearby.any((n) => n.customerId == visit.customerId && (n.distanceM ?? 1e9) <= checkOutRadiusM);
      if (stillNear) {
        _visitLog(
          '$_logTag still within checkout radius customerId=${visit.customerId}',
        );
        _checkoutTimer?.cancel();
        return;
      }

      // Delay checkout to avoid GPS drift (async work must not throw from Timer — zone would log unhandled).
      final scheduledCustomerId = visit.customerId;
      _visitLog(
        '$_logTag scheduling delayed checkout in ${checkoutDelaySeconds}s '
        'customerId=$scheduledCustomerId (left ${checkOutRadiusM}m radius)',
      );
      _checkoutTimer ??= Timer(const Duration(seconds: checkoutDelaySeconds), () {
        _checkoutTimer = null;
        unawaited(
          _delayedCheckout(
            scheduledCustomerId: scheduledCustomerId,
            lat: lat,
            lng: lng,
          ),
        );
      });
    } catch (e, _) {
      _visitLog('$_logTag onLocationUpdate error: $e');
    }
  }

  /// Avoids "Acme Company company" when the API already includes "company".
  String _companyLineLabel(String? raw) {
    final t = (raw ?? '').trim();
    if (t.isEmpty) return 'this company';
    final lower = t.toLowerCase();
    if (lower.endsWith(' company')) return t;
    return '$t company';
  }

  void _showAutoCheckInBanner(String companyName, {required bool queuedOffline}) {
    final context = FcmService.navigatorKey?.currentContext;
    if (context == null) return;
    final phrase = _companyLineLabel(companyName);
    final at = DateDisplayUtil.formatForDisplay(DateTime.now(), 'hh:mm a');
    SnackBarUtils.showSnackBar(
      context,
      'You are inside $phrase',
      subtitle: queuedOffline
          ? 'Auto check-in will sync when you are back online · Queued at $at'
          : 'Auto check-in done at $at',
      duration: _autoVisitSnackDuration,
      leadingIcon: Icons.location_on_rounded,
      backgroundColor: const Color(0xFF0F0F0F),
    );
  }

  void _showAutoCheckoutBanner(String? companyName, {int? visitMinutes}) {
    final context = FcmService.navigatorKey?.currentContext;
    if (context == null) return;
    final phrase = _companyLineLabel(
      (companyName != null && companyName.trim().isNotEmpty) ? companyName : null,
    );
    final at = DateDisplayUtil.formatForDisplay(DateTime.now(), 'hh:mm a');
    final doneLine = 'Auto check-out done at $at';
    final subtitle = visitMinutes != null
        ? '$doneLine · Visit duration: $visitMinutes min'
        : doneLine;
    SnackBarUtils.showSnackBar(
      context,
      'You are out of $phrase',
      subtitle: subtitle,
      duration: _autoVisitSnackDuration,
      leadingIcon: Icons.notifications_outlined,
      backgroundColor: const Color(0xFF0F0F0F),
    );
  }

  Future<void> _checkIn(_NearbyCustomer nearbyCustomer, double lat, double lng) async {
    final customerId = nearbyCustomer.customerId;
    final payload = {
      'customerId': customerId,
      'lat': lat,
      'lng': lng,
      'checkInTime': DateTime.now().toUtc().toIso8601String(),
      'meta': {'source': 'smart_visit_sync'},
    };
    _visitLog(
      '$_logTag POST /company-visits/checkin customerId=$customerId '
      'lat=${lat.toStringAsFixed(6)} lng=${lng.toStringAsFixed(6)}',
    );
    try {
      final res = await _api.dio.post('/company-visits/checkin', data: payload);
      final data = res.data;
      Map<String, dynamic>? item;
      if (data is Map) {
        final outer = Map<String, dynamic>.from((data as Map).cast<String, dynamic>());
        final raw = outer['item'];
        if (raw is Map) {
          item = Map<String, dynamic>.from((raw as Map).cast<String, dynamic>());
        }
      }
      await _saveVisit(_CurrentVisit(
        visitId: item?['_id']?.toString(),
        customerId: customerId,
        checkInTime: DateTime.now(),
      ));
      final companyFromServer =
          item?['companyName']?.toString() ?? item?['customerName']?.toString();
      final label =
          (companyFromServer != null && companyFromServer.trim().isNotEmpty)
              ? companyFromServer.trim()
              : (nearbyCustomer.displayName ?? 'customer');
      _visitLog(
        '$_logTag check-in OK status=${res.statusCode} visitId=${item?['_id']} '
        'customerId=$customerId companyName=$label',
      );
      _showAutoCheckInBanner(label, queuedOffline: false);
    } catch (e, _) {
      if (e is DioException) {
        _visitLog(
          '$_logTag check-in API FAILED status=${e.response?.statusCode} '
          'customerId=$customerId response=${e.response?.data}',
        );
      } else {
        _visitLog('$_logTag check-in FAILED customerId=$customerId error=$e');
      }
      try {
        await _enqueue({'type': 'checkin', 'payload': payload});
      } catch (e2, _) {
        _visitLog('$_logTag enqueue checkin failed: $e2');
      }
      await _saveVisit(_CurrentVisit(visitId: null, customerId: customerId, checkInTime: DateTime.now()));
      final label = nearbyCustomer.displayName ?? customerId;
      _visitLog(
        '$_logTag check-in queued locally (offline/API fail) customer=$label',
      );
      _showAutoCheckInBanner(label, queuedOffline: true);
    }
  }

  Future<void> _checkOut(_CurrentVisit visit, double lat, double lng) async {
    final payload = {
      'visitId': visit.visitId,
      'customerId': visit.customerId,
      'lat': lat,
      'lng': lng,
      'checkOutTime': DateTime.now().toUtc().toIso8601String(),
      'minDurationSeconds': minVisitDurationSeconds,
    };
    _visitLog(
      '$_logTag POST /company-visits/checkout visitId=${visit.visitId} '
      'customerId=${visit.customerId} lat=${lat.toStringAsFixed(6)} lng=${lng.toStringAsFixed(6)}',
    );
    try {
      final res = await _api.dio.post('/company-visits/checkout', data: payload);
      await _clearVisit();
      final data = res.data;
      int? mins;
      String? companyName;
      if (data is Map) {
        final outer =
            Map<String, dynamic>.from((data as Map).cast<String, dynamic>());
        final raw = outer['item'];
        if (raw is Map) {
          final im =
              Map<String, dynamic>.from((raw as Map).cast<String, dynamic>());
          final dm = im['durationMinutes'];
          if (dm is num) mins = dm.round();
          companyName = im['companyName']?.toString();
        }
      }
      _visitLog(
        '$_logTag check-out OK status=${res.statusCode} durationMinutes=$mins '
        'companyName=${companyName ?? "—"}',
      );
      _showAutoCheckoutBanner(companyName, visitMinutes: mins);
    } catch (e, _) {
      if (e is DioException) {
        _visitLog(
          '$_logTag check-out API FAILED status=${e.response?.statusCode} '
          'visitId=${visit.visitId} response=${e.response?.data}',
        );
      } else {
        _visitLog('$_logTag check-out FAILED visitId=${visit.visitId} error=$e');
      }
      try {
        await _enqueue({'type': 'checkout', 'payload': payload});
      } catch (e2, _) {
        _visitLog('$_logTag enqueue checkout failed: $e2');
      }
    }
  }

  Future<List<_NearbyCustomer>> _fetchNearby({required double lat, required double lng}) async {
    try {
      final res = await _api.dio.get('/customers/nearby', queryParameters: {
        'lat': lat,
        'lng': lng,
        'maxDistance': 2000,
      });
      final items = ((res.data as Map?)?['items'] as List?) ?? const [];
      _visitLog(
        '$_logTag GET /customers/nearby status=${res.statusCode} items=${items.length}',
      );
      return items.map((e) {
        final m = Map<String, dynamic>.from((e as Map).cast<String, dynamic>());
        final clat = (m['geoLocation']?['lat'] as num?)?.toDouble() ?? (m['geoPoint']?['lat'] as num?)?.toDouble();
        final clng = (m['geoLocation']?['lng'] as num?)?.toDouble() ?? (m['geoPoint']?['lng'] as num?)?.toDouble();
        double? dist;
        if (clat != null && clng != null) {
          dist = gl.Geolocator.distanceBetween(lat, lng, clat, clng);
        }
        return _NearbyCustomer(
          customerId: m['_id']?.toString() ?? '',
          distanceM: dist,
          displayName:
              (m['companyName'] ?? m['customerName'] ?? m['name'])?.toString(),
        );
      }).where((x) => x.customerId.isNotEmpty).toList();
    } on DioException catch (e) {
      _visitLog(
        '$_logTag GET /customers/nearby FAILED status=${e.response?.statusCode} '
        'data=${e.response?.data}',
      );
      return const [];
    } catch (e) {
      _visitLog('$_logTag GET /customers/nearby error: $e');
      return const [];
    }
  }

  Future<void> _flushQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kQueue);
    if (raw == null || raw.isEmpty) return;
    List list;
    try {
      list = jsonDecode(raw) as List;
    } catch (_) {
      await prefs.remove(_kQueue);
      return;
    }
    final remaining = <Map<String, dynamic>>[];
    for (final item in list) {
      if (item is! Map) continue;
      final map = Map<String, dynamic>.from(item.cast<String, dynamic>());
      final type = map['type']?.toString();
      final payload = Map<String, dynamic>.from((map['payload'] as Map?)?.cast<String, dynamic>() ?? {});
      try {
        if (type == 'checkin') {
          await _api.dio.post('/company-visits/checkin', data: payload);
        } else if (type == 'checkout') {
          await _api.dio.post('/company-visits/checkout', data: payload);
          await _clearVisit();
        }
      } catch (e) {
        remaining.add(map);
      }
    }
    if (remaining.isEmpty) {
      await prefs.remove(_kQueue);
    } else {
      await prefs.setString(_kQueue, jsonEncode(remaining));
    }
  }

  Future<void> _enqueue(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kQueue);
    final list = <Map<String, dynamic>>[];
    if (raw != null && raw.isNotEmpty) {
      try {
        for (final e in (jsonDecode(raw) as List)) {
          if (e is Map) list.add(Map<String, dynamic>.from(e.cast<String, dynamic>()));
        }
      } catch (_) {}
    }
    list.add(item);
    while (list.length > 100) {
      list.removeAt(0);
    }
    await prefs.setString(_kQueue, jsonEncode(list));
  }

  Future<_CurrentVisit?> _loadVisit() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kVisit);
    if (raw == null || raw.isEmpty) return null;
    try {
      final m = Map<String, dynamic>.from((jsonDecode(raw) as Map).cast<String, dynamic>());
      final customerId = m['customerId']?.toString();
      final checkIn = DateDisplayUtil.parseFromApiAsLocal(m['checkInTime']);
      if (customerId == null || checkIn == null) return null;
      return _CurrentVisit(
        visitId: m['visitId']?.toString(),
        customerId: customerId,
        checkInTime: checkIn,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveVisit(_CurrentVisit visit) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _kVisit,
      jsonEncode({
        'visitId': visit.visitId,
        'customerId': visit.customerId,
        'checkInTime': visit.checkInTime.toIso8601String(),
      }),
    );
  }

  Future<void> _clearVisit() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kVisit);
  }
}

class _CurrentVisit {
  const _CurrentVisit({required this.visitId, required this.customerId, required this.checkInTime});
  final String? visitId;
  final String customerId;
  final DateTime checkInTime;
}

class _NearbyCustomer {
  const _NearbyCustomer({
    required this.customerId,
    required this.distanceM,
    this.displayName,
  });
  final String customerId;
  final double? distanceM;
  final String? displayName;
}
