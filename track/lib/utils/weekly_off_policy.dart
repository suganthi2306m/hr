import 'package:track/utils/date_display_util.dart';

/// Matches web `weeklyOff.js` / HRMS `orgSetup.weeklyOff` (per weekday + optional nth week).
const _weekDayKeys = <String>[
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

class WeeklyDayRule {
  const WeeklyDayRule({
    required this.all,
    required this.first,
    required this.second,
    required this.third,
    required this.fourth,
    required this.fifth,
  });

  factory WeeklyDayRule.empty() => const WeeklyDayRule(
        all: false,
        first: false,
        second: false,
        third: false,
        fourth: false,
        fifth: false,
      );

  factory WeeklyDayRule.fromJson(Map<String, dynamic>? json) {
    if (json == null) return WeeklyDayRule.empty();
    return WeeklyDayRule(
      all: json['all'] == true,
      first: json['first'] == true,
      second: json['second'] == true,
      third: json['third'] == true,
      fourth: json['fourth'] == true,
      fifth: json['fifth'] == true,
    );
  }

  final bool all;
  final bool first;
  final bool second;
  final bool third;
  final bool fourth;
  final bool fifth;

  bool matchesNthWeekInMonth(int occurrenceZeroBased) {
    if (all) return true;
    switch (occurrenceZeroBased) {
      case 0:
        return first;
      case 1:
        return second;
      case 2:
        return third;
      case 3:
        return fourth;
      case 4:
        return fifth;
      default:
        return false;
    }
  }
}

/// Company weekly-off rules + legacy `weekOffWeekdays` (Dart: Mon=1 … Sun=7).
class WeeklyOffPolicy {
  WeeklyOffPolicy._({
    required Map<String, WeeklyDayRule> days,
    required Set<int> fallbackDartWeekdays,
  })  : _days = days,
        _fallbackDartWeekdays = fallbackDartWeekdays;

  factory WeeklyOffPolicy.fallbackSatSun() => WeeklyOffPolicy._(
        days: {for (final k in _weekDayKeys) k: WeeklyDayRule.empty()},
        fallbackDartWeekdays: {DateTime.saturday, DateTime.sunday},
      );

  /// Builds from `GET /attendance/shift-meta` `data` map.
  factory WeeklyOffPolicy.fromShiftMeta(Map<String, dynamic>? meta) {
    final raw = meta?['weeklyOff'];
    final days = _normalizeWeeklyOffDays(raw);
    final list = (meta?['weekOffWeekdays'] as List?)
            ?.map((e) => int.tryParse(e.toString()))
            .whereType<int>()
            .toList() ??
        const <int>[];
    final fb = list.isEmpty ? <int>{DateTime.saturday, DateTime.sunday} : list.toSet();
    return WeeklyOffPolicy._(days: days, fallbackDartWeekdays: fb);
  }

  final Map<String, WeeklyDayRule> _days;
  final Set<int> _fallbackDartWeekdays;

  bool get hasRules => _weekDayKeys.any((k) {
        final d = _days[k] ?? WeeklyDayRule.empty();
        return d.all ||
            d.first ||
            d.second ||
            d.third ||
            d.fourth ||
            d.fifth;
      });

  /// Calendar day in **local** timezone (date-only recommended).
  bool isWeeklyOff(DateTime d) {
    final date = DateDisplayUtil.dateOnlyLocal(d);
    if (hasRules) {
      final key = _weekDayKeys[date.weekday - 1];
      final rule = _days[key] ?? WeeklyDayRule.empty();
      final occurrence = (date.day - 1) ~/ 7;
      return rule.matchesNthWeekInMonth(occurrence);
    }
    return _fallbackDartWeekdays.contains(date.weekday);
  }

  static Map<String, WeeklyDayRule> _normalizeWeeklyOffDays(dynamic raw) {
    final out = <String, WeeklyDayRule>{
      for (final k in _weekDayKeys) k: WeeklyDayRule.empty(),
    };
    if (raw == null) return out;
    if (raw is String) {
      final key = raw.trim().toLowerCase();
      if (_weekDayKeys.contains(key)) {
        out[key] = const WeeklyDayRule(
          all: true,
          first: false,
          second: false,
          third: false,
          fourth: false,
          fifth: false,
        );
      }
      return out;
    }
    if (raw is! Map) return out;
    final srcDays = raw['days'];
    if (srcDays is! Map) return out;
    for (final k in _weekDayKeys) {
      final v = srcDays[k];
      if (v is Map<String, dynamic>) {
        out[k] = WeeklyDayRule.fromJson(v);
      } else if (v is Map) {
        out[k] = WeeklyDayRule.fromJson(Map<String, dynamic>.from(v));
      }
    }
    return out;
  }
}
