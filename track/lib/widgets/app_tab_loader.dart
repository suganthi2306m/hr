import 'package:flutter/material.dart';

import 'location_loader.dart';

/// Full-screen / tab loading: ring + circle + map pin (see [LocationLoader]).
/// Pass [icon] for task/list screens (e.g. [Icons.assignment_rounded]).
class AppTabLoader extends StatelessWidget {
  const AppTabLoader({super.key, this.icon, this.size = 52});

  final IconData? icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    return LocationLoader(
      size: size,
      icon: icon ?? Icons.location_on_rounded,
    );
  }
}

/// Centered loading block for tab/list screens — always use this (or [AppTabLoader]) instead of ad-hoc spinners.
class AppTabLoadingBody extends StatelessWidget {
  const AppTabLoadingBody({
    super.key,
    this.icon,
    this.message,
  });

  final IconData? icon;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppTabLoader(icon: icon),
          if (message != null && message!.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: scheme.onSurfaceVariant,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
