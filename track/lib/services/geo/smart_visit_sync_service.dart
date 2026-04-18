import 'dart:convert';
import 'dart:developer' as dev;
import 'dart:math';

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
/// - GET /customers/nearby?lat=..&lng=..&maxDistance=2000 (customers must have geoLocation;
///   open visits also use saved check-in GPS + company geo for checkout, not only this list)
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
  static const _kLastLat = 'smart_visit_last_lat';
  static const _kLastLng = 'smart_visit_last_lng';
  /// Wall-clock checkout after leaving geofence (shared across isolates; replaces [Timer]).
  static const _kCheckoutDueMs = 'smart_visit_checkout_due_ms';
  static const _kCheckoutCustomerId = 'smart_visit_checkout_customer_id';
  /// Single-flight auto check-in across isolates (main + background engine).
  static const _kCheckinLock = 'smart_visit_checkin_lock';

  static const double checkInRadiusM = 50;
  static const double checkOutRadiusM = 50;
  static const int checkoutDelaySeconds = 30;
  static const int processCooldownMs = 8000;
  static const Duration _autoVisitSnackDuration = Duration(seconds: 4);
  final ApiClient _api = ApiClient();

  /// Cancels a pending checkout only after this many consecutive "inside radius" readings (stale GPS often flaps once).
  int _confirmedInsideTicks = 0;

  /// Same auto check-in/out snackbar was being shown on every location tick / retry; show at most once per [key] per [_autoVisitSnackDuration].
  final Map<String, int> _autoSnackLastShownMsByKey = {};

  bool _shouldEmitAutoSnack(String dedupeKey) {
    final now = DateTime.now().millisecondsSinceEpoch;
    final last = _autoSnackLastShownMsByKey[dedupeKey];
    if (last != null &&
        now - last < _autoVisitSnackDuration.inMilliseconds) {
      return false;
    }
    _autoSnackLastShownMsByKey[dedupeKey] = now;
    if (_autoSnackLastShownMsByKey.length > 24) {
      _autoSnackLastShownMsByKey.removeWhere(
        (_, ms) => now - ms > const Duration(minutes: 2).inMilliseconds,
      );
    }
    return true;
  }

  /// DevTools Logging (name `CompanyVisitAuto`) + debug console when [kDebugMode].
  void _visitLog(String message) {
    if (AppConstants.logSmartVisitToDevTools) {
      dev.log(message, name: 'CompanyVisitAuto');
    }
    if (kDebugMode) {
      debugPrint(message);
    }
  }

  /// Returns lock value `opaque|startMs` if this isolate won; caller must [_releaseCheckinLock] in `finally`.
  Future<String?> _tryAcquireCheckinLock(
    SharedPreferences prefs,
    int nowMs,
  ) async {
    const ttlMs = 90000;
    final raw = prefs.getString(_kCheckinLock);
    if (raw != null && raw.isNotEmpty) {
      final parts = raw.split('|');
      if (parts.length >= 2) {
        final started = int.tryParse(parts.last) ?? 0;
        if (nowMs - started < ttlMs) {
          return null;
        }
      }
    }
    final opaque = '${Random().nextInt(0x7fffffff)}_${Random().nextInt(0x7fffffff)}';
    final value = '$opaque|$nowMs';
    await prefs.setString(_kCheckinLock, value);
    await Future<void>.delayed(Duration.zero);
    if (prefs.getString(_kCheckinLock) != value) {
      return null;
    }
    return value;
  }

  Future<void> _releaseCheckinLock(SharedPreferences prefs, String? lockValue) async {
    if (lockValue == null) return;
    if (prefs.getString(_kCheckinLock) == lockValue) {
      await prefs.remove(_kCheckinLock);
    }
  }

  Future<void> _delayedCheckout({required String scheduledCustomerId}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final lat = prefs.getDouble(_kLastLat);
      final lng = prefs.getDouble(_kLastLng);
      if (lat == null || lng == null) {
        _visitLog('$_logTag delayed checkout: no last lat/lng in prefs');
        return;
      }
      final latestVisit = await _loadVisit();
      if (latestVisit == null) return;
      if (latestVisit.customerId != scheduledCustomerId) return;
      await _checkOut(latestVisit, lat, lng);
    } catch (e, _) {
      _visitLog('$_logTag delayed checkout error: $e');
    }
  }

  Future<void> onLocationUpdate({required double lat, required double lng}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      await prefs.setDouble(_kLastLat, lat);
      await prefs.setDouble(_kLastLng, lng);

      // Fires even when the heavy tick below is cooldown-skipped (background / second engine).
      final due = prefs.getInt(_kCheckoutDueMs);
      final dueCid = prefs.getString(_kCheckoutCustomerId);
      if (due != null &&
          dueCid != null &&
          dueCid.isNotEmpty &&
          nowMs >= due) {
        await prefs.remove(_kCheckoutDueMs);
        await prefs.remove(_kCheckoutCustomerId);
        _confirmedInsideTicks = 0;
        _visitLog(
          '$_logTag wall-clock delayed checkout firing customerId=$dueCid',
        );
        await _delayedCheckout(scheduledCustomerId: dueCid);
        if (await _loadVisit() == null) {
          return;
        }
      }

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
          if (await _loadVisit() != null) {
            _visitLog(
              '$_logTag skip auto check-in: open visit exists (re-check before lock)',
            );
            return;
          }
          final lockValue = await _tryAcquireCheckinLock(prefs, nowMs);
          if (lockValue == null) {
            _visitLog(
              '$_logTag skip auto check-in: another check-in in progress or lock race',
            );
            return;
          }
          try {
            if (await _loadVisit() != null) {
              _visitLog(
                '$_logTag skip auto check-in: open visit after lock (same company until checkout)',
              );
              return;
            }
            _visitLog(
              '$_logTag AUTO CHECK-IN → customerId=${selected.customerId} '
              'name=${selected.displayName ?? "—"} '
              'distance=${selected.distanceM?.toStringAsFixed(1) ?? "—"}m '
              '(radius<=${checkInRadiusM}m)',
            );
            await _checkIn(selected, lat, lng);
          } finally {
            final p2 = await SharedPreferences.getInstance();
            await _releaseCheckinLock(p2, lockValue);
          }
        } else if (nearby.isNotEmpty) {
          _visitLog(
            '$_logTag no auto check-in: ${nearby.length} nearby but none within '
            '${checkInRadiusM}m',
          );
        }
        return;
      }

      // Compare to check-in GPS and to company geo from check-in (not only /customers/nearby,
      // which is capped at 2 km — so checkout still works far away once anchors exist).
      final double? aLat = visit.anchorLat;
      final double? aLng = visit.anchorLng;
      final double? cLat = visit.companyLat;
      final double? cLng = visit.companyLng;
      final bool stillNearByCheckInGps = aLat != null &&
          aLng != null &&
          gl.Geolocator.distanceBetween(lat, lng, aLat, aLng) <= checkOutRadiusM;
      final bool stillNearByCompanyPin = cLat != null &&
          cLng != null &&
          gl.Geolocator.distanceBetween(lat, lng, cLat, cLng) <= checkOutRadiusM;
      final bool stillNearByNearby = nearby.any(
        (n) =>
            n.customerId == visit.customerId &&
            (n.distanceM ?? 1e9) <= checkOutRadiusM,
      );
      final bool haveSavedAnchors = (aLat != null && aLng != null) ||
          (cLat != null && cLng != null);
      final bool stillNear = haveSavedAnchors
          ? (stillNearByCheckInGps || stillNearByCompanyPin)
          : stillNearByNearby;
      if (stillNear) {
        final distCheckInM = (aLat != null && aLng != null)
            ? gl.Geolocator.distanceBetween(lat, lng, aLat, aLng)
            : null;
        final distCompanyM = (cLat != null && cLng != null)
            ? gl.Geolocator.distanceBetween(lat, lng, cLat, cLng)
            : null;
        _visitLog(
          '$_logTag still within checkout radius customerId=${visit.customerId} '
          'distCheckInM=${distCheckInM?.toStringAsFixed(1) ?? "—"} '
          'distCompanyM=${distCompanyM?.toStringAsFixed(1) ?? "—"} '
          'byNearby=$stillNearByNearby',
        );
        final pendingCheckout = prefs.getInt(_kCheckoutDueMs) != null;
        if (pendingCheckout) {
          _confirmedInsideTicks++;
          if (_confirmedInsideTicks >= 2) {
            await prefs.remove(_kCheckoutDueMs);
            await prefs.remove(_kCheckoutCustomerId);
            _confirmedInsideTicks = 0;
            _visitLog(
              '$_logTag cancelled wall-clock checkout (confirmed back inside)',
            );
          }
        } else {
          _confirmedInsideTicks = 0;
        }
        return;
      }
      _confirmedInsideTicks = 0;

      final existingCid = prefs.getString(_kCheckoutCustomerId);
      final existingDue = prefs.getInt(_kCheckoutDueMs);
      if (existingDue == null || existingCid != visit.customerId) {
        await prefs.setInt(
          _kCheckoutDueMs,
          nowMs + checkoutDelaySeconds * 1000,
        );
        await prefs.setString(_kCheckoutCustomerId, visit.customerId);
        _visitLog(
          '$_logTag checkout scheduled in ${checkoutDelaySeconds}s wall-clock '
          'customerId=${visit.customerId}',
        );
      }
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
    final dedupeKey =
        'ci|${companyName.trim().toLowerCase()}|${queuedOffline ? 'q' : 'ok'}';
    if (!_shouldEmitAutoSnack(dedupeKey)) return;
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
    final dedupeKey = 'co|${(companyName ?? '').trim().toLowerCase()}';
    if (!_shouldEmitAutoSnack(dedupeKey)) return;
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
    final open = await _loadVisit();
    if (open != null) {
      if (open.customerId == customerId) {
        _visitLog(
          '$_logTag check-in skipped: already have open visit for this customer until checkout',
        );
        return;
      }
      _visitLog(
        '$_logTag check-in skipped: open visit for another customerId=${open.customerId}',
      );
      return;
    }
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
        anchorLat: lat,
        anchorLng: lng,
        companyLat: nearbyCustomer.companyLat,
        companyLng: nearbyCustomer.companyLng,
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
      await _saveVisit(_CurrentVisit(
        visitId: null,
        customerId: customerId,
        checkInTime: DateTime.now(),
        anchorLat: lat,
        anchorLng: lng,
        companyLat: nearbyCustomer.companyLat,
        companyLng: nearbyCustomer.companyLng,
      ));
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
          companyLat: clat,
          companyLng: clng,
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
      double? alat = m['anchorLat'] is num ? (m['anchorLat'] as num).toDouble() : null;
      double? alng = m['anchorLng'] is num ? (m['anchorLng'] as num).toDouble() : null;
      if (alat == null || alng == null) {
        alat = null;
        alng = null;
      }
      double? clat = m['companyLat'] is num ? (m['companyLat'] as num).toDouble() : null;
      double? clng = m['companyLng'] is num ? (m['companyLng'] as num).toDouble() : null;
      if (clat == null || clng == null) {
        clat = null;
        clng = null;
      }
      return _CurrentVisit(
        visitId: m['visitId']?.toString(),
        customerId: customerId,
        checkInTime: checkIn,
        anchorLat: alat,
        anchorLng: alng,
        companyLat: clat,
        companyLng: clng,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveVisit(_CurrentVisit visit) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kCheckoutDueMs);
    await prefs.remove(_kCheckoutCustomerId);
    await prefs.setString(
      _kVisit,
      jsonEncode({
        'visitId': visit.visitId,
        'customerId': visit.customerId,
        'checkInTime': visit.checkInTime.toIso8601String(),
        if (visit.anchorLat != null && visit.anchorLng != null) ...{
          'anchorLat': visit.anchorLat,
          'anchorLng': visit.anchorLng,
        },
        if (visit.companyLat != null && visit.companyLng != null) ...{
          'companyLat': visit.companyLat,
          'companyLng': visit.companyLng,
        },
      }),
    );
  }

  Future<void> _clearVisit() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kVisit);
    await prefs.remove(_kCheckoutDueMs);
    await prefs.remove(_kCheckoutCustomerId);
  }
}

class _CurrentVisit {
  const _CurrentVisit({
    required this.visitId,
    required this.customerId,
    required this.checkInTime,
    this.anchorLat,
    this.anchorLng,
    this.companyLat,
    this.companyLng,
  });
  final String? visitId;
  final String customerId;
  final DateTime checkInTime;
  /// Device GPS at auto check-in; checkout uses distance to this (any range from server pin).
  final double? anchorLat;
  final double? anchorLng;
  /// Customer record geo at check-in (from /customers/nearby); optional second fence.
  final double? companyLat;
  final double? companyLng;
}

class _NearbyCustomer {
  const _NearbyCustomer({
    required this.customerId,
    required this.distanceM,
    this.displayName,
    this.companyLat,
    this.companyLng,
  });
  final String customerId;
  final double? distanceM;
  final String? displayName;
  final double? companyLat;
  final double? companyLng;
}
