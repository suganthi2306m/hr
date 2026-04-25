import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:track/config/constants.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

const _kInk = Color(0xFF1A1A1A);

String? _youtubeVideoIdFromUrl(String raw) {
  var s = raw.trim();
  if (s.isEmpty) return null;
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'https://$s';
  }
  final uri = Uri.tryParse(s);
  if (uri == null) return null;
  final host = uri.host.replaceFirst(RegExp(r'^www\.', caseSensitive: false), '').toLowerCase();
  final idOk = RegExp(r'^[\w-]{6,}$');
  if (host == 'youtu.be' && uri.pathSegments.isNotEmpty) {
    final id = uri.pathSegments.first;
    return idOk.hasMatch(id) ? id : null;
  }
  if (host == 'm.youtube.com' || host == 'youtube.com' || host.endsWith('.youtube.com')) {
    final segs = uri.pathSegments;
    if (segs.isNotEmpty && segs.first == 'embed' && segs.length >= 2) {
      final id = segs[1];
      return idOk.hasMatch(id) ? id : null;
    }
    if (segs.isNotEmpty && segs.first == 'shorts' && segs.length >= 2) {
      final id = segs[1];
      return idOk.hasMatch(id) ? id : null;
    }
    final v = uri.queryParameters['v'];
    if (v != null && idOk.hasMatch(v)) return v;
  }
  return null;
}

bool _isDirectVideoFileUrl(String u) {
  return RegExp(r'\.(mp4|webm|ogg|m3u8)(\?|#|$)', caseSensitive: false).hasMatch(u);
}

Future<void> _openVideoExternal(String raw) async {
  final resolved = AppConstants.getLmsFileUrl(raw.trim());
  if (resolved.isEmpty) return;
  var uri = Uri.tryParse(resolved);
  if (uri == null || !uri.hasScheme) {
    final withScheme =
        resolved.startsWith('http://') || resolved.startsWith('https://') ? resolved : 'https://$resolved';
    uri = Uri.tryParse(withScheme);
  }
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// Inline playback for YouTube and direct video file URLs; otherwise opens externally.
class ProductInlineVideo extends StatefulWidget {
  const ProductInlineVideo({super.key, required this.videoUrl});

  final String videoUrl;

  @override
  State<ProductInlineVideo> createState() => _ProductInlineVideoState();
}

enum _EmbedKind { none, youtube, file, externalOnly }

class _ProductInlineVideoState extends State<ProductInlineVideo> {
  _EmbedKind _kind = _EmbedKind.none;
  WebViewController? _controller;
  String _resolved = '';

  @override
  void initState() {
    super.initState();
    _resolved = AppConstants.getLmsFileUrl(widget.videoUrl.trim());
    if (_resolved.isEmpty) {
      _kind = _EmbedKind.none;
      return;
    }
    final yt = _youtubeVideoIdFromUrl(_resolved);
    if (yt != null) {
      _kind = _EmbedKind.youtube;
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(Colors.black)
        ..loadRequest(
          Uri.parse('https://www.youtube-nocookie.com/embed/$yt?playsinline=1'),
        );
      return;
    }
    if (_isDirectVideoFileUrl(_resolved)) {
      _kind = _EmbedKind.file;
      final esc = const HtmlEscape().convert(_resolved);
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(Colors.black)
        ..loadHtmlString(
          '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"></head>'
          '<body style="margin:0;background:#000;"><video controls playsinline webkit-playsinline style="width:100%;height:auto;" src="$esc"></video></body></html>',
          baseUrl: 'https://www.youtube.com',
        );
      return;
    }
    _kind = _EmbedKind.externalOnly;
  }

  @override
  Widget build(BuildContext context) {
    switch (_kind) {
      case _EmbedKind.none:
        return const SizedBox.shrink();
      case _EmbedKind.youtube:
      case _EmbedKind.file:
        final c = _controller;
        if (c == null) return const SizedBox.shrink();
        return AspectRatio(
          aspectRatio: 16 / 9,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: WebViewWidget(controller: c),
          ),
        );
      case _EmbedKind.externalOnly:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Open this link to watch (cannot embed in the app).',
              style: TextStyle(fontSize: 12, color: _kInk.withValues(alpha: 0.55), height: 1.35),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _openVideoExternal(widget.videoUrl),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('Open video'),
              style: OutlinedButton.styleFrom(
                foregroundColor: _kInk,
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(color: _kInk.withValues(alpha: 0.2)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
            ),
          ],
        );
    }
  }
}
