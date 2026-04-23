class LeadFollowUp {
  final String id;
  final String note;
  final String actionType;
  final DateTime? nextFollowUpAt;
  final String? statusAfter;
  final DateTime? createdAt;

  LeadFollowUp({
    required this.id,
    required this.note,
    required this.actionType,
    this.nextFollowUpAt,
    this.statusAfter,
    this.createdAt,
  });

  factory LeadFollowUp.fromJson(Map<String, dynamic> json) {
    return LeadFollowUp(
      id: (json['_id'] ?? '').toString(),
      note: (json['note'] ?? '').toString(),
      actionType: (json['actionType'] ?? 'call').toString(),
      nextFollowUpAt: json['nextFollowUpAt'] != null ? DateTime.tryParse(json['nextFollowUpAt'].toString()) : null,
      statusAfter: json['statusAfter']?.toString(),
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
    );
  }
}

class LeadItem {
  final String id;
  final String leadName;
  final String companyName;
  final String emailId;
  final String phoneNumber;
  final String status;
  final String source;
  final String assignedToName;
  final String addressText;
  final double? lat;
  final double? lng;
  final List<LeadFollowUp> followUps;

  LeadItem({
    required this.id,
    required this.leadName,
    required this.companyName,
    required this.emailId,
    required this.phoneNumber,
    required this.status,
    required this.source,
    required this.assignedToName,
    required this.addressText,
    this.lat,
    this.lng,
    required this.followUps,
  });

  factory LeadItem.fromJson(Map<String, dynamic> json) {
    final address = json['address'] is Map<String, dynamic> ? json['address'] as Map<String, dynamic> : <String, dynamic>{};
    final assigned = json['assignedTo'] is Map<String, dynamic> ? json['assignedTo'] as Map<String, dynamic> : <String, dynamic>{};
    final followList = json['followUps'] is List ? json['followUps'] as List : const [];
    return LeadItem(
      id: (json['_id'] ?? '').toString(),
      leadName: (json['leadName'] ?? '').toString(),
      companyName: (json['companyName'] ?? '').toString(),
      emailId: (json['emailId'] ?? '').toString(),
      phoneNumber: (json['phoneNumber'] ?? '').toString(),
      status: (json['status'] ?? 'new').toString(),
      source: (json['source'] ?? '').toString(),
      assignedToName: (assigned['name'] ?? '').toString(),
      addressText: (address['text'] ?? '').toString(),
      lat: address['lat'] == null ? null : double.tryParse(address['lat'].toString()),
      lng: address['lng'] == null ? null : double.tryParse(address['lng'].toString()),
      followUps: followList.whereType<Map<String, dynamic>>().map(LeadFollowUp.fromJson).toList(),
    );
  }
}

class FollowUpFeedItem {
  final String followUpId;
  final String leadId;
  final String leadName;
  final String companyName;
  final String status;
  final String followUpType;
  final DateTime? nextFollowUpDate;
  final String notes;
  final String notesPreview;
  final String createdByName;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? statusAfter;

  FollowUpFeedItem({
    required this.followUpId,
    required this.leadId,
    required this.leadName,
    required this.companyName,
    required this.status,
    required this.followUpType,
    this.nextFollowUpDate,
    required this.notes,
    required this.notesPreview,
    required this.createdByName,
    this.createdAt,
    this.updatedAt,
    this.statusAfter,
  });

  factory FollowUpFeedItem.fromJson(Map<String, dynamic> json) {
    final createdBy = json['createdBy'] is Map<String, dynamic> ? json['createdBy'] as Map<String, dynamic> : const <String, dynamic>{};
    return FollowUpFeedItem(
      followUpId: (json['followUpId'] ?? '').toString(),
      leadId: (json['leadId'] ?? '').toString(),
      leadName: (json['leadName'] ?? '').toString(),
      companyName: (json['companyName'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      followUpType: (json['followUpType'] ?? '').toString(),
      nextFollowUpDate: json['nextFollowUpDate'] != null ? DateTime.tryParse(json['nextFollowUpDate'].toString()) : null,
      notes: (json['notes'] ?? '').toString(),
      notesPreview: (json['notesPreview'] ?? '').toString(),
      createdByName: (createdBy['name'] ?? createdBy['email'] ?? '').toString(),
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
      updatedAt: json['updatedAt'] != null ? DateTime.tryParse(json['updatedAt'].toString()) : null,
      statusAfter: json['statusAfter']?.toString(),
    );
  }
}
