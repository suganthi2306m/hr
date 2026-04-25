import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'alarm_service.dart';
import 'attendance_alarm_log.dart';
import 'attendance_alarm_punch_state.dart';

const Duration _kAlarmRingDuration = Duration(seconds: 20);
const String _kAlarmAssetPath = 'audio/alarm.wav';
const String _kAlarmStopActionId = 'attendance_alarm_stop';
const String _kAlarmStopPrefsPrefix = 'attendance_alarm_stop_';
const String _kAlarmStopAllPrefsKey = 'attendance_alarm_stop_all';

String _stopPrefKey(int id) => '$_kAlarmStopPrefsPrefix$id';

Future<void> _setStoppedByUser(int id) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_stopPrefKey(id), true);
}

Future<void> _setStopAllByUser() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_kAlarmStopAllPrefsKey, true);
}

Future<bool> _isStoppedByUser(int id) async {
  final prefs = await SharedPreferences.getInstance();
  // Stop action can be handled in another isolate; reload to avoid stale in-memory cache.
  await prefs.reload();
  return prefs.getBool(_stopPrefKey(id)) == true ||
      prefs.getBool(_kAlarmStopAllPrefsKey) == true;
}

Future<bool> _isAlarmNotificationStillVisible(
  FlutterLocalNotificationsPlugin notifications,
  int id,
) async {
  if (!Platform.isAndroid) return true;
  try {
    final active = await notifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.getActiveNotifications();
    if (active == null) return true;
    return active.any((n) => n.id == id);
  } catch (e) {
    // If platform does not expose active notifications on this device/API, do not block ringing.
    attendanceAlarmLog('RING activeNotifications check failed id=$id err=$e');
    return true;
  }
}

Future<void> _clearStoppedByUser(int id) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove(_stopPrefKey(id));
  await prefs.remove(_kAlarmStopAllPrefsKey);
}

@pragma('vm:entry-point')
void attendanceAlarmNotificationTapBackground(NotificationResponse response) {
  scheduleMicrotask(() async {
    try {
      final actionId = response.actionId;
      final id = response.id ?? -1;
      attendanceAlarmLog('RING notification action received actionId=$actionId id=$id');
      var isAlarmStop = actionId == _kAlarmStopActionId;
      if (!isAlarmStop) {
        try {
          final payload = response.payload;
          if (payload != null && payload.isNotEmpty) {
            final map = jsonDecode(payload) as Map<String, dynamic>;
            if (map['kind'] == 'attendance_alarm_ring') isAlarmStop = true;
          }
        } catch (_) {}
      }
      if (isAlarmStop) {
        await _setStopAllByUser();
      }
      if (isAlarmStop && id >= 0) {
        await _setStoppedByUser(id);
        await FlutterLocalNotificationsPlugin().cancel(id);
        attendanceAlarmLog('RING stop action tapped id=$id');
      } else if (isAlarmStop) {
        attendanceAlarmLog('RING stop action tapped without id');
      }
    } catch (e) {
      attendanceAlarmLog('RING stop action handler failed: $e');
    }
  });
}

Future<void> _playAlarmWithFallback(AudioPlayer player, int id) async {
  Object? lastError;
  // The background alarm isolate occasionally fails AssetSource with MEDIA_ERROR_UNKNOWN(-38).
  // Retry, then fallback to BytesSource loaded from the asset bundle.
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      await player.play(AssetSource(_kAlarmAssetPath));
      attendanceAlarmLog('RING asset play OK id=$id attempt=$attempt');
      return;
    } catch (e) {
      lastError = e;
      attendanceAlarmLog('RING asset play failed id=$id attempt=$attempt err=$e');
      await Future<void>.delayed(const Duration(milliseconds: 140));
    }
  }

  try {
    final data = await rootBundle.load('assets/$_kAlarmAssetPath');
    await player.play(BytesSource(data.buffer.asUint8List()));
    attendanceAlarmLog('RING bytes play OK id=$id');
    return;
  } catch (e) {
    lastError = e;
    attendanceAlarmLog('RING bytes play failed id=$id err=$e');
  }

  if (lastError != null) {
    throw lastError;
  }
  throw StateError('Alarm play failed without explicit error.');
}

/// Entry point for [AndroidAlarmManager] — must be top-level for
/// [PluginUtilities.getCallbackFromHandle].
///
/// Runs in the alarm manager background isolate: optional skip from prefs,
/// heads-up notification, then loops alarm audio for [_kAlarmRingDuration].
@pragma('vm:entry-point')
void attendanceAlarmRingCallback(int id, Map<String, dynamic> params) {
  attendanceAlarmLog('RING fired (sync) id=$id params=$params');
  scheduleMicrotask(() {
    unawaited(_attendanceAlarmRingAsync(id, params));
  });
}

