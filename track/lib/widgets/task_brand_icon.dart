import 'package:flutter/material.dart';

/// Tasks branding: clipboard with check (Material), tints with [color] everywhere.
class TaskBrandIcon extends StatelessWidget {
  final double size;
  final Color color;

  const TaskBrandIcon({
    super.key,
    this.size = 24,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.assignment_turned_in_rounded,
      size: size,
      color: color,
    );
  }
}
