import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/screens/attendance/attendance_camera_screen.dart';
import 'package:track/services/attendance_service.dart';
import 'package:track/services/presence_tracking_service.dart';
import 'package:track/utils/attendance_punch_log.dart';
import 'package:track/widgets/app_blocking_dialog.dart';
import 'package:track/widgets/app_feedback.dart';

/// Geo + selfie camera + check-in / check-out API (shared by dashboard and attendance screen).
class AttendanceCameraFlow {
  AttendanceCameraFlow._();

  static Future<void> _logPunchContext({
    required bool checkout,
    required ({
      double? lat,
      double? lng,
      String label,
      double radius,
    }) office,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final rawUser = prefs.getString('user');
      Map<String, dynamic> user = <String, dynamic>{};
      if (rawUser != null && rawUser.isNotEmpty) {
        final decoded = jsonDecode(rawUser);
        if (decoded is Map) {
          user = Map<String, dynamic>.from(decoded);
        }
      }

      final employeeProfile = user['employeeProfile'] is Map
          ? Map<String, dynamic>.from(user['employeeProfile'] as Map)
          : <String, dynamic>{};
      final branch = user['branch'] is Map
          ? Map<String, dynamic>.from(user['branch'] as Map)
          : <String, dynamic>{};
      final branchName =
          (employeeProfile['branchName'] ??
                  branch['name'] ??
                  office.label)
              .toString()
              .trim();
      final attendanceGeofenceEnabled = user['attendanceGeofenceEnabled'] == true;

      String shiftId = (user['shiftId'] ?? '').toString().trim();
      String shiftName = '';
      String shiftStart = '';
      String shiftEnd = '';
      try {
        final shiftMeta = await AttendanceService().fetchShiftMeta();
        if (shiftMeta != null) {
          shiftId = (shiftMeta['shiftId'] ?? shiftId).toString().trim();
          shiftName = (shiftMeta['shiftName'] ?? '').toString().trim();
          shiftStart = (shiftMeta['startTime'] ?? '').toString().trim();
          shiftEnd = (shiftMeta['endTime'] ?? '').toString().trim();
        }
      } catch (_) {}

      final message =
          '[AttendancePunchDebug][local-cache] action=${checkout ? 'checkout' : 'checkin'} '
          'attendanceGeofenceEnabled=$attendanceGeofenceEnabled '
          'branchName="${branchName.isEmpty ? '-' : branchName}" '
          'branchRadiusM=${office.radius.toStringAsFixed(0)} '
          'shiftId="${shiftId.isEmpty ? '-' : shiftId}" '
          'shiftName="${shiftName.isEmpty ? '-' : shiftName}" '
          'shiftStart="${shiftStart.isEmpty ? '-' : shiftStart}" '
          'shiftEnd="${shiftEnd.isEmpty ? '-' : shiftEnd}"';
      logAttendancePunch(message);
    } catch (e) {
      logAttendancePunch('[AttendancePunchDebug] failed to build punch context: $e');
    }
  }

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

  /// Office anchor from session user.
  /// Prefers branch geofence when available; falls back to legacy `officeLocation`.
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
      Map<String, dynamic>? anchor;
      final branchRaw = m['branch'];
      if (branchRaw is Map) {
        final branch = Map<String, dynamic>.from(branchRaw);
        final geofenceRaw = branch['geofence'];
        if (geofenceRaw is Map) {
          final gf = Map<String, dynamic>.from(geofenceRaw);
          final gfDisabled = gf.containsKey('enabled') && gf['enabled'] == false;
          if (!gfDisabled) {
            final lat = (gf['lat'] as num?)?.toDouble();
            final lng = (gf['lng'] as num?)?.toDouble();
            if (lat != null && lng != null) {
              anchor = {
                'latitude': lat,
                'longitude': lng,
                'radius': (gf['radiusM'] as num?)?.toDouble() ?? 100.0,
                'address': (gf['address'] ?? branch['address'] ?? '').toString(),
              };
            }
          }
        }
      }
      final ol = m['officeLocation'];
      if (anchor == null && ol is Map) {
        anchor = Map<String, dynamic>.from(ol);
      }
      if (anchor == null) {
        return (lat: null, lng: null, label: 'Office', radius: 100.0);
      }
      final lat = (anchor['latitude'] as num?)?.toDouble();
      final lng = (anchor['longitude'] as num?)?.toDouble();
      final radius = (anchor['radius'] as num?)?.toDouble() ?? 100.0;
      var label = 'Office';
      final addr = anchor['address']?.toString().trim() ?? '';
      if (addr.isNotEmpty) {
        final first = addr.split(',').first.trim();
        if (first.isNotEmpty) label = first.length > 40 ? '${first.substring(0, 40)}…' : first;
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
    logAttendancePunch(
      '[AttendancePunchDebug] flow_start action=${checkout ? 'checkout' : 'checkin'}',
    );
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
      unawaited(_logPunchContext(checkout: checkout, office: office));

      // Camera must match server punch rules: prefs `user` is often stale vs DB
      // (`attendanceGeofenceEnabled`, branch radius). Use punch-click-log context first.
      final flowStartCtx = await AttendanceService().logPunchButtonClick(
        action: checkout ? 'checkout' : 'checkin',
        source: 'attendance_camera_flow',
        stage: 'flow_start',
      );
      var attendanceGeofenceEnabled = flowStartCtx?['attendanceGeofenceEnabled'] == true;
      if (flowStartCtx == null) {
        final prefsForGeofence = await SharedPreferences.getInstance();
        final rawUserGf = prefsForGeofence.getString('user');
        if (rawUserGf != null && rawUserGf.isNotEmpty) {
          try {
            final u = jsonDecode(rawUserGf);
            if (u is Map && u['attendanceGeofenceEnabled'] == true) {
              attendanceGeofenceEnabled = true;
            }
          } catch (_) {}
        }
      }
      var allowedRadiusM = office.radius;
      final brServer = flowStartCtx?['branchRadiusM'];
      if (brServer != null) {
        final n = num.tryParse(brServer.toString());
        if (n != null && n > 0) {
          allowedRadiusM = n.toDouble();
        }
      }

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
            allowedRadiusM: allowedRadiusM,
            attendanceGeofenceEnabled: attendanceGeofenceEnabled,
          ),
        ),
      );
      if (capture == null) {
        unawaited(
          AttendanceService().logPunchButtonClick(
            action: checkout ? 'checkout' : 'checkin',
            source: 'attendance_camera_flow',
            stage: 'camera_cancelled',
          ),
        );
        return false;
      }

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
          unawaited(
            service.logPunchButtonClick(
              action: checkout ? 'checkout' : 'checkin',
              source: 'attendance_camera_flow',
              stage: 'submit_start',
            ),
          );
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
      unawaited(
        AttendanceService().logPunchButtonClick(
          action: checkout ? 'checkout' : 'checkin',
          source: 'attendance_camera_flow',
          stage: 'submit_success',
        ),
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
          logAttendancePunch(
            checkout
                ? '[AttendanceCameraFlow] presence after checkout (punch saved): $e'
                : '[AttendanceCameraFlow] presence after check-in (punch saved): $e',
          );
        }
      });
      return true;
    } catch (e) {
      unawaited(
        AttendanceService().logPunchButtonClick(
          action: checkout ? 'checkout' : 'checkin',
          source: 'attendance_camera_flow',
          stage: 'submit_failed',
          detail: e.toString(),
        ),
      );
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