Future<void> _attendanceAlarmRingAsync(int id, Map<String, dynamic> params) async {
  attendanceAlarmLog('RING async start id=$id');
  WidgetsFlutterBinding.ensureInitialized();
  // AlarmManager runs a separate engine without GeneratedPluginRegistrant — without this,
  // audioplayers / local notifications often fail when the app is killed or only in background.
  DartPluginRegistrant.ensureInitialized();

  final kind = (params['kind'] ?? 'checkin').toString();
  final alarmYmd = (params['alarmYmd'] ?? AttendanceAlarmPunchState.ymdFromDate(DateTime.now()))
      .toString();

  if (await AttendanceAlarmPunchState.shouldSkipRing(alarmYmd: alarmYmd, kind: kind)) {
    attendanceAlarmLog('RING SKIP id=$id kind=$kind ymd=$alarmYmd (already punched or no check-in)');
    return;
  }

  final isCheckout = kind == 'checkout';
  const brand = 'LiveTrack';
  final title = isCheckout ? '$brand — Check-out' : '$brand — Check-in';
  final body = isCheckout
      ? 'Attendance check-out alarm — stays on screen for ${_kAlarmRingDuration.inSeconds}s while ringing.'
      : 'Attendance check-in alarm — stays on screen for ${_kAlarmRingDuration.inSeconds}s while ringing.';

  final notifications = FlutterLocalNotificationsPlugin();
  if (Platform.isAndroid) {
    const androidInit = AndroidInitializationSettings('@drawable/ic_notification');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
    );
    await notifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveBackgroundNotificationResponse:
          attendanceAlarmNotificationTapBackground,
      onDidReceiveNotificationResponse: (response) {
        if (response.actionId == _kAlarmStopActionId && (response.id ?? -1) >= 0) {
          unawaited(_setStoppedByUser(response.id!));
        }
      },
    );
    await AlarmService.ensureAlarmChannel(notifications);
  }

  final player = AudioPlayer();
  try {
    await _clearStoppedByUser(id);
    await player.setAudioContext(
      AudioContext(
        android: AudioContextAndroid(
          isSpeakerphoneOn: true,
          stayAwake: true,
          contentType: AndroidContentType.sonification,
          usageType: AndroidUsageType.alarm,
        ),
      ),
    );
    await player.setVolume(1.0);
    await player.setReleaseMode(ReleaseMode.loop);
    attendanceAlarmLog('RING play asset id=$id');
    if (Platform.isAndroid) {
      final ringStartedMs = DateTime.now().millisecondsSinceEpoch;
      final androidDetails = AndroidNotificationDetails(
        AlarmService.alarmChannelId,
        'Alarms',
        channelDescription: 'Attendance reminders',
        importance: Importance.max,
        priority: Priority.max,
        icon: '@drawable/ic_notification',
        category: AndroidNotificationCategory.alarm,
        fullScreenIntent: true,
        ongoing: true,
        autoCancel: false,
        onlyAlertOnce: false,
        playSound: true,
        enableVibration: true,
        showWhen: true,
        when: ringStartedMs,
        usesChronometer: true,
        visibility: NotificationVisibility.public,
        subText: isCheckout ? 'Check-out' : 'Check-in',
        audioAttributesUsage: AudioAttributesUsage.alarm,
        actions: <AndroidNotificationAction>[
          AndroidNotificationAction(
            _kAlarmStopActionId,
            'Stop',
            cancelNotification: true,
            showsUserInterface: false,
          ),
        ],
      );
      const iosDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: false,
        presentSound: false,
      );
      try {
        await notifications.show(
          id,
          title,
          body,
          NotificationDetails(android: androidDetails, iOS: iosDetails),
          payload: jsonEncode(<String, dynamic>{
            'kind': 'attendance_alarm_ring',
            'alarmId': id,
          }),
        );
        attendanceAlarmLog('RING notification shown id=$id');
      } catch (e, st) {
        attendanceAlarmLog('RING notification FAILED id=$id err=$e st=$st');
      }
    }
    await _playAlarmWithFallback(player, id);
    attendanceAlarmLog('RING audio playing ${_kAlarmRingDuration.inSeconds}s id=$id');
    final deadline = DateTime.now().add(_kAlarmRingDuration);
    while (DateTime.now().isBefore(deadline)) {
      if (await _isStoppedByUser(id)) {
        attendanceAlarmLog('RING stopped by user action id=$id');
        break;
      }
      final stillVisible = await _isAlarmNotificationStillVisible(notifications, id);
      if (!stillVisible) {
        attendanceAlarmLog('RING stopped because notification dismissed id=$id');
        break;
      }
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    await player.stop();
    attendanceAlarmLog('RING finished id=$id');
  } catch (e, st) {
    attendanceAlarmLog('RING ERROR id=$id err=$e st=$st');
  } finally {
    await player.dispose();
    if (Platform.isAndroid) {
      try {
        await notifications.cancel(id);
      } catch (_) {}
    }
    await _clearStoppedByUser(id);
    attendanceAlarmLog('RING dispose id=$id');
  }
}
