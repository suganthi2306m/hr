import 'dart:async';
import 'dart:io';
import 'dart:ui';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/widgets.dart';

import 'alarm_service.dart';
import 'attendance_alarm_log.dart';
import 'attendance_alarm_punch_state.dart';

const Duration _kAlarmRingDuration = Duration(seconds: 20);

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
    );
    await notifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            AlarmService.alarmChannelId,
            'Alarms',
            description: 'Attendance reminders',
            importance: Importance.max,
            playSound: false,
            enableVibration: true,
          ),
        );
  }

  final player = AudioPlayer();
  try {
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
        playSound: false,
        enableVibration: true,
        showWhen: true,
        when: ringStartedMs,
        usesChronometer: true,
        visibility: NotificationVisibility.public,
        subText: isCheckout ? 'Check-out' : 'Check-in',
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
        );
        attendanceAlarmLog('RING notification shown id=$id');
      } catch (e, st) {
        attendanceAlarmLog('RING notification FAILED id=$id err=$e st=$st');
      }
    }
    await player.play(AssetSource('audio/alarm.wav'));
    attendanceAlarmLog('RING audio playing ${_kAlarmRingDuration.inSeconds}s id=$id');
    await Future<void>.delayed(_kAlarmRingDuration);
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
    attendanceAlarmLog('RING dispose id=$id');
  }
}
