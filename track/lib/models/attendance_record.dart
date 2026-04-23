import 'package:track/utils/date_display_util.dart';

AttendanceGeo? _geoFromJsonOrLatLng(
  dynamic locationMap,
  dynamic lat,
  dynamic lng,
) {
  if (locationMap is Map<String, dynamic>) {
    return AttendanceGeo.fromJson(locationMap);
  }
  if (lat is num && lng is num) {
    return AttendanceGeo(lat: lat.toDouble(), lng: lng.toDouble());
  }
  return null;
}

class AttendanceGeo {
  const AttendanceGeo({
    required this.lat,
    required this.lng,
    this.address,
    this.accuracy,
  });

  final double lat;
  final double lng;
  final String? address;
  final double? accuracy;

  factory AttendanceGeo.fromJson(Map<String, dynamic> json) {
    return AttendanceGeo(
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0,
      address: json['address']?.toString(),
      accuracy: (json['accuracy'] as num?)?.toDouble(),
    );
  }
}

class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    this.attendanceDate,
    required this.checkInTime,
    this.checkOutTime,
    this.checkInImageUrl,
    this.checkOutImageUrl,
    this.checkInLocation,
    this.checkOutLocation,
    required this.durationMinutes,
    required this.status,
    this.method,
    this.minutesWorked,
    this.note,
    this.leaveKind,
    this.lateFlag,
    this.earlyExitFlag,
    this.shiftId,
    this.shiftName,
    this.shiftStartTime,
    this.shiftEndTime,
    this.dayStatus,
    this.source,
  });

  final String id;
  /// Server-normalized calendar day for this shift (same row as check-in/out).
  final DateTime? attendanceDate;
  final DateTime checkInTime;
  final DateTime? checkOutTime;
  final String? checkInImageUrl;
  final String? checkOutImageUrl;
  final AttendanceGeo? checkInLocation;
  final AttendanceGeo? checkOutLocation;
  final int durationMinutes;
  final String status;
  /// `manual` | `geo` | `auto` (web/admin rows).
  final String? method;
  final int? minutesWorked;
  final String? note;
  final String? leaveKind;
  final bool? lateFlag;
  final bool? earlyExitFlag;
  final String? shiftId;
  final String? shiftName;
  final String? shiftStartTime;
  final String? shiftEndTime;
  final String? dayStatus;
  final String? source;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    final checkIn = DateDisplayUtil.parseFromApiAsLocal(json['checkInTime']) ??
        DateDisplayUtil.parseFromApiAsLocal(json['checkInAt']);
    final checkOut = DateDisplayUtil.parseFromApiAsLocal(json['checkOutTime']) ??
        DateDisplayUtil.parseFromApiAsLocal(json['checkOutAt']);
    final duration =
        (json['duration'] as num?)?.round() ?? (json['minutesWorked'] as num?)?.round() ?? 0;
    return AttendanceRecord(
      id: json['_id']?.toString() ?? '',
      attendanceDate: DateDisplayUtil.parseFromApiAsLocal(json['attendanceDate']),
      checkInTime: checkIn ?? DateTime.now(),
      checkOutTime: checkOut,
      checkInImageUrl: json['checkInImageUrl']?.toString(),
      checkOutImageUrl: json['checkOutImageUrl']?.toString(),
      checkInLocation: _geoFromJsonOrLatLng(
        json['checkInLocation'],
        json['checkInLat'],
        json['checkInLng'],
      ),
      checkOutLocation: _geoFromJsonOrLatLng(
        json['checkOutLocation'],
        json['checkOutLat'],
        json['checkOutLng'],
      ),
      durationMinutes: duration,
      status: json['status']?.toString() ??
          json['dayStatus']?.toString() ??
          'PENDING',
      method: json['method']?.toString(),
      minutesWorked: (json['minutesWorked'] as num?)?.round(),
      note: json['note']?.toString(),
      leaveKind: json['leaveKind']?.toString(),
      lateFlag: json['lateFlag'] is bool ? json['lateFlag'] as bool : null,
      earlyExitFlag: json['earlyExitFlag'] is bool ? json['earlyExitFlag'] as bool : null,
      shiftId: json['shiftId']?.toString(),
      shiftName: json['shiftName']?.toString(),
      shiftStartTime: json['shiftStartTime']?.toString(),
      shiftEndTime: json['shiftEndTime']?.toString(),
      dayStatus: json['dayStatus']?.toString(),
      source: json['source']?.toString(),
    );
  }
}

class LeaveRequestRecord {
  const LeaveRequestRecord({
    required this.id,
    required this.leaveType,
    required this.fromDate,
    required this.toDate,
    required this.reason,
    required this.status,
  });

  final String id;
  final String leaveType;
  final DateTime fromDate;
  final DateTime toDate;
  final String reason;
  final String status;

  factory LeaveRequestRecord.fromJson(Map<String, dynamic> json) {
    final fromRaw = json['startDate'] ?? json['fromDate'];
    final toRaw = json['endDate'] ?? json['toDate'] ?? fromRaw;
    return LeaveRequestRecord(
      id: json['_id']?.toString() ?? '',
      leaveType: json['leaveType']?.toString() ?? '',
      fromDate: DateDisplayUtil.parseFromApiAsLocal(fromRaw) ??
          DateTime.now(),
      toDate: DateDisplayUtil.parseFromApiAsLocal(toRaw) ??
          DateTime.now(),
      reason: json['reason']?.toString() ?? '',
      status: json['status']?.toString() ?? 'PENDING',
    );
  }
}
