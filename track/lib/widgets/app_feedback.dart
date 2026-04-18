import 'package:flutter/material.dart';

import 'package:track/utils/error_message_utils.dart';
import 'package:track/utils/snackbar_utils.dart';

/// Top snackbars + friendly errors — prefer this over raw [ScaffoldMessenger] for consistency and weight.
class AppFeedback {
  AppFeedback._();

  static void success(
    BuildContext context,
    String message, {
    Duration? duration,
    String? subtitle,
  }) {
    SnackBarUtils.showSnackBar(
      context,
      message,
      duration: duration,
      subtitle: subtitle,
    );
  }

  static void error(
    BuildContext context,
    Object error, {
    Duration? duration,
    String? subtitle,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    SnackBarUtils.showSnackBar(
      context,
      ErrorMessageUtils.toUserFriendlyMessage(error),
      isError: true,
      duration: duration,
      subtitle: subtitle,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }

  /// Neutral / info (same top treatment, primary styling).
  static void info(
    BuildContext context,
    String message, {
    Duration? duration,
    String? subtitle,
  }) {
    SnackBarUtils.showSnackBar(
      context,
      message,
      duration: duration,
      subtitle: subtitle,
    );
  }
}
