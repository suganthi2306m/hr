import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/services/geo/location_service.dart';

/// One row in the main “fix location” popup — tap opens where-to-enable steps.
class _ReliabilityRow {
  const _ReliabilityRow({
    required this.title,
    required this.stepsAndroid,
    required this.stepsIos,
  });

  final String title;
  final String stepsAndroid;
  final String stepsIos;
}

List<_ReliabilityRow> _rowsFromSnapshot(AttendanceLocationReliabilitySnapshot s) {
  final rows = <_ReliabilityRow>[];
  if (!s.gpsEnabled) {
    rows.add(
      const _ReliabilityRow(
        title: 'Turn on GPS / location services',
        stepsAndroid:
            '1. Swipe down from the top of the screen.\n'
            '2. Tap Location (or open Settings → Location).\n'
            '3. Turn Location / Use location ON.',
        stepsIos:
            '1. Open the Settings app.\n'
            '2. Tap Privacy & Security → Location Services.\n'
            '3. Turn Location Services ON.',
      ),
    );
  }
  if (!s.foregroundLocationAllowed) {
    rows.add(
      const _ReliabilityRow(
        title: 'Allow location for LiveTrack',
        stepsAndroid:
            '1. Open Settings → Apps → LiveTrack (or your app name).\n'
            '2. Tap Permissions → Location.\n'
            '3. Choose Allow only while using the app (or Allow all the time).\n'
            '4. If you see “Ask every time”, pick Allow.',
        stepsIos:
            '1. Open Settings → LiveTrack.\n'
            '2. Tap Location.\n'
            '3. Choose While Using the App or Always.',
      ),
    );
  }
  if (!s.backgroundLocationAllowed) {
    rows.add(
      const _ReliabilityRow(
        title: 'Allow all the time / Always (background + closed app)',
        stepsAndroid:
            '1. Open Settings → Apps → LiveTrack → Permissions → Location.\n'
            '2. Select Allow all the time.\n'
            '3. If Android asks for background location, confirm Allow.\n'
            'Note: A small ongoing notification may stay visible while tracking runs.',
        stepsIos:
            '1. Open Settings → LiveTrack → Location.\n'
            '2. Choose Always so updates can run when the app is in the background or the screen is off.',
      ),
    );
  }
  if (!s.preciseLocationEnabled) {
    rows.add(
      const _ReliabilityRow(
        title: 'Enable precise location',
        stepsAndroid:
            '1. Open Settings → Apps → LiveTrack → Permissions → Location.\n'
            '2. Turn Precise location ON (wording may be “Use precise location”).',
        stepsIos:
            '1. Open Settings → LiveTrack → Location.\n'
            '2. Enable Precise Location if shown.',
      ),
    );
  }
  if (!s.batteryOptimizationIgnored) {
    rows.add(
      const _ReliabilityRow(
        title: 'Unrestricted battery (Android)',
        stepsAndroid:
            '1. Open Settings → Apps → LiveTrack.\n'
            '2. Tap Battery (or App battery usage).\n'
            '3. Choose Unrestricted / Not optimized.\n'
            'This reduces Android pausing background location when the phone sleeps.',
        stepsIos:
            'iOS does not use this item the same way; ensure Low Power Mode is off if you need frequent updates.',
      ),
    );
  }
  if (!s.postNotificationsAllowed) {
    rows.add(
      const _ReliabilityRow(
        title: 'Allow notifications (Android)',
        stepsAndroid:
            '1. Open Settings → Apps → LiveTrack → Notifications.\n'
            '2. Turn All LiveTrack notifications ON.\n'
            'A visible notification is required for background location on Android.',
        stepsIos:
            '1. Open Settings → LiveTrack → Notifications.\n'
            '2. Allow Notifications if you use push alerts.',
      ),
    );
  }
  if (!s.activityRecognitionAllowed) {
    rows.add(
      const _ReliabilityRow(
        title: 'Physical activity permission (Android)',
        stepsAndroid:
            '1. Open Settings → Apps → LiveTrack → Permissions.\n'
            '2. Find Physical activity (or Body sensors) and set to Allow.\n'
            'Used only to improve walk / drive / stop detection.',
        stepsIos:
            '1. Open Settings → LiveTrack → Motion & Fitness (if listed).\n'
            '2. Enable if you want improved movement detection.',
      ),
    );
  }
  return rows;
}

Future<void> _showWhereToEnableDialog(
  BuildContext context,
  _ReliabilityRow row,
) async {
  final steps = Platform.isAndroid ? row.stepsAndroid : row.stepsIos;
  await showDialog<void>(
    context: context,
    builder: (ctx) {
      final theme = Theme.of(ctx);
      return AlertDialog(
        title: Text(row.title, style: theme.textTheme.titleMedium),
        content: SingleChildScrollView(
          child: SelectableText(
            steps,
            style: theme.textTheme.bodyMedium?.copyWith(height: 1.45),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close'),
          ),
          FilledButton(
            onPressed: () async {
              await openAppSettings();
              if (ctx.mounted) Navigator.of(ctx).pop();
            },
            child: const Text('Open app settings'),
          ),
        ],
      );
    },
  );
}

