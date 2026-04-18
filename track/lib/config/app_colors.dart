import 'package:flutter/material.dart';

/// Use [Theme.of(context).colorScheme] for theme-aware surface, background, text.
/// Use [AppColors] for primary (from ThemeProvider) and semantic status colors.
class AppColors {
  static Color primary = const Color(0xFFF2D04A);
  static Color primaryDark = const Color(0xFFD3B63C);
  static Color primaryLight = const Color(0xFFF6E08E);

  static const Color accent = Color(0xFFFFA000);
  static Color secondary = const Color(0xFFF2D04A);
  static Color text = const Color(0xFF263238);

  /// Theme-aware: updated by ThemeProvider when light/dark mode changes.
  static Color background = Colors.white;
  static Color surface = Colors.white;
  static Color textPrimary = const Color(0xFF263238);
  static Color textSecondary = const Color(0xFF78909C);
  static Color divider = const Color(0xFFECEFF1);

  static const Color success = Color(0xFF43A047);
  static const Color warning = Color(0xFFFFB300);
  static const Color error = Color(0xFFE53935);
  static const Color info = Color(0xFF039BE5);

  static void updateTheme(Color color) {
    primary = color;
    primaryDark = _getDarkerColor(color);
    primaryLight = color.withValues(alpha: 0.5);
    secondary = color;
  }

  /// Called by ThemeProvider when theme mode changes.
  /// Keeps light colors even in dark mode so all screens remain visible.
  static void updateForBrightness(bool isDark) {
    background = Colors.white;
    surface = Colors.white;
    textPrimary = const Color(0xFF263238);
    textSecondary = const Color(0xFF78909C);
    divider = const Color(0xFFECEFF1);
  }

  static Color _getDarkerColor(Color color) {
    final hsl = HSLColor.fromColor(color);
    return hsl.withLightness((hsl.lightness - 0.1).clamp(0.0, 1.0)).toColor();
  }
}

/// Theme-aware colors from current theme. Use in build methods.
extension ThemeColors on BuildContext {
  ColorScheme get colorScheme => Theme.of(this).colorScheme;
  ThemeData get theme => Theme.of(this);
}
