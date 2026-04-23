import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/widgets/location_loader.dart';

class AttendanceCameraResult {
  const AttendanceCameraResult({
    required this.filePath,
    required this.capturedAt,
    required this.position,
    required this.address,
  });

  final String filePath;
  final DateTime capturedAt;
  final Position position;
  final String address;
}

/// Full-screen attendance selfie UI (check-in / check-out) with bottom sheet
/// for distance, address, and shutter — matches product reference layout.
class AttendanceCameraScreen extends StatefulWidget {
  const AttendanceCameraScreen({
    super.key,
    this.seedPosition,
    this.initialAddress = '',
    required this.isCheckout,
    this.officeLat,
    this.officeLng,
    this.officeSiteName = 'Office',
    this.allowedRadiusM = 100,
    this.attendanceGeofenceEnabled = false,
  });

  /// Last-known GPS when available — opens the shutter immediately while a fresh fix runs.
  final Position? seedPosition;
  final String initialAddress;
  final bool isCheckout;

  /// Office / branch anchor for distance (from user profile when available).
  final double? officeLat;
  final double? officeLng;
  final String officeSiteName;
  final double allowedRadiusM;

  /// When true, user must be within [allowedRadiusM] of the office/branch anchor to capture.
  final bool attendanceGeofenceEnabled;

  @override
  State<AttendanceCameraScreen> createState() => _AttendanceCameraScreenState();
}

