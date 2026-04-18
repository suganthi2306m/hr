import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'dart:math' as math;
import '../../config/app_colors.dart';
import '../../bloc/auth/auth_bloc.dart';
import '../../utils/snackbar_utils.dart';
import '../../utils/error_message_utils.dart';
import '../../widgets/bubble_loader.dart';
import '../dashboard/dashboard_screen.dart';
import 'forgot_password_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();
  final _otpFocusNode = FocusNode();
  final _formKey = GlobalKey<FormState>();
  final _loginCardKey = GlobalKey();
  final _brandWordKey = GlobalKey();

  bool _isPasswordVisible = false;

  // 2FA state
  bool _show2FAInput = false;
  String _2faEmail = '';
  String _2faPassword = '';
  final _otpController = TextEditingController();
  bool _loginSubmitLocked = false;

  // Success overlay
  bool _showSuccessOverlay = false;
  late AnimationController _successController;
  late Animation<double> _successCheckScale;

  // Button press feedback
  late AnimationController _buttonScaleController;
  late Animation<double> _buttonScale;

  // Riding location pin animation
  late AnimationController _rideController;
  late Animation<double> _rideProgress;
  late Animation<double> _rideScale;
  late Animation<double> _rideGlow;
  late AnimationController _brandController;
  late Animation<double> _brandProgress;
  bool _rideStarted = false;

  @override
  void initState() {
    super.initState();
    _successController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    // App icon: small → larger (scale up animation)
    _successCheckScale = Tween<double>(begin: 0.2, end: 1.15).animate(
      CurvedAnimation(
        parent: _successController,
        curve: const Interval(0.0, 0.55, curve: Curves.easeOutCubic),
      ),
    );
    _buttonScaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    );
    _buttonScale = Tween<double>(begin: 1, end: 0.96).animate(
      CurvedAnimation(parent: _buttonScaleController, curve: Curves.easeInOut),
    );

    _rideController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2500),
    );
    _rideProgress = CurvedAnimation(
      parent: _rideController,
      curve: Curves.easeInOutCubic,
    );
    _rideScale = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 0.8,
          end: 1.2,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 45,
      ),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.2,
          end: 1.55,
        ).chain(CurveTween(curve: Curves.easeInOut)),
        weight: 35,
      ),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 1.55,
          end: 1.45,
        ).chain(CurveTween(curve: Curves.easeOutBack)),
        weight: 20,
      ),
    ]).animate(_rideController);
    _rideGlow = TweenSequence<double>([
      TweenSequenceItem(tween: ConstantTween<double>(0), weight: 78),
      TweenSequenceItem(
        tween: Tween<double>(
          begin: 0,
          end: 1,
        ).chain(CurveTween(curve: Curves.easeOut)),
        weight: 22,
      ),
    ]).animate(_rideController);
    _brandController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1850),
    );
    _brandProgress = CurvedAnimation(
      parent: _brandController,
      curve: Curves.easeInOut,
    );
    _rideController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _brandController.forward(from: 0);
      }
    });

    WidgetsBinding.instance.addPostFrameCallback((_) => _startRideAnimation());
  }

  @override
  void dispose() {
    _successController.dispose();
    _buttonScaleController.dispose();
    _rideController.dispose();
    _brandController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _otpController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
    _otpFocusNode.dispose();
    super.dispose();
  }

  void _startRideAnimation() {
    if (!mounted || _rideStarted) return;
    _rideStarted = true;
    _brandController.value = 0;
    _rideController.forward(from: 0);
  }

  void _handleLogin() {
    if (_loginSubmitLocked) return;
    if (_formKey.currentState!.validate()) {
      setState(() => _loginSubmitLocked = true);
      context.read<AuthBloc>().add(
        AuthLoginRequested(
          _emailController.text.trim(),
          _passwordController.text,
        ),
      );
    }
  }

  void _handleVerifyOTP() {
    final otp = _otpController.text.trim();
    if (otp.length != 6) {
      SnackBarUtils.showSnackBar(
        context,
        'Please enter the 6-digit OTP',
        isError: true,
      );
      return;
    }
    context.read<AuthBloc>().add(
      Auth2FALoginRequested(email: _2faEmail, password: _2faPassword, otp: otp),
    );
  }

  void _handleResendOTP() {
    _otpController.clear();
    context.read<AuthBloc>().add(AuthLoginRequested(_2faEmail, _2faPassword));
  }

  void _playSuccessAndNavigate(BuildContext context) {
    setState(() => _showSuccessOverlay = true);
    _successController.forward(from: 0).then((_) {
      if (!mounted) return;
      Future.delayed(const Duration(milliseconds: 400), () {
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          PageRouteBuilder(
            pageBuilder: (_, __, ___) => const DashboardScreen(),
            transitionDuration: const Duration(milliseconds: 500),
            transitionsBuilder: (_, animation, __, child) {
              return FadeTransition(
                opacity: animation,
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.95, end: 1).animate(
                    CurvedAnimation(
                      parent: animation,
                      curve: Curves.easeOutCubic,
                    ),
                  ),
                  child: child,
                ),
              );
            },
          ),
        );
      });
    });
  }

  void _onAuthStateChanged(BuildContext context, AuthState state) {
    if (state is! AuthLoadInProgress && _loginSubmitLocked) {
      setState(() => _loginSubmitLocked = false);
    }
    if (state is AuthRequires2FA) {
      setState(() {
        _show2FAInput = true;
        _2faEmail = state.email;
        _2faPassword = state.password;
        _otpController.clear();
      });
    } else if (state is AuthLoginSuccess) {
      setState(() => _show2FAInput = false);
      _playSuccessAndNavigate(context);
    } else if (state is AuthFailure) {
      SnackBarUtils.showSnackBar(
        context,
        ErrorMessageUtils.sanitizeForDisplay(
          state.message,
          fallback: 'Login failed',
        ),
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthBloc, AuthState>(
      listener: _onAuthStateChanged,
      builder: (context, state) {
        final isLoading = state is AuthLoadInProgress || _loginSubmitLocked;
        final bottomInset = MediaQuery.of(context).viewInsets.bottom;
        final isKeyboardOpen = bottomInset > 0;
        return Scaffold(
          resizeToAvoidBottomInset: false,
          backgroundColor: AppColors.primary,
          body: GestureDetector(
            onTap: () => FocusScope.of(context).unfocus(),
            child: Stack(
              children: [
                Positioned(
                  top: -80,
                  right: -70,
                  child: Container(
                    width: 210,
                    height: 210,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF9E89C),
                      borderRadius: BorderRadius.circular(120),
                    ),
                  ),
                ),
                Positioned(
                  left: -120,
                  bottom: -100,
                  child: Container(
                    width: 260,
                    height: 260,
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2BF),
                      borderRadius: BorderRadius.circular(160),
                    ),
                  ),
                ),
                SafeArea(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOut,
                    padding: EdgeInsets.only(
                      left: 16,
                      right: 16,
                      top: isKeyboardOpen ? 8 : 22,
                      bottom: 18 + (isKeyboardOpen ? bottomInset * 0.2 : 0),
                    ),
                    child: Center(
                      child: Transform.translate(
                        offset: Offset(
                          0,
                          isKeyboardOpen ? -bottomInset * 0.35 : 0,
                        ),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 430),
                          child: AnimatedSwitcher(
                            duration: const Duration(milliseconds: 220),
                            child: _show2FAInput
                                ? KeyedSubtree(
                                    key: const ValueKey<bool>(true),
                                    child: _build2FACard(
                                      isLoading,
                                      compact: isKeyboardOpen,
                                    ),
                                  )
                                : KeyedSubtree(
                                    key: const ValueKey<bool>(false),
                                    child: _buildLoginCard(
                                      isLoading,
                                      compact: isKeyboardOpen,
                                    ),
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                if (!_show2FAInput)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: _RidingPinAnimation(
                        rideProgress: _rideProgress,
                        rideScale: _rideScale,
                        rideGlow: _rideGlow,
                        brandProgress: _brandProgress,
                        targetKey: _loginCardKey,
                        wordKey: _brandWordKey,
                      ),
                    ),
                  ),
                if (_showSuccessOverlay) _buildSuccessOverlay(),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSuccessOverlay() {
    const double outer = 140;
    const double logoDiameter = 88;
    return AnimatedBuilder(
      animation: _successController,
      builder: (context, child) {
        return Container(
          color: const Color(0xFF1A1A1A).withValues(alpha: 0.95),
          child: Center(
            child: ScaleTransition(
              scale: _successCheckScale,
              alignment: Alignment.center,
              child: SizedBox(
                width: outer,
                height: outer,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Positioned.fill(
                      child: CircularProgressIndicator(
                        strokeWidth: 4,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          AppColors.primary,
                        ),
                        backgroundColor: Colors.white.withValues(alpha: 0.12),
                      ),
                    ),
                    ClipOval(
                      child: Container(
                        width: logoDiameter,
                        height: logoDiameter,
                        color: Colors.white,
                        alignment: Alignment.center,
                        padding: const EdgeInsets.all(10),
                        child: Image.asset(
                          'assets/logo.png',
                          fit: BoxFit.contain,
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
    );
  }

  // ─── Login card (dark inner panel) ─────────────────────────────────────────
  static const Color _cardShell = Color(0xFF22222C);
  static const Color _cardInner = Color(0xFF0A0A0F);
  static const Color _fieldFill = Color(0xFF14141C);
  static const Color _fieldBorder = Color(0xFF2E2E3A);
  static const Color _labelPrimary = Color(0xFFECECF1);
  static const Color _labelMuted = Color(0xFF9494A3);
  static const Color _hintOnDark = Color(0xFF6C6C7A);

  Widget _buildLoginCard(bool isLoading, {bool compact = false}) {
    return PhysicalShape(
      key: _loginCardKey,
      clipper: const _ModernLoginCardClipper(),
      elevation: 14,
      color: _cardShell,
      shadowColor: Colors.black.withOpacity(0.45),
      child: SizedBox(
        width: double.infinity,
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(22),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: _cardInner,
                border: Border.all(
                  color: Colors.white.withOpacity(0.07),
                ),
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding:
                          EdgeInsets.fromLTRB(14, compact ? 8 : 10, 14, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                  SizedBox(height: compact ? 38 : 48),
                  _buildAnimatedBrandWord(),
                  const SizedBox(height: 6),
                  Text(
                    'Login to continue',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      color: _labelMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  SizedBox(height: compact ? 7 : 10),
                  const Text(
                    'Email',
                    style: TextStyle(
                      color: _labelPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextFormField(
                    controller: _emailController,
                    focusNode: _emailFocusNode,
                    keyboardType: TextInputType.emailAddress,
                    cursorColor: AppColors.primary,
                    validator: (value) {
                      final email = value?.trim() ?? '';
                      if (email.isEmpty) return 'Please enter your email';
                      // Keep validation permissive so valid modern domains
                      // (long TLDs, plus signs, subdomains) are not blocked locally.
                      final at = email.indexOf('@');
                      if (at <= 0 || at != email.lastIndexOf('@')) {
                        return 'Please enter a valid email';
                      }
                      final domain = email.substring(at + 1);
                      if (!domain.contains('.') ||
                          domain.startsWith('.') ||
                          domain.endsWith('.')) {
                        return 'Please enter a valid email';
                      }
                      return null;
                    },
                    style: const TextStyle(
                      color: _labelPrimary,
                      fontSize: 16,
                    ),
                    decoration: InputDecoration(
                      fillColor: _fieldFill,
                      filled: true,
                      hintText: 'Enter your email',
                      hintStyle: const TextStyle(color: _hintOnDark),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _fieldBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: AppColors.primary,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                  SizedBox(height: compact ? 6 : 8),
                  const Text(
                    'Password',
                    style: TextStyle(
                      color: _labelPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 1),
                  TextFormField(
                    controller: _passwordController,
                    focusNode: _passwordFocusNode,
                    obscureText: !_isPasswordVisible,
                    cursorColor: AppColors.primary,
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter your password';
                      }
                      return null;
                    },
                    style: const TextStyle(
                      color: _labelPrimary,
                      fontSize: 16,
                    ),
                    decoration: InputDecoration(
                      fillColor: _fieldFill,
                      filled: true,
                      hintText: 'Enter your password',
                      hintStyle: const TextStyle(color: _hintOnDark),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _isPasswordVisible
                              ? Icons.visibility
                              : Icons.visibility_off,
                          color: _labelMuted,
                        ),
                        onPressed: () => setState(
                          () => _isPasswordVisible = !_isPasswordVisible,
                        ),
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: _fieldBorder),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: AppColors.primary,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 1),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: isLoading
                          ? null
                          : () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const ForgotPasswordScreen(),
                              ),
                            ),
                      child: Text(
                        'Forgot Password?',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  _AnimatedLoginButton(
                    isLoading: isLoading,
                    onPressed: _handleLogin,
                    buttonScale: _buttonScale,
                    onTapDown: () {
                      if (!isLoading) _buttonScaleController.forward();
                    },
                    onTapUp: () => _buttonScaleController.reverse(),
                    onTapCancel: () => _buttonScaleController.reverse(),
                  ),
                  const SizedBox(height: 1),
                  SizedBox(height: compact ? 10 : 14),
                  ],
                ),
              ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAnimatedBrandWord() {
    const letters = ['L', 'i', 'v', 'e', 'T', 'r', 'a', 'c', 'k'];
    return AnimatedBuilder(
      animation: _brandProgress,
      builder: (context, _) {
        final progress = _brandProgress.value;
        return SizedBox(
          key: _brandWordKey,
          height: 34,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: List.generate(letters.length, (index) {
              final reveal = (progress * letters.length - index).clamp(
                0.0,
                1.0,
              );
              return AnimatedOpacity(
                duration: const Duration(milliseconds: 120),
                opacity: reveal.toDouble(),
                child: Transform.translate(
                  offset: Offset(0, (1 - reveal.toDouble()) * 5),
                  child: Text(
                    letters[index],
                    style: TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                      height: 1,
                      color: index == 0
                          ? AppColors.primary
                          : const Color(0xFFF1F1F6),
                      letterSpacing: -0.8,
                    ),
                  ),
                ),
              );
            }),
          ),
        );
      },
    );
  }

  // ─── 2FA OTP card ──────────────────────────────────────────────────────────
  Widget _build2FACard(bool isLoading, {bool compact = false}) {
    return PhysicalShape(
      clipper: const _ModernLoginCardClipper(),
      elevation: 12,
      color: _cardShell,
      shadowColor: Colors.black.withOpacity(0.42),
      child: SizedBox(
        width: double.infinity,
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(22),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: _cardInner,
                border: Border.all(
                  color: Colors.white.withOpacity(0.07),
                ),
              ),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  compact ? 14 : 18,
                  compact ? 14 : 18,
                  compact ? 14 : 18,
                  compact ? 18 : 22,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.shield_outlined,
                    color: AppColors.primary,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Two-Factor Authentication',
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          color: _labelPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Enter the 6-digit OTP sent to your email',
                        style: TextStyle(
                          fontSize: 12,
                          color: _labelMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            SizedBox(height: compact ? 12 : 20),

            // Email info
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: _fieldFill,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _fieldBorder),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.email_outlined,
                    size: 16,
                    color: _labelMuted,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _2faEmail,
                      style: const TextStyle(
                        fontSize: 13,
                        color: _labelPrimary,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: compact ? 12 : 20),

            // OTP input
            TextFormField(
              controller: _otpController,
              focusNode: _otpFocusNode,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              cursorColor: AppColors.primary,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                letterSpacing: 8,
                color: _labelPrimary,
              ),
              decoration: InputDecoration(
                labelText: 'Enter OTP',
                labelStyle: const TextStyle(
                  color: _labelMuted,
                  fontSize: 14,
                ),
                fillColor: _fieldFill,
                filled: true,
                counterText: '',
                prefixIcon: Icon(Icons.lock_outline, color: AppColors.primary),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _fieldBorder),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.primary, width: 2),
                ),
              ),
            ),
            SizedBox(height: compact ? 12 : 20),

            // Verify button
            ElevatedButton(
              onPressed: isLoading ? null : _handleVerifyOTP,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: const Color(0xFF141418),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 2,
              ),
              child: isLoading
                  ? const BubbleLoader(
                      primaryColor: Color(0xFF141418),
                      size: 20,
                    )
                  : const Text(
                      'Verify & Login',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
            ),
            const SizedBox(height: 12),

            // Resend OTP
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  "Didn't receive the OTP? ",
                  style: const TextStyle(
                    color: _labelMuted,
                    fontSize: 13,
                  ),
                ),
                GestureDetector(
                  onTap: isLoading ? null : _handleResendOTP,
                  child: Text(
                    'Resend',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Back to login
            TextButton(
              onPressed: isLoading
                  ? null
                  : () {
                      // Reset BLoC to initial so stale error/2FA state is cleared
                      context.read<AuthBloc>().add(const AuthLogoutRequested());
                      setState(() {
                        _show2FAInput = false;
                        _otpController.clear();
                      });
                    },
              child: Text(
                '← Back to Login',
                style: TextStyle(color: _labelMuted, fontSize: 13),
              ),
            ),
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

/// Non-rectangular login panel: generous top corners + scooped bottom edge.
class _ModernLoginCardClipper extends CustomClipper<Path> {
  const _ModernLoginCardClipper();

  static const double _rTop = 36;
  static const double _rBot = 20;
  static const double _scallop = 15;

  @override
  Path getClip(Size size) {
    final w = size.width;
    final h = size.height;
    final path = Path();
    path.moveTo(_rTop, 0);
    path.lineTo(w - _rTop, 0);
    path.arcToPoint(
      Offset(w, _rTop),
      radius: const Radius.circular(_rTop),
      clockwise: true,
    );
    path.lineTo(w, h - _rBot);
    path.arcToPoint(
      Offset(w - _rBot, h),
      radius: const Radius.circular(_rBot),
      clockwise: true,
    );
    path.quadraticBezierTo(w * 0.5, h - _scallop, _rBot, h);
    path.arcToPoint(
      Offset(0, h - _rBot),
      radius: const Radius.circular(_rBot),
      clockwise: true,
    );
    path.lineTo(0, _rTop);
    path.arcToPoint(
      Offset(_rTop, 0),
      radius: const Radius.circular(_rTop),
      clockwise: true,
    );
    path.close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

/// Interactive login button with scale-on-press feedback.
class _RidingPinAnimation extends StatelessWidget {
  const _RidingPinAnimation({
    required this.rideProgress,
    required this.rideScale,
    required this.rideGlow,
    required this.brandProgress,
    required this.targetKey,
    required this.wordKey,
  });

  final Animation<double> rideProgress;
  final Animation<double> rideScale;
  final Animation<double> rideGlow;
  final Animation<double> brandProgress;
  final GlobalKey targetKey;
  final GlobalKey wordKey;

  double _bezier(double t, double p0, double p1, double p2, double p3) {
    final oneMinusT = 1 - t;
    return (oneMinusT * oneMinusT * oneMinusT * p0) +
        (3 * oneMinusT * oneMinusT * t * p1) +
        (3 * oneMinusT * t * t * p2) +
        (t * t * t * p3);
  }

  double _lerp(double a, double b, double t) => a + (b - a) * t;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([rideProgress, brandProgress]),
      builder: (context, _) {
        const pinSize = 56.0;
        final t = rideProgress.value;
        final wordT = brandProgress.value;
        final hostBox = context.findRenderObject() as RenderBox?;
        final targetBox =
            targetKey.currentContext?.findRenderObject() as RenderBox?;
        final wordBox =
            wordKey.currentContext?.findRenderObject() as RenderBox?;

        final screen = MediaQuery.of(context).size;
        final startX = (screen.width * 0.9) - (pinSize / 2);
        final startY = 70.0;

        double targetX = (screen.width / 2) - (pinSize / 2);
        double targetY = screen.height * 0.33;

        if (hostBox != null && targetBox != null) {
          final topLeft = targetBox.localToGlobal(
            Offset.zero,
            ancestor: hostBox,
          );
          targetX = topLeft.dx + (targetBox.size.width / 2) - (pinSize / 2);
          targetY = topLeft.dy + 6;
        }

        double wordStartX = targetX;
        double wordEndX = targetX;
        double wordY = targetY + 7;
        double finalCenterY = targetY - 12;
        if (hostBox != null && wordBox != null) {
          final wordTopLeft = wordBox.localToGlobal(
            Offset.zero,
            ancestor: hostBox,
          );
          final letterWidth = wordBox.size.width / 9;
          wordStartX = wordTopLeft.dx + (letterWidth * 0.5) - (pinSize / 2);
          wordEndX =
              wordTopLeft.dx +
              wordBox.size.width -
              (letterWidth * 0.5) -
              (pinSize / 2);
          wordY = wordTopLeft.dy - 24;
          finalCenterY = wordTopLeft.dy - (pinSize * 1.8) - 8;
        }

        double x;
        double y;
        double tilt;
        double pinScale = rideScale.value;

        if (t < 0.999) {
          y = _bezier(
            t,
            startY,
            startY + ((targetY - startY) * 0.18),
            startY + ((targetY - startY) * 0.86),
            wordY,
          );
          final waveX = math.sin(t * math.pi * 4.6) * (35 * (1 - (t * 0.64)));
          final driftX = (wordStartX - startX) * t;
          x = startX + driftX + waveX;
          if (t > 0.9) {
            final lt = (t - 0.9) / 0.1;
            y += math.sin(lt * math.pi * 2.4) * (4 * (1 - lt));
          }
          tilt = math.sin(t * math.pi * 5) * 0.12 * (1 - t);
        } else {
          if (wordT < 0.82) {
            final scanT = (wordT / 0.82).clamp(0.0, 1.0);
            x = _lerp(wordStartX, wordEndX, scanT);
            y = wordY + math.sin(scanT * math.pi * 9) * 2.5;
            tilt = math.sin(scanT * math.pi * 7) * 0.05;
            pinScale = _lerp(1.35, 1.2, scanT);
          } else {
            final settleT = ((wordT - 0.82) / 0.18).clamp(0.0, 1.0);
            final fromX = wordEndX;
            final centerX = (wordStartX + wordEndX) / 2;
            x = _lerp(fromX, centerX, Curves.easeOut.transform(settleT));
            y = _lerp(
              wordY,
              finalCenterY,
              Curves.easeOutBack.transform(settleT),
            );
            tilt = 0;
            pinScale = _lerp(1.24, 1.9, Curves.easeOut.transform(settleT));
          }
        }

        return Stack(
          children: [
            if (rideGlow.value > 0 || wordT > 0.84)
              Positioned(
                left: targetX - 12,
                top: targetY + 20,
                child: Opacity(
                  opacity: 0.18 + (0.22 * rideGlow.value),
                  child: Container(
                    width: 68,
                    height: 22,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withValues(
                            alpha: 0.45 + (0.2 * rideGlow.value),
                          ),
                          blurRadius: 20,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            Positioned(
              left: x,
              top: y,
              child: Transform.rotate(
                angle: tilt,
                child: Transform.scale(
                  scale: pinScale,
                  child: Container(
                    width: pinSize,
                    height: pinSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.22),
                          blurRadius: 12,
                          offset: const Offset(0, 5),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.location_on_rounded,
                      size: pinSize,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _AnimatedLoginButton extends StatelessWidget {
  const _AnimatedLoginButton({
    required this.isLoading,
    required this.onPressed,
    required this.buttonScale,
    required this.onTapDown,
    required this.onTapUp,
    required this.onTapCancel,
  });

  final bool isLoading;
  final VoidCallback onPressed;
  final Animation<double> buttonScale;
  final VoidCallback onTapDown;
  final VoidCallback onTapUp;
  final VoidCallback onTapCancel;

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => onTapDown(),
      onPointerUp: (_) => onTapUp(),
      onPointerCancel: (_) => onTapCancel(),
      child: ScaleTransition(
        scale: buttonScale,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withOpacity(0.4),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ElevatedButton(
            onPressed: isLoading ? null : onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: const Color(0xFF1F1F1F),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 2,
            ),
            child: isLoading
                ? BubbleLoader(primaryColor: AppColors.primary, size: 20)
                : const Text(
                    'Login',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                  ),
          ),
        ),
      ),
    );
  }
}