/// Shows a modal when the app is opened / resumed and background location is not fully configured.
class ReliableLocationSetupCoordinator extends StatefulWidget {
  const ReliableLocationSetupCoordinator({super.key, required this.navigatorKey});

  final GlobalKey<NavigatorState> navigatorKey;

  /// Call after login / session restore so the popup can appear even if [resumed] did not fire.
  static void notifySessionActive() {
    _ReliableLocationSetupCoordinatorState.notifySessionActive();
  }

  @override
  State<ReliableLocationSetupCoordinator> createState() =>
      _ReliableLocationSetupCoordinatorState();
}

class _ReliableLocationSetupCoordinatorState extends State<ReliableLocationSetupCoordinator>
    with WidgetsBindingObserver {
  static _ReliableLocationSetupCoordinatorState? _instance;

  static void notifySessionActive() {
    final s = _instance;
    if (s == null) return;
    unawaited(s._refresh(offerPopup: true));
  }

  bool _loading = true;
  bool _loggedIn = false;
  AttendanceLocationReliabilitySnapshot? _snapshot;
  bool _hiddenUntilNextResume = false;
  bool _mainDialogOpen = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _instance = this;
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refresh(offerPopup: true));
  }

  @override
  void dispose() {
    if (_instance == this) _instance = null;
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _hiddenUntilNextResume = false;
      unawaited(_refresh(offerPopup: true));
    }
  }

  Future<void> _refresh({bool offerPopup = false}) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final loggedIn = token != null && token.trim().isNotEmpty;
    if (!loggedIn) {
      _poll?.cancel();
      if (mounted) {
        setState(() {
          _loggedIn = false;
          _snapshot = null;
          _loading = false;
        });
      }
      return;
    }

    final snap = await LocationService.snapshotAttendanceLocationReliability();
    if (!mounted) return;
    _poll?.cancel();
    if (snap.needsSetup) {
      _poll = Timer.periodic(const Duration(seconds: 12), (_) {
        unawaited(_refresh(offerPopup: false));
      });
    }
    setState(() {
      _loggedIn = true;
      _snapshot = snap;
      _loading = false;
    });

    if (offerPopup && snap.needsSetup && !_hiddenUntilNextResume) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(_tryShowMainPopup());
      });
    }
  }

  Future<void> _tryShowMainPopup() async {
    if (!mounted || _loading || !_loggedIn || _snapshot == null) return;
    if (!_snapshot!.needsSetup || _hiddenUntilNextResume || _mainDialogOpen) {
      return;
    }
    final navCtx = widget.navigatorKey.currentContext;
    if (navCtx == null) return;

    _mainDialogOpen = true;
    try {
      await showDialog<void>(
        context: navCtx,
        barrierDismissible: false,
        builder: (dialogCtx) {
          final theme = Theme.of(dialogCtx);
          final snap = _snapshot!;
          final rows = _rowsFromSnapshot(snap);
          var fixBusy = false;
          return StatefulBuilder(
            builder: (ctx, setModalState) {
              return AlertDialog(
                insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                title: Row(
                  children: [
                    Icon(Icons.location_on_rounded, color: theme.colorScheme.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Location for background & sleep',
                        style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                content: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Tap any item to see exactly where to enable it in system settings. '
                        'These are needed so your location can still upload when the app is closed or the phone is asleep (where the OS allows it).',
                        style: theme.textTheme.bodyMedium?.copyWith(height: 1.4),
                      ),
                      const SizedBox(height: 14),
                      for (final row in rows)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Material(
                            color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.65),
                            borderRadius: BorderRadius.circular(14),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: fixBusy
                                  ? null
                                  : () => unawaited(_showWhereToEnableDialog(ctx, row)),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.info_outline_rounded,
                                      size: 22,
                                      color: theme.colorScheme.primary,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        row.title,
                                        style: theme.textTheme.bodyMedium?.copyWith(
                                          fontWeight: FontWeight.w600,
                                          height: 1.25,
                                        ),
                                      ),
                                    ),
                                    Icon(
                                      Icons.chevron_right_rounded,
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: fixBusy
                        ? null
                        : () {
                            setState(() => _hiddenUntilNextResume = true);
                            Navigator.of(ctx).pop();
                          },
                    child: const Text('Not now'),
                  ),
                  FilledButton.icon(
                    onPressed: fixBusy
                        ? null
                        : () async {
                            fixBusy = true;
                            setModalState(() {});
                            try {
                              await LocationService.requestAttendanceLocationReliabilitySetup(
                                ctx,
                              );
                              if (ctx.mounted) Navigator.of(ctx).pop();
                              await _refresh(offerPopup: false);
                            } catch (e) {
                              if (kDebugMode) {
                                debugPrint(
                                  '[ReliableLocationSetupCoordinator] fix failed: $e',
                                );
                              }
                            } finally {
                              fixBusy = false;
                              if (ctx.mounted) setModalState(() {});
                            }
                          },
                    icon: fixBusy
                        ? SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: theme.colorScheme.onPrimary,
                            ),
                          )
                        : const Icon(Icons.auto_fix_high_rounded, size: 18),
                    label: Text(fixBusy ? 'Please wait…' : 'Request permissions'),
                  ),
                ],
              );
            },
          );
        },
      );
    } finally {
      _mainDialogOpen = false;
    }
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
