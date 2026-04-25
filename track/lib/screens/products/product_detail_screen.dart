import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/config/constants.dart';
import 'package:track/models/company_product.dart';
import 'package:track/services/product_service.dart';
import 'package:track/widgets/location_loader.dart';
import 'package:track/widgets/product_inline_video.dart';
import 'package:url_launcher/url_launcher.dart';

const _kProductInk = Color(0xFF1A1A1A);

class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  final _service = ProductService();
  CompanyProductDetail? _detail;
  bool _loading = true;
  String? _error;
  final _pageController = PageController();
  int _galleryIndex = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await _service.fetchById(widget.productId);
      if (!mounted) return;
      setState(() {
        _detail = d;
        _loading = false;
        if (d == null) _error = 'Product not found.';
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _detail = null;
          _loading = false;
          _error = 'Could not load product.';
        });
      }
    }
  }

  List<String> _galleryUrls(CompanyProductDetail d) {
    final urls = <String>[];
    final banner = AppConstants.productImageUrl(d.bannerImage.isNotEmpty ? d.bannerImage : null);
    if (banner.isNotEmpty) urls.add(banner);
    for (final raw in d.images) {
      final u = AppConstants.productImageUrl(raw);
      if (u.isNotEmpty && !urls.contains(u)) urls.add(u);
    }
    return urls;
  }

  Future<void> _runCta(CompanyProductDetail d) async {
    final type = d.ctaType.toLowerCase();
    final v = d.ctaValue.trim();
    if (type == 'none' || v.isEmpty) return;
    Uri? uri;
    if (type == 'phone') {
      final digits = v.replaceAll(RegExp(r'\s'), '');
      uri = Uri(scheme: 'tel', path: digits);
    } else if (type == 'email') {
      uri = Uri(scheme: 'mailto', path: v);
    } else if (type == 'url') {
      final s = v.startsWith('http://') || v.startsWith('https://') ? v : 'https://$v';
      uri = Uri.tryParse(s);
    }
    if (uri == null) return;
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open link.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open link.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(_detail?.name ?? 'Product'),
        backgroundColor: Colors.white,
        foregroundColor: _kProductInk,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      body: _loading
          ? const Center(child: LocationLoader(size: 44))
          : _error != null || _detail == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _error ?? 'Unavailable',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: _kProductInk.withValues(alpha: 0.65)),
                ),
              ),
            )
          : _buildBody(context, _detail!),
    );
  }

  Widget _buildBody(BuildContext context, CompanyProductDetail d) {
    final gallery = _galleryUrls(d);
    final sectionLabelStyle = TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.6,
      color: _kProductInk.withValues(alpha: 0.45),
    );
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(0, 0, 0, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (gallery.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Text('PHOTOS', style: sectionLabelStyle),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 220,
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (i) => setState(() => _galleryIndex = i),
                itemCount: gallery.length,
                itemBuilder: (context, i) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: Image.network(
                        gallery[i],
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => ColoredBox(
                          color: _kProductInk.withValues(alpha: 0.06),
                          child: Center(
                            child: Icon(Icons.broken_image_outlined, size: 48, color: _kProductInk.withValues(alpha: 0.25)),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ] else ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Text('PHOTOS', style: sectionLabelStyle),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                height: 160,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _kProductInk.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Icon(Icons.image_not_supported_outlined, size: 40, color: _kProductInk.withValues(alpha: 0.25)),
              ),
            ),
          ],
          if (gallery.length > 1)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  gallery.length,
                  (i) => Container(
                    width: i == _galleryIndex ? 18 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(4),
                      color: i == _galleryIndex ? AppColors.primary : _kProductInk.withValues(alpha: 0.18),
                    ),
                  ),
                ),
              ),
            ),
          if (d.videoUrl.trim().isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Text('VIDEO', style: sectionLabelStyle),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
              child: ProductInlineVideo(videoUrl: d.videoUrl),
            ),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        d.name,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: _kProductInk,
                          letterSpacing: -0.4,
                          height: 1.2,
                        ),
                      ),
                    ),
                    if (d.offerTag.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.only(left: 10),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          d.offerTag,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _kProductInk),
                        ),
                      ),
                  ],
                ),
                if (d.price != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    '₹${d.price!.toStringAsFixed(d.price! == d.price!.roundToDouble() ? 0 : 2)}',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: _kProductInk),
                  ),
                ],
                if (d.fullDescription.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text('DETAILS', style: sectionLabelStyle),
                  const SizedBox(height: 8),
                  Text(
                    d.fullDescription,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.45,
                      color: _kProductInk.withValues(alpha: 0.72),
                    ),
                  ),
                ] else if (d.shortDescription.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Text('DETAILS', style: sectionLabelStyle),
                  const SizedBox(height: 8),
                  Text(
                    d.shortDescription,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.45,
                      color: _kProductInk.withValues(alpha: 0.72),
                    ),
                  ),
                ],
                if (d.ctaType.toLowerCase() != 'none' && d.ctaValue.trim().isNotEmpty) ...[
                  const SizedBox(height: 28),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => _runCta(d),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: _kProductInk,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Text(
                        d.ctaLabel.trim().isEmpty ? 'Contact us' : d.ctaLabel.trim(),
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
