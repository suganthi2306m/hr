import 'package:track/services/geo/location_service.dart';

/// One permission row for Settings → Permission settings UI.
class LocationPermissionCatalogRow {
  const LocationPermissionCatalogRow({
    required this.title,
    required this.subtitle,
    required this.stepsAndroid,
    required this.stepsIos,
    required this.enabled,
  });

  final String title;
  final String subtitle;
  final String stepsAndroid;
  final String stepsIos;
  final bool enabled;
}

/// All checks shown in Permission settings (enabled / not enabled per row).
List<LocationPermissionCatalogRow> locationPermissionCatalog(
  AttendanceLocationReliabilitySnapshot s,
) {
  return [
    LocationPermissionCatalogRow(
      title: 'GPS / location services',
      subtitle: 'Phone-wide location must be on',
      stepsAndroid:
          '1. Swipe down from the top → enable Location.\n'
          'Or: Settings → Location → On.',
      stepsIos:
          '1. Settings → Privacy & Security → Location Services → On.',
      enabled: s.gpsEnabled,
    ),
    LocationPermissionCatalogRow(
      title: 'Location for LiveTrack',
      subtitle: 'While using the app (minimum)',
      stepsAndroid:
          '1. Settings → Apps → LiveTrack → Permissions → Location.\n'
          '2. Choose at least “Allow only while using the app”.',
      stepsIos:
          '1. Settings → LiveTrack → Location → While Using the App or Always.',
      enabled: s.foregroundLocationAllowed,
    ),
    LocationPermissionCatalogRow(
      title: 'Background location',
      subtitle: 'Allow all the time (Android) or Always (iOS)',
      stepsAndroid:
          '1. Settings → Apps → LiveTrack → Permissions → Location.\n'
          '2. Select Allow all the time.\n'
          '3. Confirm if Android asks about background location.',
      stepsIos:
          '1. Settings → LiveTrack → Location → Always.\n'
          'Needed when the app is in the background or the screen is off.',
      enabled: s.backgroundLocationAllowed,
    ),
    LocationPermissionCatalogRow(
      title: 'Precise location',
      subtitle: 'More accurate GPS for visits & attendance',
      stepsAndroid:
          '1. Settings → Apps → LiveTrack → Permissions → Location.\n'
          '2. Turn on Precise location / Use precise location.',
      stepsIos:
          '1. Settings → LiveTrack → Location → enable Precise Location if shown.',
      enabled: s.preciseLocationEnabled,
    ),
    LocationPermissionCatalogRow(
      title: 'Battery (unrestricted)',
      subtitle: 'Android: avoid killing background tracking',
      stepsAndroid:
          '1. Settings → Apps → LiveTrack → Battery (or App battery usage).\n'
          '2. Choose Unrestricted / Not optimized.',
      stepsIos:
          'iOS manages background activity automatically. Turn off Low Power Mode if updates seem delayed.',
      enabled: s.batteryOptimizationIgnored,
    ),
    LocationPermissionCatalogRow(
      title: 'Notifications',
      subtitle: 'Android: required for ongoing location notification',
      stepsAndroid:
          '1. Settings → Apps → LiveTrack → Notifications → On.\n'
          'A visible notification is required for background location on Android.',
      stepsIos:
          '1. Settings → LiveTrack → Notifications → Allow (for alerts you care about).',
      enabled: s.postNotificationsAllowed,
    ),
    LocationPermissionCatalogRow(
      title: 'Physical activity',
      subtitle: 'Better walk / drive / stop detection',
      stepsAndroid:
          '1. Settings → Apps → LiveTrack → Permissions.\n'
          '2. Physical activity → Allow.',
      stepsIos:
          '1. Settings → LiveTrack → Motion & Fitness (if listed) → On.',
      enabled: s.activityRecognitionAllowed,
    ),
  ];
}
