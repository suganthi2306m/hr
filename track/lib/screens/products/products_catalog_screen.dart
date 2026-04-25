import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/config/constants.dart';
import 'package:track/models/company_product.dart';
import 'package:track/services/product_service.dart';
import 'package:track/widgets/location_loader.dart';
import 'package:track/screens/products/product_detail_screen.dart';

const _kProductInk = Color(0xFF1A1A1A);

class ProductsCatalogScreen extends StatefulWidget {
  const ProductsCatalogScreen({super.key});

  @override
  State<ProductsCatalogScreen> createState() => _ProductsCatalogScreenState();
}

class _ProductsCatalogScreenState extends State<ProductsCatalogScreen> {
  final _service = ProductService();
  List<CompanyProductCard> _items = [];
  bool _loading = true;
  String? _error;

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
      final list = await _service.fetchCatalog();
      if (mounted) {
        setState(() {
          _items = list;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _items = [];
          _loading = false;
          _error = 'Could not load products.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Our products'),
        backgroundColor: Colors.white,
        foregroundColor: _kProductInk,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _load,
        child: _loading
            ? const Center(child: LocationLoader(size: 44))
            : _error != null
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(24),
                children: [
                  Text(_error!, style: TextStyle(color: _kProductInk.withValues(alpha: 0.7))),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _load,
                    style: FilledButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: _kProductInk),
                    child: const Text('Retry'),
                  ),
                ],
              )
            : _items.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(24),
                children: [
                  Text(
                    'No products are published for your company yet.',
                    style: TextStyle(color: _kProductInk.withValues(alpha: 0.65), height: 1.4),
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: _items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 14),
                itemBuilder: (context, i) {
                  final p = _items[i];
                  final img = AppConstants.productImageUrl(
                    p.bannerImage.isNotEmpty ? p.bannerImage : null,
                  );
                  final hasVideo = p.videoUrl.trim().isNotEmpty;
                  return Material(
                    color: Colors.white,
                    elevation: 0,
                    shadowColor: Colors.transparent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: BorderSide(color: _kProductInk.withValues(alpha: 0.08)),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () {
                        Navigator.push<void>(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) => ProductDetailScreen(productId: p.id),
                          ),
                        );
                      },
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          AspectRatio(
                            aspectRatio: 16 / 10,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                if (img.isEmpty)
                                  ColoredBox(
                                    color: _kProductInk.withValues(alpha: 0.06),
                                    child: Icon(Icons.image_outlined, size: 48, color: _kProductInk.withValues(alpha: 0.2)),
                                  )
                                else
                                  Image.network(
                                    img,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => ColoredBox(
                                      color: _kProductInk.withValues(alpha: 0.06),
                                      child: Icon(Icons.broken_image_outlined, size: 48, color: _kProductInk.withValues(alpha: 0.25)),
                                    ),
                                  ),
                                if (hasVideo)
                                  Positioned(
                                    right: 10,
                                    bottom: 10,
                                    child: DecoratedBox(
                                      decoration: BoxDecoration(
                                        color: Colors.black.withValues(alpha: 0.72),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: const Padding(
                                        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Icon(Icons.play_circle_outline, color: Colors.white, size: 18),
                                            SizedBox(width: 4),
                                            Text(
                                              'Video',
                                              style: TextStyle(
                                                color: Colors.white,
                                                fontSize: 12,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 14, 12, 16),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        p.name,
                                        style: const TextStyle(
                                          fontSize: 17,
                                          fontWeight: FontWeight.w900,
                                          color: _kProductInk,
                                          letterSpacing: -0.35,
                                          height: 1.2,
                                        ),
                                      ),
                                      if (p.portfolioWide) ...[
                                        const SizedBox(height: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFE0F2FE),
                                            borderRadius: BorderRadius.circular(20),
                                          ),
                                          child: Text(
                                            'Partner catalog',
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                              color: Colors.blue.shade900,
                                            ),
                                          ),
                                        ),
                                      ],
                                      if (p.offerTag.isNotEmpty) ...[
                                        const SizedBox(height: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: AppColors.primary.withValues(alpha: 0.35),
                                            borderRadius: BorderRadius.circular(20),
                                          ),
                                          child: Text(
                                            p.offerTag,
                                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _kProductInk),
                                          ),
                                        ),
                                      ],
                                      if (p.shortDescription.isNotEmpty) ...[
                                        const SizedBox(height: 10),
                                        Text(
                                          p.shortDescription,
                                          maxLines: 3,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 14,
                                            height: 1.4,
                                            color: _kProductInk.withValues(alpha: 0.58),
                                          ),
                                        ),
                                      ],
                                      if (p.price != null) ...[
                                        const SizedBox(height: 10),
                                        Text(
                                          '₹${p.price!.toStringAsFixed(p.price! == p.price!.roundToDouble() ? 0 : 2)}',
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w900,
                                            color: _kProductInk,
                                          ),
                                        ),
                                      ],
                                      const SizedBox(height: 6),
                                      Text(
                                        'View full details',
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                          color: AppColors.primary.withValues(alpha: 0.95),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Icon(Icons.chevron_right_rounded, color: _kProductInk.withValues(alpha: 0.35), size: 28),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
