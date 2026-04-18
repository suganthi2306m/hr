import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import 'dart:async';

class SnackBarUtils {
  static OverlayEntry? _currentEntry;
  static Timer? _timer;

  /// [duration] optional; if null, defaults to 3 seconds.
  static void showSnackBar(
    BuildContext context,
    String message, {
    Color? backgroundColor,
    bool isError = false,
    Duration? duration,
    String? subtitle,
    IconData? leadingIcon,
    /// White card, black text/border/icon (e.g. auto visit check-in/out).
    bool lightCard = false,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    // Attempt to find the top-level overlay
    final overlay = Navigator.of(context, rootNavigator: true).overlay;
    if (overlay == null) return;

    // Remove existing snackbar immediately
    _removeCurrentSnackBarSync();

    _currentEntry = OverlayEntry(
      builder: (context) => _TopSnackBarWidget(
        message: message,
        subtitle: subtitle,
        leadingIcon: leadingIcon,
        backgroundColor: isError
            ? const Color(0xFF9CA3AF) // light grey for failure
            : (backgroundColor ?? AppColors.primary), // primary for success
        isError: isError,
        lightCard: lightCard,
        actionLabel: actionLabel,
        onAction: onAction,
        onDismissed: () => _removeCurrentSnackBarSync(),
      ),
    );

    overlay.insert(_currentEntry!);

    final effectiveDuration = duration ??
        ((actionLabel != null && onAction != null)
            ? const Duration(seconds: 5)
            : const Duration(milliseconds: 3000));
    _timer = Timer(effectiveDuration, () {
      _removeCurrentSnackBarSync();
    });
  }

  /// Dismisses the currently shown snackbar (e.g. when location is captured).
  static void dismiss() => _removeCurrentSnackBarSync();

  static void _removeCurrentSnackBarSync() {
    _timer?.cancel();
    _timer = null;
    if (_currentEntry != null) {
      try {
        if (_currentEntry!.mounted) {
          _currentEntry?.remove();
        }
      } catch (e) {
        // Already removed or other issue
      }
      _currentEntry = null;
    }
  }
}

class _TopSnackBarWidget extends StatefulWidget {
  final String message;
  final String? subtitle;
  final IconData? leadingIcon;
  final Color backgroundColor;
  final bool isError;
  final bool lightCard;
  final String? actionLabel;
  final VoidCallback? onAction;
  final VoidCallback onDismissed;

  const _TopSnackBarWidget({
    required this.message,
    this.subtitle,
    this.leadingIcon,
    required this.backgroundColor,
    required this.isError,
    this.lightCard = false,
    this.actionLabel,
    this.onAction,
    required this.onDismissed,
  });

  @override
  State<_TopSnackBarWidget> createState() => _TopSnackBarWidgetState();
}

class _TopSnackBarWidgetState extends State<_TopSnackBarWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _offsetAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );

    _offsetAnimation = Tween<Offset>(
      begin: const Offset(0.0, -1.2),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.elasticOut));

    _opacityAnimation = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.of(context).padding.top + 12,
      left: 16,
      right: 16,
      child: Material(
        color: Colors.transparent,
        child: FadeTransition(
          opacity: _opacityAnimation,
          child: SlideTransition(
            position: _offsetAnimation,
            child: Dismissible(
              key: UniqueKey(),
              direction: DismissDirection.up,
              onDismissed: (_) => widget.onDismissed(),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 16,
                ),
                decoration: widget.lightCard
                    ? BoxDecoration(
                        color: Colors.white,
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(22),
                          bottom: Radius.circular(16),
                        ),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x33000000),
                            blurRadius: 18,
                            offset: Offset(0, 6),
                          ),
                        ],
                        border: Border.all(color: Colors.black, width: 1.5),
                      )
                    : BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            widget.backgroundColor,
                            widget.backgroundColor.withOpacity(0.85),
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: widget.backgroundColor.withOpacity(0.4),
                            blurRadius: 20,
                            offset: const Offset(0, 10),
                          ),
                        ],
                        border: Border.all(
                          color: Colors.white.withOpacity(0.2),
                          width: 1.5,
                        ),
                      ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: widget.lightCard
                            ? const Color(0xFFF0F0F0)
                            : Colors.white.withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        widget.leadingIcon ??
                            (widget.isError
                                ? Icons.error_outline
                                : (widget.message.toLowerCase().contains('waiting')
                                      ? Icons.timer_outlined
                                      : Icons.check_circle_outline)),
                        color: widget.lightCard
                            ? Colors.black
                            : (widget.isError ? const Color(0xFF374151) : Colors.white),
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            widget.message,
                            textAlign: TextAlign.left,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: widget.lightCard
                                  ? Colors.black
                                  : (widget.isError ? const Color(0xFF374151) : Colors.white),
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                              letterSpacing: 0.1,
                            ),
                          ),
                          if (widget.subtitle != null && widget.subtitle!.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              widget.subtitle!,
                              textAlign: TextAlign.left,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: widget.lightCard
                                    ? Colors.black
                                    : (widget.isError ? const Color(0xFF374151) : Colors.white)
                                        .withOpacity(0.92),
                                fontWeight: FontWeight.w500,
                                fontSize: 12,
                                letterSpacing: 0.05,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (widget.actionLabel != null &&
                        widget.actionLabel!.isNotEmpty &&
                        widget.onAction != null) ...[
                      const SizedBox(width: 8),
                      TextButton(
                        onPressed: () {
                          widget.onAction!();
                          widget.onDismissed();
                        },
                        style: TextButton.styleFrom(
                          foregroundColor: widget.lightCard
                              ? Colors.black
                              : (widget.isError ? const Color(0xFF111827) : Colors.white),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          widget.actionLabel!,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
