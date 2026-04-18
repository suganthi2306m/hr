import 'package:track/utils/date_display_util.dart';

/// Company site visit (smart visit / manual), from `GET /api/company-visits`.
class CompanyVisitRecord {
  const CompanyVisitRecord({
    required this.id,
    required this.customerId,
    required this.companyName,
    required this.customerName,
    required this.checkInTime,
    required this.checkInLatitude,
    required this.checkInLongitude,
    required this.visitDate,
    this.checkOutTime,
    this.checkOutLatitude,
    this.checkOutLongitude,
    this.durationMinutes,
    required this.status,
    this.source,
    this.siteAddress,
    this.staffUserId,
  });

  final String id;
  final String customerId;
  final String companyName;
  final String customerName;
  final DateTime checkInTime;
  final double checkInLatitude;
  final double checkInLongitude;
  final DateTime visitDate;
  final DateTime? checkOutTime;
  final double? checkOutLatitude;
  final double? checkOutLongitude;
  final int? durationMinutes;
  final String status;
  final String? source;
  /// Customer site address (from API: joined address/city/state/pincode).
  final String? siteAddress;

  /// Staff user who performed the visit (when API includes populated `userId`).
  final String? staffUserId;

  bool get isOpen => status.toLowerCase() == 'open';

  factory CompanyVisitRecord.fromJson(Map<String, dynamic> json) {
    double? parseDbl(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString());
    }

    String parseIdField(dynamic v) {
      if (v == null) return '';
      if (v is Map && v['_id'] != null) return v['_id'].toString();
      return v.toString();
    }

    String? staffId;
    final rawUser = json['userId'];
    if (rawUser is Map && rawUser['_id'] != null) {
      staffId = rawUser['_id'].toString();
    } else if (rawUser != null && rawUser.toString().trim().isNotEmpty) {
      staffId = rawUser.toString();
    }

    return CompanyVisitRecord(
      id: json['_id']?.toString() ?? '',
      customerId: parseIdField(json['customerId']),
      companyName: json['companyName']?.toString() ?? '—',
      customerName: json['customerName']?.toString() ?? '',
      checkInTime:
          DateDisplayUtil.parseFromApiAsLocal(json['checkInTime']) ?? DateTime.now(),
      checkInLatitude: parseDbl(json['checkInLatitude']) ?? 0,
      checkInLongitude: parseDbl(json['checkInLongitude']) ?? 0,
      visitDate:
          DateDisplayUtil.parseFromApiAsLocal(json['visitDate']) ?? DateTime.now(),
      checkOutTime: DateDisplayUtil.parseFromApiAsLocal(json['checkOutTime']),
      checkOutLatitude: parseDbl(json['checkOutLatitude']),
      checkOutLongitude: parseDbl(json['checkOutLongitude']),
      durationMinutes: (json['durationMinutes'] as num?)?.round(),
      status: json['status']?.toString() ?? 'open',
      source: json['source']?.toString(),
      siteAddress: () {
        final s = json['siteAddress']?.toString().trim();
        return (s == null || s.isEmpty) ? null : s;
      }(),
      staffUserId: staffId,
    );
  }
}
