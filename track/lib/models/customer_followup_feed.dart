class CustomerFollowUpFeedItem {
  final String followUpId;
  final String customerId;
  final String customerName;
  final String companyName;
  final String followUpType;
  final DateTime? nextFollowUpDate;
  final String notes;
  final String notesPreview;
  final String createdByName;
  final DateTime? createdAt;

  CustomerFollowUpFeedItem({
    required this.followUpId,
    required this.customerId,
    required this.customerName,
    required this.companyName,
    required this.followUpType,
    this.nextFollowUpDate,
    required this.notes,
    required this.notesPreview,
    required this.createdByName,
    this.createdAt,
  });

  factory CustomerFollowUpFeedItem.fromJson(Map<String, dynamic> json) {
    final createdBy = json['createdBy'] is Map<String, dynamic>
        ? json['createdBy'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return CustomerFollowUpFeedItem(
      followUpId: (json['followUpId'] ?? '').toString(),
      customerId: (json['customerId'] ?? '').toString(),
      customerName: (json['customerName'] ?? '').toString(),
      companyName: (json['companyName'] ?? '').toString(),
      followUpType: (json['followUpType'] ?? '').toString(),
      nextFollowUpDate:
          json['nextFollowUpDate'] != null ? DateTime.tryParse(json['nextFollowUpDate'].toString()) : null,
      notes: (json['notes'] ?? '').toString(),
      notesPreview: (json['notesPreview'] ?? '').toString(),
      createdByName: (createdBy['name'] ?? createdBy['email'] ?? '').toString(),
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
    );
  }
}
