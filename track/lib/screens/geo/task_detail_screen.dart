// Task Details / Start Task – UI matches reference (blue app bar, map card, customer card, fixed Start button)
import 'package:flutter/foundation.dart' show Factory;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/customer.dart';
import 'package:track/models/task.dart';
import 'package:track/screens/geo/arrived_screen.dart';
import 'package:track/screens/geo/live_tracking_screen.dart';
import 'package:track/screens/geo/task_history_screen.dart';
import 'package:track/services/customer_service.dart';
import 'package:track/services/geo/directions_service.dart';
import 'package:intl/intl.dart';
import 'package:track/utils/date_display_util.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:track/services/task_service.dart';
import 'package:track/services/presence_tracking_service.dart';
import 'package:track/utils/error_message_utils.dart';
import 'package:track/utils/task_movement_summary_util.dart';
import 'package:track/widgets/app_tab_loader.dart';
import 'package:track/widgets/location_loader.dart';

class TaskDetailScreen extends StatefulWidget {
  final Task task;

  /// When true, opened from ride screen; back/continue just pops to ride (no push to StartRideScreen).
  final bool fromRideScreen;

  const TaskDetailScreen({
    super.key,
    required this.task,
    this.fromRideScreen = false,
  });

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskTrackEvent {
  final DateTime? time;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color iconColor;

  const _TaskTrackEvent({
    required this.time,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
  });
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  late Task task;

  Customer? _customer;
  bool _loadingCustomer = true;
  String? _customerError;

  Position? _currentPosition;
  LatLng? _destinationLatLng;
  double? _distanceKm;
  String? _durationText;
  bool _loadingMap = true;
  String? _mapError;

  Set<Marker> _markers = {};
  final Set<Polyline> _polylines = {};
  double? _routeDistanceKm;

  @override
  void initState() {
    super.initState();
    task = widget.task;
    _loadTaskCustomerAndMap();
  }

  Future<void> _loadTaskCustomerAndMap() async {
    if (task.id != null && task.id!.isNotEmpty) {
      try {
        final refreshed = await TaskService().getTaskById(task.id!);
        if (mounted) {
          setState(() => task = refreshed);
          _loadMovementSummary();
          if (refreshed.status == TaskStatus.arrived) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(
                  builder: (context) => ArrivedScreen(
                    taskMongoId: refreshed.id,
                    taskId: refreshed.taskId,
                    task: refreshed,
                    totalDuration: Duration(
                      seconds: refreshed.tripDurationSeconds ?? 0,
                    ),
                    totalDistanceKm: refreshed.tripDistanceKm ?? 0.0,
                    isWithinGeofence: false,
                    arrivalTime: refreshed.arrivalTime ?? DateTime.now(),
                    sourceLat: refreshed.sourceLocation?.lat,
                    sourceLng: refreshed.sourceLocation?.lng,
                    sourceAddress: refreshed.sourceLocation?.address,
                    destLat: refreshed.destinationLocation?.lat,
                    destLng: refreshed.destinationLocation?.lng,
                    destAddress: refreshed.destinationLocation?.address,
                    arrivalAtLat: refreshed.arrivalLocation?.lat,
                    arrivalAtLng: refreshed.arrivalLocation?.lng,
                    arrivalAtAddress: refreshed.arrivalLocation?.displayAddress,
                  ),
                ),
              );
            });
            return;
          }
        }
      } catch (_) {}
    }
    _loadMovementSummary();
    if (task.customer != null) {
      setState(() {
        _customer = task.customer;
        _loadingCustomer = false;
      });
      await _initMapAndDirections();
      return;
    }
    if (task.customerId == null || task.customerId!.isEmpty) {
      setState(() {
        _loadingCustomer = false;
        _customerError = 'No customer linked';
      });
      return;
    }
    try {
      final c = await CustomerService().getCustomerById(task.customerId!);
      if (mounted) {
        setState(() {
          _customer = c;
          _loadingCustomer = false;
        });
        await _initMapAndDirections();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _customerError = 'Failed to load customer';
          _loadingCustomer = false;
        });
      }
    }
  }

  Future<void> _loadMovementSummary() async {
    final stored = task.travelActivityDuration;
    if (stored != null) {
      final summary = TaskMovementSummary.fromDurations(
        drivingDuration: Duration(seconds: stored.driveDuration),
        walkingDuration: Duration(seconds: stored.walkDuration),
        stopDuration: Duration(seconds: stored.stopDuration),
      );
      if (summary.hasData) {
        return;
      }
    }
    final taskId = task.id;
    if (taskId == null || taskId.isEmpty) return;
    try {
      final report = await TaskService().getTaskCompletionReport(taskId);
      if (mounted) {
        setState(() {
          _routeDistanceKm = computeRouteDistanceKm(
            report.routePoints,
            endTime: task.arrivalTime,
          );
        });
      }
    } catch (_) {}
  }

  Future<void> _initMapAndDirections() async {
    setState(() {
      _loadingMap = true;
      _mapError = null;
    });

    Geolocator.getServiceStatusStream();
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      if (mounted) {
        setState(() {
          _loadingMap = false;
          _mapError = 'Location permission denied';
        });
      }
      return;
    }

    Position? position;
    try {
      position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadingMap = false;
          _mapError = 'Could not get current location';
        });
      }
      return;
    }

    if (!mounted) return;
    setState(() {
      _currentPosition = position;
    });

    // Prefer stored task destination, then customer address
    LatLng? destLatLng;
    if (task.destinationLocation != null &&
        (task.destinationLocation!.lat != 0 ||
            task.destinationLocation!.lng != 0)) {
      destLatLng = LatLng(
        task.destinationLocation!.lat,
        task.destinationLocation!.lng,
      );
    }
    if (destLatLng == null && _customer != null) {
      final address =
          '${_customer!.address}, ${_customer!.city}, ${_customer!.pincode}';
      List<Location> locations = [];
      try {
        locations = await locationFromAddress(address);
      } catch (_) {}
      if (locations.isNotEmpty) {
        final dest = locations.first;
        destLatLng = LatLng(dest.latitude, dest.longitude);
      }
    }
    if (destLatLng == null) {
      if (mounted) {
        setState(() {
          _loadingMap = false;
          _mapError = _customer == null
              ? null
              : 'Could not find destination address';
          _distanceKm = null;
          _durationText = null;
        });
      }
      if (_customer == null) return;
      return;
    }

    // Use stored source for "current" marker when available, else use GPS
    if (task.sourceLocation != null &&
        (task.sourceLocation!.lat != 0 || task.sourceLocation!.lng != 0)) {
      position = Position(
        latitude: task.sourceLocation!.lat,
        longitude: task.sourceLocation!.lng,
        timestamp: DateTime.now(),
        accuracy: 0,
        altitude: 0,
        altitudeAccuracy: 0,
        heading: 0,
        headingAccuracy: 0,
        speed: 0,
        speedAccuracy: 0,
      );
      if (mounted) setState(() => _currentPosition = position);
    }

    setState(() {
      _destinationLatLng = destLatLng;
    });

    final currentPos = position;
    final dest = destLatLng;

    // Actual GPS path until Arrived (from Tracking) — not straight Directions route
    if (task.id != null && task.id!.isNotEmpty) {
      final travelledMaps = await TaskService().getTravelledPathUntilArrived(
        task.id!,
        arrivalTime: task.arrivalTime,
      );
      if (travelledMaps.length >= 2) {
        final travelledPts = travelledMaps
            .map((e) => LatLng(e['lat']!, e['lng']!))
            .toList();
        final pathStart = travelledPts.first;
        final pathEnd = travelledPts.last;
        try {
          final toDest = await DirectionsService.getRouteBetweenCoordinates(
            originLat: pathEnd.latitude,
            originLng: pathEnd.longitude,
            destLat: dest.latitude,
            destLng: dest.longitude,
          );
          if (!mounted) return;
          setState(() {
            _distanceKm = toDest.distanceKm;
            _durationText = toDest.durationText;
            _loadingMap = false;
            _markers = {
              Marker(
                markerId: const MarkerId('pathStart'),
                position: pathStart,
                icon: BitmapDescriptor.defaultMarkerWithHue(
                  BitmapDescriptor.hueViolet,
                ),
                infoWindow: const InfoWindow(title: 'Trip start'),
              ),
              Marker(
                markerId: const MarkerId('pathEnd'),
                position: pathEnd,
                icon: BitmapDescriptor.defaultMarkerWithHue(
                  BitmapDescriptor.hueYellow,
                ),
                infoWindow: const InfoWindow(title: 'Arrived here'),
              ),
            };
            _polylines.clear();
            _polylines.add(
              Polyline(
                polylineId: const PolylineId('travelled'),
                points: travelledPts,
                color: AppColors.primary,
                width: 4,
              ),
            );
          });
        } catch (_) {
          final meters = Geolocator.distanceBetween(
            pathEnd.latitude,
            pathEnd.longitude,
            dest.latitude,
            dest.longitude,
          );
          final km = meters / 1000;
          final min = (km / 30 * 60).round().clamp(0, 999);
          final eta = min > 60 ? '~${min ~/ 60} h' : '~$min min';
          if (!mounted) return;
          setState(() {
            _distanceKm = km;
            _durationText = eta;
            _loadingMap = false;
            _markers = {
              Marker(
                markerId: const MarkerId('pathStart'),
                position: pathStart,
                icon: BitmapDescriptor.defaultMarkerWithHue(
                  BitmapDescriptor.hueViolet,
                ),
                infoWindow: const InfoWindow(title: 'Trip start'),
              ),
              Marker(
                markerId: const MarkerId('pathEnd'),
                position: pathEnd,
                icon: BitmapDescriptor.defaultMarkerWithHue(
                  BitmapDescriptor.hueYellow,
                ),
                infoWindow: const InfoWindow(title: 'Arrived here'),
              ),
            };
            _polylines.clear();
            _polylines.add(
              Polyline(
                polylineId: const PolylineId('travelled'),
                points: travelledPts,
                color: AppColors.primary,
                width: 4,
              ),
            );
          });
        }
        return;
      }
    }

    try {
      final result = await DirectionsService.getRouteBetweenCoordinates(
        originLat: currentPos.latitude,
        originLng: currentPos.longitude,
        destLat: dest.latitude,
        destLng: dest.longitude,
      );
      if (!mounted) return;
      setState(() {
        _distanceKm = result.distanceKm;
        _durationText = result.durationText;
        _loadingMap = false;
        _markers = {
          Marker(
            markerId: const MarkerId('current'),
            position: LatLng(currentPos.latitude, currentPos.longitude),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueViolet,
            ),
            infoWindow: const InfoWindow(title: 'My Location'),
          ),
          Marker(
            markerId: const MarkerId('destination'),
            position: dest,
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueYellow,
            ),
            infoWindow: const InfoWindow(title: 'Destination'),
          ),
        };
        _polylines.clear();
        if (result.points.isNotEmpty) {
          _polylines.add(
            Polyline(
              polylineId: const PolylineId('route'),
              points: result.points,
              color: AppColors.primary,
              width: 4,
            ),
          );
        }
      });
    } catch (_) {
      final meters = Geolocator.distanceBetween(
        currentPos.latitude,
        currentPos.longitude,
        dest.latitude,
        dest.longitude,
      );
      final km = meters / 1000;
      final min = (km / 30 * 60).round().clamp(0, 999);
      final eta = min > 60 ? '~${min ~/ 60} h' : '~$min min';
      if (!mounted) return;
      setState(() {
        _distanceKm = km;
        _durationText = eta;
        _loadingMap = false;
        _markers = {
          Marker(
            markerId: const MarkerId('current'),
            position: LatLng(currentPos.latitude, currentPos.longitude),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueViolet,
            ),
            infoWindow: const InfoWindow(title: 'My Location'),
          ),
          Marker(
            markerId: const MarkerId('destination'),
            position: dest,
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueYellow,
            ),
            infoWindow: const InfoWindow(title: 'Destination'),
          ),
        };
        _polylines.clear();
        _polylines.add(
          Polyline(
            polylineId: const PolylineId('route'),
            points: [LatLng(currentPos.latitude, currentPos.longitude), dest],
            color: AppColors.primary,
            width: 4,
          ),
        );
      });
    }
  }

  Future<void> _onCallCustomer() async {
    final number = _customer?.customerNumber?.trim();
    if (number == null || number.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: number);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  String _companyNameHeader() {
    final c = _customer ?? task.customer;
    if (c == null) return '—';
    final company = c.companyName?.trim();
    if (company != null && company.isNotEmpty) return company;
    return c.customerName.trim().isEmpty ? '—' : c.customerName.trim();
  }

  String _taskDateAtHeader() {
    if (task.assignedDate != null) {
      return DateFormat('dd MMM yyyy').format(task.assignedDate!);
    }
    return DateDisplayUtil.formatShortDate(task.expectedCompletionDate);
  }

  Widget _buildVisitsStyleTaskHeader(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(
        4,
        MediaQuery.paddingOf(context).top + 4,
        4,
        28,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: Icon(
                  Icons.arrow_back_rounded,
                  color: Colors.black.withValues(alpha: 0.85),
                ),
                tooltip: 'Back',
              ),
              const Expanded(
                child: Text(
                  'TASK DETAILS',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.black,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.35,
                  ),
                ),
              ),
              const SizedBox(width: 48),
            ],
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.taskTitle,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: Colors.black,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _companyNameHeader(),
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.black.withValues(alpha: 0.78),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.event_note_rounded,
                      size: 18,
                      color: Colors.black.withValues(alpha: 0.7),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Task · ${_taskDateAtHeader()}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: Colors.black.withValues(alpha: 0.75),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTaskRouteSection() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TASK ROUTE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
              letterSpacing: 0.9,
            ),
          ),
          const SizedBox(height: 10),
          _buildMapCard(),
        ],
      ),
    );
  }

  Widget _buildRouteMetricsRow() {
    final km = _displayDistanceKm ?? _distanceKm;
    final kmText = km != null && km > 0
        ? '${km.toStringAsFixed(km < 1 ? 2 : 1)} km'
        : (_distanceKm != null && _distanceKm! > 0
              ? '${_distanceKm!.toStringAsFixed(1)} km'
              : '—');
    final durText = _travelDuration.inSeconds > 0
        ? _formatDuration(_travelDuration)
        : (_durationText ?? '—');

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Row(
        children: [
          Expanded(
            child: _routeMetricTile(
              icon: Icons.straighten_rounded,
              label: 'Distance',
              value: kmText,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _routeMetricTile(
              icon: Icons.schedule_rounded,
              label: 'Duration',
              value: durText,
            ),
          ),
        ],
      ),
    );
  }

  Widget _routeMetricTile({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: Colors.black87),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.grey.shade600,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.black87,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      body: Column(
        children: [
          _buildVisitsStyleTaskHeader(context),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(0, 0, 0, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildTaskRouteSection(),
                  _buildRouteMetricsRow(),
                  const SizedBox(height: 20),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _buildCustomerCard(),
                  ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _buildDestinationCard(),
                  ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _buildTaskRequirements(),
                  ),
                  _buildOtpVerificationStatus(),
                  if (_buildTrackEvents().isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildModernTrackTimeline(),
                    ),
                  ],
                  if (_hasCompletionDetails) ...[
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildCompletionDetailsCard(),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: _buildExitRestartHistoryCard(),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
          _buildBottomButtons(),
        ],
      ),
    );
  }

  BoxDecoration _taskDetailCardDecoration() {
    return BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: const Color(0xFFE2E8F0)),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.05),
          blurRadius: 20,
          offset: const Offset(0, 10),
        ),
      ],
    );
  }

  Widget _buildMapCard() {
    final initialPosition = _currentPosition != null
        ? LatLng(_currentPosition!.latitude, _currentPosition!.longitude)
        : (_destinationLatLng ?? const LatLng(11.0168, 76.9558));

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
        color: const Color(0xFFE8ECF0),
      ),
      clipBehavior: Clip.antiAlias,
      child: SizedBox(
        height: 220,
        child: Stack(
          children: [
            if (_loadingMap && _markers.isEmpty)
              const Center(child: AppTabLoader())
            else if (_mapError != null && _markers.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    _mapError!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                ),
              )
            else
              GoogleMap(
                initialCameraPosition: CameraPosition(
                  target: initialPosition,
                  zoom: 14,
                ),
                markers: _markers,
                polylines: _polylines,
                myLocationEnabled: true,
                myLocationButtonEnabled: true,
                zoomControlsEnabled: false,
                mapToolbarEnabled: false,
                minMaxZoomPreference: const MinMaxZoomPreference(2, 22),
                scrollGesturesEnabled: true,
                zoomGesturesEnabled: true,
                tiltGesturesEnabled: true,
                rotateGesturesEnabled: true,
                // Map sits inside SingleChildScrollView — without this, scroll steals pinch/pan.
                gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                  Factory<OneSequenceGestureRecognizer>(
                    () => EagerGestureRecognizer(),
                  ),
                },
                onMapCreated: (controller) {
                  if (_markers.isNotEmpty || _polylines.isNotEmpty) {
                    _fitBounds(controller);
                  }
                },
              ),
          ],
        ),
      ),
    );
  }

  void _fitBounds(GoogleMapController controller) {
    final List<LatLng> pts = [];
    for (final m in _markers) {
      pts.add(m.position);
    }
    for (final pl in _polylines) {
      pts.addAll(pl.points);
    }
    if (pts.isEmpty) {
      if (_destinationLatLng != null) {
        controller.animateCamera(
          CameraUpdate.newLatLngZoom(_destinationLatLng!, 14),
        );
      }
      return;
    }
    if (pts.length == 1) {
      controller.animateCamera(CameraUpdate.newLatLngZoom(pts.first, 15));
      return;
    }
    var minLat = pts.first.latitude;
    var maxLat = pts.first.latitude;
    var minLng = pts.first.longitude;
    var maxLng = pts.first.longitude;
    for (var i = 1; i < pts.length; i++) {
      final e = pts[i];
      if (e.latitude < minLat) minLat = e.latitude;
      if (e.latitude > maxLat) maxLat = e.latitude;
      if (e.longitude < minLng) minLng = e.longitude;
      if (e.longitude > maxLng) maxLng = e.longitude;
    }
    const pad = 0.002;
    if ((maxLat - minLat).abs() < 1e-6 && (maxLng - minLng).abs() < 1e-6) {
      controller.animateCamera(CameraUpdate.newLatLngZoom(pts.first, 15));
      return;
    }
    if ((maxLat - minLat).abs() < pad) {
      minLat -= pad;
      maxLat += pad;
    }
    if ((maxLng - minLng).abs() < pad) {
      minLng -= pad;
      maxLng += pad;
    }
    final bounds = LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
    controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 48));
  }

  Widget _buildCustomerCard() {
    if (_loadingCustomer) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: _taskDetailCardDecoration(),
        child: const Center(child: AppTabLoader()),
      );
    }
    if (_customerError != null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: _taskDetailCardDecoration(),
        child: Text(
          _customerError!,
          style: TextStyle(color: Colors.grey.shade700),
        ),
      );
    }
    if (_customer == null) {
      return const SizedBox.shrink();
    }

    final c = _customer!;
    final initial = c.customerName.isNotEmpty ? c.customerName[0].toUpperCase() : '?';
    final addressText = c.address.isNotEmpty
        ? '${c.address}, ${c.city} ${c.pincode}'.trim()
        : '${c.city} ${c.pincode}'.trim();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: _taskDetailCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.badge_outlined, size: 20, color: AppColors.primary),
              const SizedBox(width: 8),
              Text(
                'Customer details',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Colors.grey.shade800,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: AppColors.primary.withValues(alpha: 0.45),
                child: Text(
                  initial,
                  style: const TextStyle(
                    color: Colors.black87,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      c.customerName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Colors.black87,
                        height: 1.2,
                      ),
                    ),
                    if (c.customerNumber != null && c.customerNumber!.trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      InkWell(
                        onTap: _onCallCustomer,
                        borderRadius: BorderRadius.circular(8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(
                            children: [
                              Icon(Icons.phone_outlined, size: 18, color: Colors.black87),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  c.customerNumber!.trim(),
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.black87,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    if (c.effectiveEmail != null && c.effectiveEmail!.trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.mail_outline_rounded, size: 18, color: Colors.black87),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              c.effectiveEmail!.trim(),
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: Colors.grey.shade800,
                                height: 1.35,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.place_outlined, size: 20, color: AppColors.primary),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Address',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.grey.shade600,
                                    letterSpacing: 0.3,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  addressText.isEmpty ? '—' : addressText,
                                  style: TextStyle(
                                    fontSize: 13,
                                    height: 1.4,
                                    color: Colors.grey.shade800,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Parse "Source: X\nDestination: Y\n\n{body}" from description.
  ({String? source, String? destination, String body}) _parseSourceDestination(
    String? desc,
  ) {
    if (desc == null || desc.trim().isEmpty) {
      return (source: null, destination: null, body: desc ?? '');
    }
    String? source;
    String? destination;
    final lines = desc.split('\n');
    final bodyLines = <String>[];
    for (final line in lines) {
      if (line.startsWith('Source:')) {
        source = line.substring(7).trim();
      } else if (line.startsWith('Destination:')) {
        destination = line.substring(12).trim();
      } else if (line.trim().isNotEmpty || bodyLines.isNotEmpty) {
        bodyLines.add(line);
      }
    }
    return (
      source: source,
      destination: destination,
      body: bodyLines.join('\n').trim(),
    );
  }

  Widget _buildDestinationCard() {
    final parsed = _parseSourceDestination(task.description);
    final address = _customer != null
        ? '${_customer!.address}, ${_customer!.city}, ${_customer!.pincode}'
              .trim()
        : parsed.destination ?? '';

    if (_customer == null &&
        parsed.source == null &&
        parsed.destination == null) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: _taskDetailCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (parsed.source != null && parsed.source!.isNotEmpty) ...[
            Row(
              children: [
                Icon(
                  Icons.gps_fixed_rounded,
                  size: 20,
                  color: Colors.black87,
                ),
                const SizedBox(width: 8),
                Text(
                  'Source:',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              parsed.source!,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade800,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              Icon(
                Icons.location_on_rounded,
                size: 20,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              Text(
                'Destination:',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            parsed.destination?.isNotEmpty == true
                ? parsed.destination!
                : address,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade800,
              height: 1.4,
            ),
          ),
          if (_distanceKm != null) ...[
            const SizedBox(height: 8),
            Text(
              '${_distanceKm!.toStringAsFixed(1)} km away',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTaskRequirements() {
    final hasAny =
        task.isOtpRequired ||
        task.isGeoFenceRequired ||
        task.isPhotoRequired ||
        task.isFormRequired;
    if (!hasAny) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: _taskDetailCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.checklist_outlined, size: 20, color: AppColors.primary),
              const SizedBox(width: 8),
              Text(
                'Task requirements',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Colors.grey.shade800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (task.isOtpRequired) _chip('✓ OTP Required', Colors.green),
              if (task.isGeoFenceRequired)
                _chip('📍 Geo-Fence (500m)', Colors.purple),
              if (task.isPhotoRequired) _chip('📷 Photo Required', Colors.orange),
              if (task.isFormRequired) _chip('📝 Fill Form', Colors.teal),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: color,
        ),
      ),
    );
  }

  Widget _buildOtpVerificationStatus() {
    if (!task.isOtpRequired) return const SizedBox.shrink();
    final verified = task.isOtpVerified == true;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            verified ? Icons.verified_rounded : Icons.pending_rounded,
            size: 20,
            color: verified ? AppColors.primary : Colors.orange.shade700,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: DefaultTextStyle.of(context).style,
                children: [
                  if (verified)
                    TextSpan(
                      text: 'OTP Verified: Yes',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _formatDuration(Duration d) {
    final secs = d.inSeconds;
    if (secs < 60) return secs == 1 ? '1 sec' : '$secs secs';
    final mins = d.inMinutes;
    final remainderSecs = d.inSeconds.remainder(60);
    if (d.inHours > 0) {
      final h = d.inHours;
      final m = mins.remainder(60);
      if (remainderSecs > 0) return '${h}h ${m}m ${remainderSecs}s';
      return '${h}h ${m}m';
    }
    if (remainderSecs > 0) {
      return '$mins min${mins == 1 ? '' : 's'} $remainderSecs secs';
    }
    return mins == 1 ? '1 min' : '$mins mins';
  }

  static String _formatDistanceKm(double distanceKm) {
    final decimals = distanceKm < 1 ? 2 : 1;
    return '${distanceKm.toStringAsFixed(decimals)} km';
  }

  Duration get _travelDuration {
    final secs = task.tripDurationSeconds;
    if (secs != null && secs > 0) {
      return Duration(seconds: secs);
    }
    if (task.startTime != null &&
        task.arrivalTime != null &&
        !task.arrivalTime!.isBefore(task.startTime!)) {
      return task.arrivalTime!.difference(task.startTime!);
    }
    return Duration.zero;
  }

  Duration? get _totalTaskDuration {
    if (task.startTime != null &&
        task.completedDate != null &&
        !task.completedDate!.isBefore(task.startTime!)) {
      return task.completedDate!.difference(task.startTime!);
    }
    return null;
  }

  bool get _showOtpRow =>
      task.isOtpRequired || task.isOtpVerified != null || task.otpVerifiedAt != null;

  double? get _displayDistanceKm {
    final taskDistance = task.tripDistanceKm;
    if (taskDistance != null && taskDistance > 0) return taskDistance;
    if (_routeDistanceKm != null && _routeDistanceKm! > 0) return _routeDistanceKm;
    return null;
  }

  bool get _hasCompletionDetails {
    final distanceKm = _displayDistanceKm;
    return task.startTime != null ||
        task.completedDate != null ||
        _travelDuration.inSeconds > 0 ||
        (_totalTaskDuration?.inSeconds ?? 0) > 0 ||
        (distanceKm != null && distanceKm > 0) ||
        _showOtpRow;
  }

  List<_TaskTrackEvent> _buildTrackEvents() {
    final events = <_TaskTrackEvent>[];
    final start = task.startTime;
    final arrival = task.arrivalTime;
    final completed = task.completedDate;
    final duration = _travelDuration;
    final distanceKm = _displayDistanceKm;

    if (start != null) {
      events.add(
        _TaskTrackEvent(
          time: start,
          title: 'Task started',
          subtitle: 'Journey began',
          icon: Icons.flag_circle_rounded,
          iconColor: const Color(0xFF1565C0),
        ),
      );
    }

    if (start != null &&
        (duration.inSeconds > 0 || (distanceKm != null && distanceKm > 0))) {
      final distanceText = distanceKm != null && distanceKm > 0
          ? '${_formatDistanceKm(distanceKm)} covered'
          : 'Travel in progress';
      events.add(
        _TaskTrackEvent(
          time: start,
          title: 'On the way',
          subtitle: distanceText,
          icon: Icons.alt_route_rounded,
          iconColor: const Color(0xFF00897B),
        ),
      );
    }

    if (arrival != null) {
      events.add(
        _TaskTrackEvent(
          time: arrival,
          title: 'Arrived',
          subtitle: task.arrivalLocation?.displayAddress?.isNotEmpty == true
              ? task.arrivalLocation!.displayAddress!
              : 'Destination reached',
          icon: Icons.pin_drop_rounded,
          iconColor: const Color(0xFFC62828),
        ),
      );
    }

    if (task.isOtpVerified == true && task.otpVerifiedAt != null) {
      events.add(
        _TaskTrackEvent(
          time: task.otpVerifiedAt,
          title: 'OTP verified',
          subtitle: 'Customer confirmed',
          icon: Icons.verified_outlined,
          iconColor: const Color(0xFF6A1B9A),
        ),
      );
    }

    if (completed != null) {
      events.add(
        _TaskTrackEvent(
          time: completed,
          title: 'Task completed',
          subtitle: task.status == TaskStatus.waitingForApproval
              ? 'Awaiting admin approval'
              : 'Closed on device',
          icon: Icons.task_alt_rounded,
          iconColor: const Color(0xFF2E7D32),
        ),
      );
    }

    final withTime = events.where((e) => e.time != null).toList()
      ..sort((a, b) => a.time!.compareTo(b.time!));
    return withTime;
  }

  Widget _buildModernTrackTimeline() {
    final events = _buildTrackEvents();
    if (events.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'TIMELINE',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: AppColors.primary,
            letterSpacing: 0.9,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(8, 20, 16, 20),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: Colors.black.withValues(alpha: 0.06),
            ),
          ),
          child: Column(
            children: [
              for (int i = 0; i < events.length; i++) ...[
                _modernTimelineRow(events[i], isLast: i == events.length - 1),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _modernTimelineRow(_TaskTrackEvent e, {required bool isLast}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 48,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      e.iconColor,
                      e.iconColor.withValues(alpha: 0.75),
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: e.iconColor.withValues(alpha: 0.35),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(e.icon, color: Colors.white, size: 22),
              ),
              if (!isLast)
                Container(
                  width: 3,
                  height: 40,
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(2),
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        e.iconColor.withValues(alpha: 0.45),
                        Colors.grey.shade300,
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: Colors.black.withValues(alpha: 0.06),
                    ),
                  ),
                  child: Text(
                    DateDisplayUtil.formatTime(e.time),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: Colors.grey.shade700,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  e.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.black87,
                    height: 1.2,
                  ),
                ),
                if (e.subtitle.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    e.subtitle,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.35,
                      color: Colors.grey.shade600,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCompletionDetailsCard() {
    final distanceKm = _displayDistanceKm;
    final totalTaskDuration = _totalTaskDuration;
    final showDistance = distanceKm != null && distanceKm > 0;
    final otpVerified = task.isOtpVerified == true;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black.withValues(alpha: 0.07)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(width: 5, color: AppColors.primary),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 18, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.35),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.insights_rounded,
                            size: 22,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Text(
                          'Task summary',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                            color: Colors.black87,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    if (task.startTime != null)
                      _summaryModernTile(
                        Icons.play_circle_outline_rounded,
                        'Started',
                        DateDisplayUtil.formatTime(task.startTime),
                      ),
                    if (task.completedDate != null) ...[
                      if (task.startTime != null) const SizedBox(height: 12),
                      _summaryModernTile(
                        Icons.check_circle_outline_rounded,
                        'Completed',
                        DateDisplayUtil.formatTime(task.completedDate),
                      ),
                    ],
                    if (_travelDuration.inSeconds > 0) ...[
                      if (task.startTime != null || task.completedDate != null)
                        const SizedBox(height: 12),
                      _summaryModernTile(
                        Icons.timer_outlined,
                        'Travel time',
                        _formatDuration(_travelDuration),
                      ),
                    ],
                    if (totalTaskDuration != null &&
                        totalTaskDuration.inSeconds > 0) ...[
                      if (task.startTime != null ||
                          task.completedDate != null ||
                          _travelDuration.inSeconds > 0)
                        const SizedBox(height: 12),
                      _summaryModernTile(
                        Icons.hourglass_top_rounded,
                        'Total on task',
                        _formatDuration(totalTaskDuration),
                      ),
                    ],
                    if (showDistance) ...[
                      if (task.startTime != null ||
                          task.completedDate != null ||
                          _travelDuration.inSeconds > 0 ||
                          (totalTaskDuration?.inSeconds ?? 0) > 0)
                        const SizedBox(height: 12),
                      _summaryModernTile(
                        Icons.route_rounded,
                        'Distance',
                        '${distanceKm.toStringAsFixed(2)} km',
                      ),
                    ],
                    if (_showOtpRow) ...[
                      if (task.startTime != null ||
                          task.completedDate != null ||
                          _travelDuration.inSeconds > 0 ||
                          (totalTaskDuration?.inSeconds ?? 0) > 0 ||
                          showDistance)
                        const SizedBox(height: 12),
                      _summaryModernTile(
                        otpVerified
                            ? Icons.verified_outlined
                            : Icons.phonelink_lock_rounded,
                        'OTP',
                        otpVerified ? 'Verified' : 'Pending',
                        valueColor: otpVerified ? const Color(0xFF2E7D32) : null,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryModernTile(
    IconData icon,
    String label,
    String value, {
    Color? valueColor,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, size: 22, color: Colors.blueGrey.shade700),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: valueColor ?? Colors.black87,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExitRestartHistoryCard() {
    final exits = task.tasksExit;
    final restarts = task.tasksRestarted;
    if (exits.isEmpty && restarts.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: _taskDetailCardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.history_rounded,
                  size: 22,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Exit & Restart History',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Colors.black,
                      ),
                    ),
                    Text(
                      'Past exits and restarts for this task',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => TaskHistoryScreen(task: task),
                    ),
                  );
                },
                icon: const Icon(Icons.arrow_forward_rounded, size: 16),
                label: Text('View all'),
              ),
            ],
          ),
          if (exits.isNotEmpty) ...[
            const SizedBox(height: 16),
            ...exits.asMap().entries.map(
              (e) => _historyTile(
                'Exit #${e.key + 1}',
                e.value.exitReason,
                e.value.exitedAt,
                e.value.address,
                e.value.pincode,
                Icons.exit_to_app_rounded,
                Colors.orange,
              ),
            ),
          ],
          if (restarts.isNotEmpty) ...[
            const SizedBox(height: 6),
            ...restarts.asMap().entries.map(
              (e) => _historyTile(
                'Resumed #${e.key + 1}',
                null,
                e.value.resumedAt,
                e.value.address,
                e.value.pincode,
                Icons.replay_rounded,
                Colors.green,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _historyDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 68,
            child: Text(
              '$label:',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(fontSize: 11, color: Colors.black),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _historyTile(
    String type,
    String? reason,
    DateTime? date,
    String? address,
    String? pincode,
    IconData icon,
    Color color,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    type,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                  if (date != null)
                    _historyDetailRow(
                      'Date & Time',
                      DateDisplayUtil.formatDateTime(date),
                    ),
                  if (reason != null && reason.isNotEmpty)
                    _historyDetailRow('Reason', reason),
                  if (address != null && address.isNotEmpty)
                    _historyDetailRow('Location', address),
                  if (pincode != null && pincode.isNotEmpty)
                    _historyDetailRow('Pincode', pincode),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _actionLoading = false;

  /// Show "Start Ride": autoApprove true → assigned/pending (direct start); autoApprove false → only when approved
  /// autoApprove false = manual approval required; autoApprove true = can start directly
  bool get _showStartRideButton =>
      task.id != null &&
      task.id!.isNotEmpty &&
      ((task.status == TaskStatus.assigned ||
                  task.status == TaskStatus.pending) &&
              task.autoApprove ||
          (!task.autoApprove &&
              (task.status == TaskStatus.approved ||
                  task.status == TaskStatus.staffapproved)));

  /// Show "Resume Ride" when task is on hold, holdOnArrival, reopenedOnArrival, exited with hold, or admin reopened.
  bool get _showResumeAfterExitButton =>
      task.id != null &&
      task.id!.isNotEmpty &&
      (task.status == TaskStatus.hold ||
          task.status == TaskStatus.holdOnArrival ||
          task.status == TaskStatus.reopenedOnArrival ||
          task.status == TaskStatus.exited &&
              (task.taskExitStatus == 'hold' || task.taskExitStatus == null) ||
          task.status == TaskStatus.reopened);

  /// Show "Resume Ride" when task is in progress.
  bool get _showResumeRideButton =>
      task.id != null &&
      task.id!.isNotEmpty &&
      task.status == TaskStatus.inProgress;

  /// Show only Back when completed, waiting_for_approval, or rejected.
  bool get _showBackOnly =>
      task.status == TaskStatus.completed ||
      task.status == TaskStatus.waitingForApproval ||
      task.status == TaskStatus.rejected;

  /// Show Approve/Reject when autoApprove is false (manual approval required) and task is assigned/pending.
  bool get _showApprovalButtons =>
      !task.autoApprove &&
      (task.status == TaskStatus.assigned ||
          task.status == TaskStatus.pending) &&
      task.id != null &&
      task.id!.isNotEmpty &&
      !_showResumeRideButton &&
      !_showResumeAfterExitButton &&
      !_showBackOnly;

  /// Staff can always approve; OTP verification applies only at arrival (arrived screen).
  bool get _canApprove => true;

  /// Resolve pickup (source) LatLng: task.sourceLocation > current GPS.
  LatLng? get _pickupLatLng {
    if (task.sourceLocation != null &&
        (task.sourceLocation!.lat != 0 || task.sourceLocation!.lng != 0)) {
      return LatLng(task.sourceLocation!.lat, task.sourceLocation!.lng);
    }
    if (_currentPosition != null) {
      return LatLng(_currentPosition!.latitude, _currentPosition!.longitude);
    }
    return null;
  }

  /// Resolve dropoff (destination) LatLng: task.destinationLocation > geocoded customer.
  LatLng? get _dropoffLatLng {
    if (task.destinationLocation != null &&
        (task.destinationLocation!.lat != 0 ||
            task.destinationLocation!.lng != 0)) {
      return LatLng(
        task.destinationLocation!.lat,
        task.destinationLocation!.lng,
      );
    }
    return _destinationLatLng;
  }

  Future<void> _onApprove() async {
    if (task.id == null || _actionLoading) return;
    setState(() => _actionLoading = true);
    try {
      final updated = await TaskService().updateTask(
        task.id!,
        status: 'approved',
      );
      if (mounted) {
        setState(() {
          task = updated;
          _actionLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _actionLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ErrorMessageUtils.toUserFriendlyMessage(e))),
        );
      }
    }
  }

  Future<void> _onReject() async {
    if (task.id == null || _actionLoading) return;
    setState(() => _actionLoading = true);
    try {
      await TaskService().updateTask(task.id!, status: 'rejected');
      if (mounted) {
        setState(() => _actionLoading = false);
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _actionLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ErrorMessageUtils.toUserFriendlyMessage(e))),
        );
      }
    }
  }

  Future<void> _onStartRide() async {
    if (task.id == null || _actionLoading) return;
    final pickup = _pickupLatLng;
    final dropoff = _dropoffLatLng;
    if (pickup == null || dropoff == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Source and destination are required. Enable GPS and ensure destination is set.',
          ),
        ),
      );
      return;
    }
    setState(() => _actionLoading = true);
    var pausedPresenceForRide = false;
    try {
      final startLat = _currentPosition?.latitude ?? pickup.latitude;
      final startLng = _currentPosition?.longitude ?? pickup.longitude;
      late final Task updated;
      if (task.status == TaskStatus.exited ||
          task.status == TaskStatus.hold ||
          task.status == TaskStatus.holdOnArrival ||
          task.status == TaskStatus.reopenedOnArrival ||
          task.status == TaskStatus.reopened) {
        // Resume after exit/hold/reopened: use restart API
        await TaskService().restartTask(task.id!, lat: startLat, lng: startLng);
        updated = await TaskService().getTaskById(task.id!);
      } else {
        updated = await TaskService().updateTask(
          task.id!,
          status: 'in_progress',
          startTime: DateTime.now(),
          startLat: startLat,
          startLng: startLng,
        );
      }
      // Store initial point in Tracking collection (separate route).
      TaskService()
          .storeTracking(task.id!, startLat, startLng, movementType: 'stop')
          .catchError((_) => false);
      if (!mounted) return;
      PresenceTrackingService().pausePresenceTracking();
      pausedPresenceForRide = true;
      setState(() => _actionLoading = false);
      if (updated.status == TaskStatus.arrived) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => ArrivedScreen(
              taskMongoId: updated.id,
              taskId: updated.taskId,
              task: updated,
              totalDuration: Duration(
                seconds: updated.tripDurationSeconds ?? 0,
              ),
              totalDistanceKm: updated.tripDistanceKm ?? 0.0,
              isWithinGeofence: false,
              arrivalTime: updated.arrivalTime ?? DateTime.now(),
              sourceLat: updated.sourceLocation?.lat,
              sourceLng: updated.sourceLocation?.lng,
              sourceAddress: updated.sourceLocation?.address,
              destLat: updated.destinationLocation?.lat,
              destLng: updated.destinationLocation?.lng,
              destAddress: updated.destinationLocation?.address,
              arrivalAtLat: updated.arrivalLocation?.lat,
              arrivalAtLng: updated.arrivalLocation?.lng,
              arrivalAtAddress: updated.arrivalLocation?.displayAddress,
            ),
          ),
        );
      } else {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => LiveTrackingScreen(
              taskId: updated.taskId,
              taskMongoId: updated.id,
              pickupLocation: pickup,
              dropoffLocation: dropoff,
              task: updated,
            ),
          ),
        );
      }
    } catch (e) {
      if (pausedPresenceForRide) {
        await PresenceTrackingService().resumePresenceTracking();
      }
      if (mounted) {
        setState(() => _actionLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ErrorMessageUtils.toUserFriendlyMessage(e))),
        );
      }
    }
  }

  Future<void> _onResumeRide() async {
    if (task.id == null || _actionLoading) return;
    final pickup = _pickupLatLng;
    final dropoff = _dropoffLatLng;
    if (pickup == null || dropoff == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Source and destination are required. Enable GPS and ensure destination is set.',
          ),
        ),
      );
      return;
    }
    setState(() => _actionLoading = true);
    var pausedPresenceForRide = false;
    try {
      // Refresh task to get latest state; do NOT update status or startTime.
      final refreshed = await TaskService().getTaskById(task.id!);
      if (!mounted) return;
      PresenceTrackingService().pausePresenceTracking();
      pausedPresenceForRide = true;
      setState(() => _actionLoading = false);
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (context) => LiveTrackingScreen(
            taskId: refreshed.taskId,
            taskMongoId: refreshed.id,
            pickupLocation: pickup,
            dropoffLocation: dropoff,
            task: refreshed,
          ),
        ),
      );
    } catch (e) {
      if (pausedPresenceForRide) {
        await PresenceTrackingService().resumePresenceTracking();
      }
      if (mounted) {
        setState(() => _actionLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ErrorMessageUtils.toUserFriendlyMessage(e))),
        );
      }
    }
  }

  Widget _buildPrimaryJourneyButton({
    required VoidCallback? onPressed,
    required bool loading,
    required bool resumeLook,
    required String idleLabel,
    required String busyLabel,
  }) {
    final fg = Colors.black87;
    return SizedBox(
      width: double.infinity,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              color: resumeLook ? Colors.white : AppColors.primary,
              border: Border.all(
                color: AppColors.primary,
                width: resumeLook ? 2.5 : 0,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(
                    alpha: resumeLook ? 0.12 : 0.32,
                  ),
                  blurRadius: resumeLook ? 8 : 16,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (loading)
                    SizedBox(
                      width: 24,
                      height: 24,
                      child: LocationLoader(color: fg, size: 24),
                    )
                  else
                    Icon(
                      resumeLook
                          ? Icons.arrow_circle_right_rounded
                          : Icons.directions_car_filled_rounded,
                      size: 28,
                      color: fg,
                    ),
                  const SizedBox(width: 10),
                  Text(
                    loading ? busyLabel : idleLabel,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.2,
                      color: fg,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomButtons() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: widget.fromRideScreen
            ? SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(
                    Icons.arrow_back_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                  label: Text(
                    'Back to Ride',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 2,
                  ),
                ),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_showApprovalButtons) ...[
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _actionLoading
                                ? null
                                : () => _onReject(),
                            icon: const Icon(Icons.close_rounded, size: 20),
                            label: Text('Reject'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.red.shade700,
                              side: BorderSide(color: Colors.red.shade300),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: (_actionLoading || !_canApprove)
                                ? null
                                : () => _onApprove(),
                            icon: _actionLoading
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: LocationLoader(
                                      color: Colors.white,
                                      size: 22,
                                    ),
                                  )
                                : const Icon(
                                    Icons.check_circle_rounded,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                            label: Text(
                              _actionLoading ? 'Approving...' : 'Approve',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.success,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: 2,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (_showStartRideButton ||
                        _showResumeRideButton ||
                        _showResumeAfterExitButton)
                      const SizedBox(height: 12),
                  ],
                  if (_showStartRideButton || _showResumeAfterExitButton)
                    _buildPrimaryJourneyButton(
                      onPressed: _actionLoading ? null : _onStartRide,
                      loading: _actionLoading,
                      resumeLook: _showResumeAfterExitButton,
                      idleLabel: _showResumeAfterExitButton
                          ? 'Resume ride'
                          : 'Start ride',
                      busyLabel: _showResumeAfterExitButton
                          ? 'Resuming…'
                          : 'Starting…',
                    ),
                  if (_showResumeRideButton)
                    _buildPrimaryJourneyButton(
                      onPressed: _actionLoading ? null : _onResumeRide,
                      loading: _actionLoading,
                      resumeLook: true,
                      idleLabel: 'Resume tracking',
                      busyLabel: 'Opening map…',
                    ),
                  if ((task.status == TaskStatus.exited &&
                          task.taskExitStatus == 'exited') ||
                      task.status == TaskStatus.exitedOnArrival) ...[
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        'Task was fully exited. Only admin can reopen this task; then you can resume the ride.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade700,
                          height: 1.3,
                        ),
                      ),
                    ),
                  ],
                  if (!_showApprovalButtons &&
                      !_showStartRideButton &&
                      !_showResumeRideButton &&
                      !_showResumeAfterExitButton)
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _actionLoading
                                ? null
                                : () => Navigator.of(context).pop(),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              side: BorderSide(color: Colors.grey.shade400),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: Text('Back'),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
      ),
    );
  }
}