class _AttendanceCameraScreenState extends State<AttendanceCameraScreen>
    with WidgetsBindingObserver {
  /// Matches punch flow — faster fix when user taps refresh.
  static const LocationSettings _refreshLocationSettings = LocationSettings(
    accuracy: LocationAccuracy.medium,
    distanceFilter: 0,
    timeLimit: Duration(seconds: 15),
  );

  CameraController? _controller;
  bool _initializing = true;
  bool _capturing = false;
  bool _refreshingLocation = false;
  bool _addressLookupPending = false;
  /// True once we have any fix (seed or fresh) safe for distance + API.
  bool _locationReady = false;

  Position? _position;
  String _address = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _address = widget.initialAddress;
    if (widget.seedPosition != null) {
      _position = widget.seedPosition;
      _locationReady = true;
      if (_address.trim().isEmpty) {
        _addressLookupPending = true;
        unawaited(_loadAddressInBackground());
      }
      unawaited(_refinePositionInBackground());
    } else {
      _locationReady = false;
      unawaited(_acquireInitialPosition());
    }
    _initCamera();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = _controller;
    if (c == null) return;
    if (!c.value.isInitialized) return;

    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      c.dispose();
      _controller = null;
      return;
    }
    if (state == AppLifecycleState.resumed && mounted && _controller == null) {
      unawaited(_initCamera());
    }
  }

  Future<void> _acquireInitialPosition() async {
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: _refreshLocationSettings,
      );
      if (!mounted) return;
      setState(() {
        _position = p;
        _locationReady = true;
      });
      if (_address.trim().isEmpty) {
        _addressLookupPending = true;
        unawaited(_loadAddressInBackground());
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _locationReady = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not get location. Enable GPS and try again.'),
        ),
      );
    }
  }

  /// Replaces seed coordinates with a fresher fix without blocking the first shutter tap.
  Future<void> _refinePositionInBackground() async {
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: _refreshLocationSettings,
      );
      if (!mounted) return;
      setState(() => _position = p);
      if (_address.trim().isEmpty) {
        _addressLookupPending = true;
        unawaited(_loadAddressInBackground());
      }
    } catch (_) {}
  }

  Future<void> _loadAddressInBackground() async {
    final pos = _position;
    if (pos == null) {
      if (mounted) setState(() => _addressLookupPending = false);
      return;
    }
    try {
      final a = await _resolveAddress(pos);
      if (!mounted) return;
      setState(() {
        _addressLookupPending = false;
        if (a.trim().isNotEmpty) _address = a;
      });
    } catch (_) {
      if (mounted) setState(() => _addressLookupPending = false);
    }
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (!mounted) return;
        Navigator.pop(context);
        return;
      }
      CameraDescription selected = cameras.first;
      final preferred = cameras.where(
        (c) => c.lensDirection == CameraLensDirection.front,
      );
      // Attendance capture should always use selfie/front camera.
      if (preferred.isNotEmpty) selected = preferred.first;
      final controller = CameraController(
        selected,
        // Medium keeps selfies sharp enough while cutting upload + compress time vs `high`.
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      await controller.setFlashMode(FlashMode.off);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _initializing = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _initializing = false);
    }
  }

  Future<String> _resolveAddress(Position p) async {
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

  Future<void> _refreshLocation() async {
    if (_refreshingLocation) return;
    setState(() => _refreshingLocation = true);
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        await Geolocator.requestPermission();
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: _refreshLocationSettings,
      );
      final addr = await _resolveAddress(p);
      if (!mounted) return;
      setState(() {
        _position = p;
        _address = addr.isNotEmpty ? addr : _address;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not refresh location')),
        );
      }
    } finally {
      if (mounted) setState(() => _refreshingLocation = false);
    }
  }

  double? _distanceMToOffice() {
    final pos = _position;
    final olat = widget.officeLat;
    final olng = widget.officeLng;
    if (pos == null || olat == null || olng == null) return null;
    return Geolocator.distanceBetween(
      pos.latitude,
      pos.longitude,
      olat,
      olng,
    );
  }

  /// When geofence is on for this user and we have a distance, block capture outside radius.
  bool _geofenceBlocksCapture() {
    if (!widget.attendanceGeofenceEnabled) return false;
    final d = _distanceMToOffice();
    if (d == null) return false;
    return d > widget.allowedRadiusM;
  }

  Widget _distanceBanner() {
    if (!widget.attendanceGeofenceEnabled) {
      if (_position == null) {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: LocationLoader(color: AppColors.info, size: 24),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Getting location…',
                style: TextStyle(
                  color: Colors.grey.shade800,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
              ),
            ),
          ],
        );
      }
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, color: Colors.blueGrey.shade600, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Office geofence is off for your account — you can check in or out from anywhere.',
              style: TextStyle(
                color: Colors.grey.shade800,
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
        ],
      );
    }

    if (_position == null) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 24,
            height: 24,
            child: LocationLoader(color: AppColors.info, size: 24),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Getting location…',
              style: TextStyle(
                color: Colors.grey.shade800,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                height: 1.35,
              ),
            ),
          ),
        ],
      );
    }
    final d = _distanceMToOffice();
    if (d == null) {
      // No branch/office anchor in session — server still validates; no in-camera warning.
      return const SizedBox.shrink();
    }
    final outside = d > widget.allowedRadiusM;
    final label = widget.officeSiteName.trim().isEmpty ? 'office' : widget.officeSiteName.trim();
    if (outside) {
      final outsideM = math.max(0, (d - widget.allowedRadiusM).round());
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: const BoxDecoration(
              color: Color(0xFFE53935),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.priority_high_rounded, color: Colors.white, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'You are out of office by about $outsideM m (allowed radius from $label is '
              '${widget.allowedRadiusM.round()} m). Move closer to mark attendance.',
              style: const TextStyle(
                color: Color(0xFFE53935),
                fontSize: 14,
                fontWeight: FontWeight.w600,
                height: 1.3,
              ),
            ),
          ),
        ],
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.check_circle_outline_rounded, color: Colors.green.shade700, size: 24),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            'You are within the allowed radius of $label.',
            style: TextStyle(
              color: Colors.green.shade800,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _capture() async {
    final c = _controller;
    final pos = _position;
    if (c == null || !c.value.isInitialized || _capturing || pos == null || !_locationReady) {
      return;
    }
    if (_geofenceBlocksCapture()) {
      final d = _distanceMToOffice();
      final outsideM = d == null ? 0 : math.max(0, (d - widget.allowedRadiusM).round());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'You are out of office by about $outsideM m. ${widget.isCheckout ? 'Check-out' : 'Check-in'} is not allowed.',
          ),
        ),
      );
      return;
    }
    setState(() => _capturing = true);
    try {
      final x = await c.takePicture();
      final capturedAt = DateTime.now();
      final processed = await _compressAndWatermark(
        x.path,
        capturedAt,
        _address.trim().isEmpty ? null : _address.trim(),
      );
      if (!mounted) return;
      Navigator.pop(
        context,
        AttendanceCameraResult(
          filePath: processed,
          capturedAt: capturedAt,
          position: pos,
          address: _address,
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Capture failed. Please retry.')),
        );
      }
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<String> _compressAndWatermark(
    String path,
    DateTime capturedAt,
    String? location,
  ) async {
    final tempDir = await getTemporaryDirectory();
    final outPath =
        '${tempDir.path}${Platform.pathSeparator}attendance_${capturedAt.millisecondsSinceEpoch}.jpg';

    final compressed = await FlutterImageCompress.compressWithFile(
      path,
      quality: 62,
      minWidth: 560,
      minHeight: 560,
      format: CompressFormat.jpeg,
    );
    final bytes = compressed ?? await File(path).readAsBytes();
    var image = img.decodeImage(bytes);
    if (image == null) {
      await File(outPath).writeAsBytes(bytes, flush: true);
      return outPath;
    }
    if (image.width > 560) {
      image = img.copyResize(image, width: 560);
    }

    final ts =
        '${capturedAt.year.toString().padLeft(4, '0')}-${capturedAt.month.toString().padLeft(2, '0')}-${capturedAt.day.toString().padLeft(2, '0')} ${capturedAt.hour.toString().padLeft(2, '0')}:${capturedAt.minute.toString().padLeft(2, '0')}';
    final wm = location == null || location.trim().isEmpty
        ? ts
        : '$ts  |  ${location.trim()}';
    final y = math.max(6, image.height - 46);

    img.fillRect(
      image,
      x1: 0,
      y1: y - 8,
      x2: image.width,
      y2: image.height,
      color: img.ColorRgba8(0, 0, 0, 135),
    );
    img.drawString(
      image,
      wm,
      font: img.arial14,
      x: 12,
      y: y,
      color: img.ColorRgb8(255, 255, 255),
    );

    await File(outPath).writeAsBytes(img.encodeJpg(image, quality: 62), flush: true);
    return outPath;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    final topPad = MediaQuery.paddingOf(context).top;
    final title = widget.isCheckout ? 'Mark Checkout' : 'Mark Attendance';
    final geofenceBlocked = _geofenceBlocksCapture();

    return Scaffold(
      backgroundColor: Colors.black,
      body: _initializing || c == null || !c.value.isInitialized
          ? Center(
              child: LocationLoader(
                size: 56,
                color: AppColors.primary,
              ),
            )
          : Stack(
              fit: StackFit.expand,
              children: [
                Positioned.fill(child: CameraPreview(c)),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: EdgeInsets.fromLTRB(4, topPad + 4, 8, 16),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.55),
                          Colors.black.withValues(alpha: 0.0),
                        ],
                      ),
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Row(
                          children: [
                            IconButton(
                              onPressed: _capturing ? null : () => Navigator.pop(context),
                              icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 22),
                            ),
                            const Spacer(),
                            const SizedBox(width: 96),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 96),
                          child: Text(
                            title,
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Material(
                    color: Colors.transparent,
                    child: Container(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
                        boxShadow: [
                          BoxShadow(
                            color: Color(0x33000000),
                            blurRadius: 18,
                            offset: Offset(0, -4),
                          ),
                        ],
                      ),
                      child: SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              _distanceBanner(),
                              const SizedBox(height: 14),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.location_on_rounded, color: AppColors.info, size: 26),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _address.trim().isNotEmpty
                                          ? _address
                                          : (_addressLookupPending
                                              ? 'Getting address…'
                                              : 'Address unavailable — tap refresh'),
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: Colors.grey.shade900,
                                        fontSize: 14,
                                        height: 1.35,
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: (_capturing || _refreshingLocation) ? null : _refreshLocation,
                                    icon: _refreshingLocation
                                        ? const SizedBox(
                                            width: 26,
                                            height: 26,
                                            child: LocationLoader(
                                              size: 26,
                                              color: AppColors.info,
                                            ),
                                          )
                                        : Icon(Icons.refresh_rounded, color: AppColors.info, size: 26),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [
                                  TextButton(
                                    onPressed: _capturing ? null : () => Navigator.pop(context),
                                    child: Text(
                                      'Cancel',
                                      style: TextStyle(
                                        color: AppColors.info,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: Center(
                                      child: Opacity(
                                        opacity: (!_locationReady ||
                                                _position == null ||
                                                geofenceBlocked) &&
                                            !_capturing
                                            ? 0.38
                                            : 1,
                                        child: GestureDetector(
                                          onTap: (_capturing ||
                                                  !_locationReady ||
                                                  _position == null ||
                                                  geofenceBlocked)
                                              ? null
                                              : _capture,
                                          child: Container(
                                            width: 76,
                                            height: 76,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              shape: BoxShape.circle,
                                              border: Border.all(
                                                color: const Color(0xFFE8E8E8),
                                                width: 5,
                                              ),
                                            ),
                                            child: Container(
                                              width: 58,
                                              height: 58,
                                              decoration: BoxDecoration(
                                                shape: BoxShape.circle,
                                                color: const Color(0xFF4A4A4A),
                                              ),
                                              child: _capturing
                                                  ? const Padding(
                                                      padding: EdgeInsets.all(12),
                                                      child: LocationLoader(
                                                        size: 32,
                                                        color: Colors.white,
                                                        circleColor: Color(0xFF3A3A3A),
                                                        iconColor: Colors.white,
                                                      ),
                                                    )
                                                  : null,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 72),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
