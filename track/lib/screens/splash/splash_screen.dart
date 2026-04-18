// hrms/lib/screens/splash/splash_screen.dart
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../config/app_colors.dart';
import '../../services/geo/live_tracking_service.dart';
import '../../services/auth_service.dart';
import '../auth/login_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../geo/live_tracking_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  Color _primaryColor = AppColors.primary;
  bool _isLoadingTheme = true;

  @override
  void initState() {
    super.initState();
    _loadThemeColor();
    _checkAuth();
  }

  Future<void> _loadThemeColor() async {
    final prefs = await SharedPreferences.getInstance();
    final colorValue = prefs.getInt('theme_color');

    if (mounted) {
      setState(() {
        if (colorValue != null) {
          _primaryColor = Color(colorValue);
          AppColors.updateTheme(_primaryColor);
        } else {
          _primaryColor = AppColors.primary;
        }
        _isLoadingTheme = false;
      });
    }
  }

  Future<void> _checkAuth() async {
    // Wait for theme to load
    while (_isLoadingTheme) {
      await Future.delayed(const Duration(milliseconds: 100));
    }

    // Simulate a short loading time for branding or initialization
    await Future.delayed(const Duration(seconds: 2));

    final prefs = await SharedPreferences.getInstance();
    final sessionReset = await AuthService().clearSessionIfBaseUrlChanged();
    final token = prefs.getString('token');

    if (!mounted) return;

    if (sessionReset) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
      return;
    }

    if (token != null && token.isNotEmpty) {
      final activeInfo = await LiveTrackingService().getActiveTaskInfo();
      if (activeInfo != null && mounted) {
        // If user tapped "Stop tracking" in notification, native tracking stopped but we had stale state.
        // Sync: clear LiveTrackingService and go to dashboard.
        // Retry: on cold start the native plugin often returns false until initialized — don't wipe prefs.
        final isTracking =
            await LiveTrackingService().isBackgroundLocationTrackingRunningWithRetry();
        if (!isTracking) {
          await LiveTrackingService().stopTracking();
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const DashboardScreen()),
          );
          return;
        }
        // Live tracking in progress – go directly to LiveTrackingScreen (no resume prompt)
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => LiveTrackingScreen(
              taskId: activeInfo['taskId'] as String,
              taskMongoId: activeInfo['taskMongoId'] as String,
              pickupLocation: LatLng(
                activeInfo['pickupLat'] as double,
                activeInfo['pickupLng'] as double,
              ),
              dropoffLocation: LatLng(
                activeInfo['dropoffLat'] as double,
                activeInfo['dropoffLng'] as double,
              ),
              task: null,
            ),
          ),
        );
        return;
      }
      // User is logged in, navigate to Dashboard
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const DashboardScreen()));
    } else {
      // User is not logged in, navigate to Login
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _primaryColor,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final compact = constraints.maxHeight < 260;
            final logoBox = compact ? 72.0 : 100.0;
            final iconPadding = compact ? 10.0 : 16.0;
            final titleSize = compact ? 22.0 : 32.0;
            final titleSpacing = compact ? 12.0 : 24.0;
            final loaderSpacing = compact ? 20.0 : 48.0;

            return Center(
              child: SingleChildScrollView(
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight,
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: EdgeInsets.all(iconPadding),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.22),
                            shape: BoxShape.circle,
                          ),
                          child: ClipOval(
                            child: SizedBox(
                              width: logoBox,
                              height: logoBox,
                              child: Image.asset(
                                'assets/logo.png',
                                fit: BoxFit.contain,
                              ),
                            ),
                          ),
                        ),
                        SizedBox(height: titleSpacing),
                        Text.rich(
                          TextSpan(
                            style: TextStyle(
                              fontSize: titleSize,
                              fontWeight: FontWeight.bold,
                              letterSpacing: compact ? 1.2 : 2,
                            ),
                            children: const [
                              TextSpan(
                                text: 'Live',
                                style: TextStyle(color: Colors.white),
                              ),
                              TextSpan(
                                text: 'Track',
                                style: TextStyle(color: Colors.black),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: loaderSpacing),
                        SizedBox(
                          width: compact ? 36 : 44,
                          height: compact ? 36 : 44,
                          child: CircularProgressIndicator(
                            strokeWidth: 3,
                            valueColor: const AlwaysStoppedAnimation<Color>(
                              Colors.white,
                            ),
                            backgroundColor: Colors.black.withValues(
                              alpha: 0.12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
