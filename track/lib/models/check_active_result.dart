/// Result of [AuthService.checkUserActiveDetailed].
class CheckActiveResult {
  CheckActiveResult({this.active, this.reason, this.message});

  final bool? active;
  final String? reason;
  final String? message;

  bool get shouldLogout => active == false;

  /// Server sent a human-readable [message] for this logout (e.g. subscription / trial).
  bool get hasUserFacingMessage =>
      shouldLogout && message != null && message!.trim().isNotEmpty;
}
