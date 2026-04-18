import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../config/app_colors.dart';

/// Map-style loading: progress ring around a light circle with a dark location icon.
///
/// Use across the app for consistent loading (tabs, geo, lists). [size] is the outer
/// width/height of the widget.
class LocationLoader extends StatelessWidget {
  const LocationLoader({
    super.key,
    this.color,
    this.size = 44,
    this.icon = Icons.location_on_rounded,
    this.iconColor = Colors.black,
    this.circleColor = Colors.white,
    this.showRing = true,
  });

  /// Progress ring color; defaults to [AppColors.primary].
  final Color? color;

  /// Outer width and height.
  final double size;

  final IconData icon;

  /// Pin color inside the inner circle (default black).
  final Color iconColor;

  /// Inner disc behind the pin.
  final Color circleColor;

  /// When false, only the inner circle + icon (no ring). Rare; prefer true.
  final bool showRing;

  @override
  Widget build(BuildContext context) {
    final outer = math.max(size, 20.0);
    final ringColor = color ?? AppColors.primary;
    final stroke = (outer * 0.075).clamp(2.0, 4.5);
    // Inner disc fits inside the ring; keep clamp bounds valid for tiny loaders.
    final maxInner = math.max(10.0, outer - stroke * 2 - 2);
    final innerTarget = outer * 0.5;
    final innerD = innerTarget.clamp(12.0, maxInner);
    final iconSz = (innerD * 0.48).clamp(10.0, 22.0);

    return SizedBox(
      width: outer,
      height: outer,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (showRing)
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.all(stroke * 0.35),
                child: CircularProgressIndicator(
                  strokeWidth: stroke,
                  color: ringColor,
                  backgroundColor: ringColor.withValues(alpha: 0.14),
                ),
              ),
            ),
          Container(
            width: innerD,
            height: innerD,
            decoration: BoxDecoration(
              color: circleColor,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.1),
                  blurRadius: 5,
                  offset: const Offset(0, 1.5),
                ),
              ],
            ),
            alignment: Alignment.center,
            child: Icon(
              icon,
              size: iconSz,
              color: iconColor,
            ),
          ),
        ],
      ),
    );
  }
}
