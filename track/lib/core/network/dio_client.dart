// core/network/dio_client.dart
// Single place for Dio configuration. Used by data layer only.
// No business logic — only auth header, retry, and logging.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import '../../config/constants.dart';

/// Verbose per-request Dio logs (options, URLs, bodies). Off by default — very chatty.
const _kLogDioTraffic = false;

/// Retries on 429 (rate limit) with exponential backoff. Respects Retry-After.
class RetryOnRateLimitInterceptor extends Interceptor {
  RetryOnRateLimitInterceptor(this.dio);
  final Dio dio;
  static const int maxRetries = 3;
  static const List<int> backoffDelaysSeconds = [2, 4, 6];

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 429) {
      return handler.next(err);
    }
    // Some endpoints (e.g. login) should not silently back off/retry because it
    // feels like the UI is "stuck". Allow opt-out per request.
    final disableRetry = err.requestOptions.extra['disable_429_retry'] == true;
    if (disableRetry) {
      return handler.next(err);
    }
    final extra = err.requestOptions.extra;
    final retryCount = extra['retry_count'] as int? ?? 0;
    if (retryCount >= maxRetries) {
      return handler.next(err);
    }
    int waitSeconds =
        backoffDelaysSeconds[retryCount.clamp(
          0,
          backoffDelaysSeconds.length - 1,
        )];
    final retryAfter = err.response?.headers.value('retry-after');
    if (retryAfter != null && retryAfter.isNotEmpty) {
      final parsed = int.tryParse(retryAfter);
      if (parsed != null && parsed > 0) {
        waitSeconds = parsed > 120 ? 120 : parsed;
      }
    }
    await Future<void>.delayed(Duration(seconds: waitSeconds));
    final opts = err.requestOptions;
    opts.extra['retry_count'] = retryCount + 1;
    try {
      final response = await dio.fetch(opts);
      return handler.resolve(response);
    } catch (e) {
      return handler.next(err);
    }
  }
}

/// Ensures multipart uploads are not sent with Content-Type: application/json.
class FormDataContentTypeInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.data is FormData) {
      options.headers.remove('Content-Type');
      // Dio will set multipart/form-data with boundary when sending
    }
    handler.next(options);
  }
}

/// Coalesces identical in-flight GET requests to prevent request storms
/// when multiple widgets/screens ask for the same resource simultaneously.
class InFlightGetCoalescingInterceptor extends Interceptor {
  final Map<String, Completer<Response<dynamic>>> _inFlight = {};

  String _keyFor(RequestOptions options) {
    final auth = options.headers['Authorization']?.toString() ?? '';
    return '${options.uri}::${options.method.toUpperCase()}::$auth';
  }

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final method = options.method.toUpperCase();
    final disable = options.extra['disable_inflight_coalescing'] == true;
    if (method != 'GET' || disable) {
      handler.next(options);
      return;
    }

    final key = _keyFor(options);
    final existing = _inFlight[key];
    if (existing != null) {
      try {
        final response = await existing.future;
        handler.resolve(response);
      } catch (e) {
        handler.reject(
          DioException(
            requestOptions: options,
            message: 'Coalesced request failed: $e',
          ),
        );
      }
      return;
    }

    final completer = Completer<Response<dynamic>>();
    _inFlight[key] = completer;
    options.extra['inflight_key'] = key;
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final key = response.requestOptions.extra['inflight_key'] as String?;
    if (key != null) {
      final completer = _inFlight.remove(key);
      if (completer != null && !completer.isCompleted) {
        completer.complete(response);
      }
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final key = err.requestOptions.extra['inflight_key'] as String?;
    if (key != null) {
      final completer = _inFlight.remove(key);
      if (completer != null && !completer.isCompleted) {
        completer.completeError(err);
      }
    }
    handler.next(err);
  }
}

/// Central Dio client for the app. Used only by data layer (datasources).
/// Auth token is set before authenticated requests; interceptors handle retry and logging.
class DioClient {
  static final DioClient _instance = DioClient._internal();
  factory DioClient() => _instance;

  late final Dio dio;

  DioClient._internal() {
    final base = AppConstants.baseUrl;
    final baseUrl = base.endsWith('/')
        ? base.substring(0, base.length - 1)
        : base;
    dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        // Production mobile networks can have short jitter spikes; keep
        // timeouts tolerant to avoid false "server timed out" UX.
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 45),
        sendTimeout: const Duration(seconds: 45),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );
    // Parse large JSON payloads off the UI thread when possible.
    dio.transformer = BackgroundTransformer()..jsonDecodeCallback = jsonDecode;
    // Tune socket behavior for reliability under burst traffic.
    dio.httpClientAdapter = IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient();
        client.maxConnectionsPerHost = 20;
        client.idleTimeout = const Duration(seconds: 20);
        client.connectionTimeout = const Duration(seconds: 20);
        client.autoUncompress = true;
        return client;
      },
    );
    if (kDebugMode) {
      debugPrint('[DioClient] baseUrl: ${dio.options.baseUrl}');
    }
    dio.interceptors.addAll([
      FormDataContentTypeInterceptor(),
      InFlightGetCoalescingInterceptor(),
      RetryOnRateLimitInterceptor(dio),
      if (kDebugMode && _kLogDioTraffic)
        LogInterceptor(
          requestBody: true,
          responseBody: false,
          requestHeader: false,
          responseHeader: false,
          error: true,
          logPrint: (obj) => debugPrint('[Dio] $obj'),
        ),
    ]);
  }

  void setAuthToken(String? token) {
    if (token == null || token.isEmpty) {
      dio.options.headers.remove('Authorization');
    } else {
      dio.options.headers['Authorization'] = 'Bearer $token';
    }
  }

  void clearAuthToken() {
    dio.options.headers.remove('Authorization');
  }
}
