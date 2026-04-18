import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/screens/attendance/attendance_camera_screen.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/services/presence_tracking_service.dart';
import 'package:track/widgets/app_blocking_dialog.dart';
import 'package:track/widgets/app_feedback.dart';

/// Geo + selfie camera + check-in / check-out API (shared by dashboard and attendance screen).
class AttendanceCameraFlow {
  AttendanceCameraFlow._();

  static Future<String> resolveAddress(Position p) async {
    try {
      final list = await placemarkFromCoordinates(p.latitude, p.longitude);
      if (list.isEmpty) return '';
      final x = list.first;
      return [
        x.name,
        x.subLocality,
        x.locality,
        x.administrativeArea,
        x.postalCode,
      ].where((e) => (e ?? '').trim().isNotEmpty).join(', ');
    } catch (_) {
      return '';
    }
  }

  /// Office anchor from session user (matches backend `officeLocation`).
  static Future<({double? lat, double? lng, String label, double radius})>
      officeFromSession() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('user');
    if (raw == null || raw.isEmpty) {
      return (lat: null, lng: null, label: 'Office', radius: 100.0);
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return (lat: null, lng: null, label: 'Office', radius: 100.0);
      }
      final m = Map<String, dynamic>.from(decoded);
      final ol = m['officeLocation'];
      if (ol is! Map) {
        return (lat: null, lng: null, label: 'Office', radius: 100.0);
      }
      final olm = Map<String, dynamic>.from(ol);
      final lat = (olm['latitude'] as num?)?.toDouble();
      final lng = (olm['longitude'] as num?)?.toDouble();
      final radius = (olm['radius'] as num?)?.toDouble() ?? 100.0;
      var label = 'Office';
      final addr = olm['address']?.toString().trim() ?? '';
      if (addr.isNotEmpty) {
        final first = addr.split(',').first.trim();
        if (first.isNotEmpty) {
          label = first.length > 40 ? '${first.substring(0, 40)}…' : first;
        }
      }
      return (lat: lat, lng: lng, label: label, radius: radius);
    } catch (_) {
      return (lat: null, lng: null, label: 'Office', radius: 100.0);
    }
  }

  /// Opens camera and submits check-in/out. Returns true after a successful API call.
  static Future<bool> run(
    BuildContext context, {
    required bool checkout,
  }) async {
    if (!context.mounted) return false;
    try {
      final permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('Location permission denied');
      }

      // Open the camera immediately: last-known fix (instant when available) + office
      // prefs + auth warm in parallel; fresh GPS runs on the camera screen.
      final officeFuture = officeFromSession();
      final lastKnownFuture = Geolocator.getLastKnownPosition();
      final authWarmFuture = AttendanceService().warmupAuth();
      final office = await officeFuture;
      final lastKnown = await lastKnownFuture;
      await authWarmFuture;

      if (!context.mounted) return false;
      final capture = await Navigator.push<AttendanceCameraResult>(
        context,
        MaterialPageRoute(
          builder: (_) => AttendanceCameraScreen(
            seedPosition: lastKnown,
            initialAddress: '',
            isCheckout: checkout,
            officeLat: office.lat,
            officeLng: office.lng,
            officeSiteName: office.label,
            allowedRadiusM: office.radius,
          ),
        ),
      );
      if (capture == null) return false;

      // Use the position from the camera screen to avoid a second high-accuracy GPS wait
      // (that was often the slowest part of check-in / check-out after capture).
      final positionForApi = capture.position;

      // Do not block the punch on reverse geocode — server has lat/lng.
      final addressForApi = capture.address.trim();

      if (!context.mounted) return false;
      await AppBlockingDialog.run<void>(
        context,
        message: checkout ? 'Submitting check-out…' : 'Submitting check-in…',
        action: () async {
          final service = AttendanceService();
          if (checkout) {
            await service.checkOut(
              selfiePath: capture.filePath,
              position: positionForApi,
              address: addressForApi,
            );
          } else {
            await service.checkIn(
              selfiePath: capture.filePath,
              position: positionForApi,
              address: addressForApi,
            );
          }
        },
      );

      if (!context.mounted) return true;
      AppFeedback.success(
        context,
        checkout
            ? 'Checked out successfully at ${DateFormat('hh:mm a').format(DateTime.now())}'
            : 'Checked in successfully at ${DateFormat('hh:mm a').format(DateTime.now())}',
      );
      // Presence sync (reverse geocode, periodic timer, POST /presence/store) must not block the punch UX.
      scheduleMicrotask(() async {
        try {
          if (checkout) {
            await PresenceTrackingService().ensureTrackingIfPunchedIn(false);
          } else {
            await PresenceTrackingService().pinOfficeZoneAtCheckIn(
              positionForApi.latitude,
              positionForApi.longitude,
            );
            await PresenceTrackingService().ensureTrackingIfPunchedIn(true);
          }
        } catch (e, _) {
          if (kDebugMode) {
            debugPrint(
              checkout
                  ? '[AttendanceCameraFlow] presence after checkout (punch saved): $e'
                  : '[AttendanceCameraFlow] presence after check-in (punch saved): $e',
            );
          }
        }
      });
      return true;
    } catch (e) {
      if (!context.mounted) return false;
      AppFeedback.error(
        context,
        e,
        actionLabel: 'Retry',
        onAction: () {
          scheduleMicrotask(() => run(context, checkout: checkout));
        },
      );
      return false;
    }
  }
}
