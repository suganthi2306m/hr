import 'package:flutter/material.dart';

/// Non-dismissible modal with a spinner + message. Use for short async submits
/// (check-in, forms) so the pattern stays one place and tree stays small.
class AppBlockingDialog {
  AppBlockingDialog._();

  static const double _spinner = 28;
  static const double _stroke = 2.5;

  /// Shows the dialog, awaits [action], then always dismisses the dialog when possible.
  static Future<T> run<T>(
    BuildContext context, {
    required String message,
    required Future<T> Function() action,
  }) async {
    if (!context.mounted) {
      return action();
    }
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          content: Row(
            children: [
              const SizedBox(
                width: _spinner,
                height: _spinner,
                child: CircularProgressIndicator(strokeWidth: _stroke),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    try {
      return await action();
    } finally {
      // If [context] is disposed mid-flight, skip pop (dialog may remain until route dies).
      if (context.mounted) {
        final nav = Navigator.of(context, rootNavigator: true);
        if (nav.canPop()) nav.pop();
      }
    }
  }

  /// Close the blocking dialog if it is still on the stack (e.g. after a catch outside [run]).
  static void hideIfOpen(BuildContext context) {
    if (!context.mounted) return;
    final nav = Navigator.of(context, rootNavigator: true);
    if (nav.canPop()) nav.pop();
  }
}
