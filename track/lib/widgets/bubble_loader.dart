import 'package:flutter/material.dart';

import 'location_loader.dart';

/// Legacy name — renders [LocationLoader] with the given brand color.
class BubbleLoader extends StatelessWidget {
  const BubbleLoader({
    super.key,
    required this.primaryColor,
    this.size = 18,
  });

  final Color primaryColor;
  final double size;

  @override
  Widget build(BuildContext context) {
    return LocationLoader(color: primaryColor, size: size);
  }
}
