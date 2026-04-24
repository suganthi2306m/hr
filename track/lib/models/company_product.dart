// track/lib/models/company_product.dart

class CompanyProductCard {
  const CompanyProductCard({
    required this.id,
    required this.name,
    required this.shortDescription,
    required this.bannerImage,
    required this.offerTag,
    required this.price,
    required this.highlightProduct,
    required this.showOnHomeBanner,
  });

  final String id;
  final String name;
  final String shortDescription;
  final String bannerImage;
  final String offerTag;
  final double? price;
  final bool highlightProduct;
  final bool showOnHomeBanner;

  factory CompanyProductCard.fromJson(Map<String, dynamic> j) {
    double? p;
    final raw = j['price'];
    if (raw is num) {
      p = raw.toDouble();
    } else if (raw is String && raw.trim().isNotEmpty) {
      p = double.tryParse(raw.trim());
    }
    return CompanyProductCard(
      id: '${j['id'] ?? j['_id'] ?? ''}',
      name: '${j['name'] ?? ''}',
      shortDescription: '${j['shortDescription'] ?? ''}',
      bannerImage: '${j['bannerImage'] ?? ''}',
      offerTag: '${j['offerTag'] ?? ''}',
      price: p,
      highlightProduct: j['highlightProduct'] == true,
      showOnHomeBanner: j['showOnHomeBanner'] == true,
    );
  }
}

class CompanyProductDetail extends CompanyProductCard {
  const CompanyProductDetail({
    required super.id,
    required super.name,
    required super.shortDescription,
    required super.bannerImage,
    required super.offerTag,
    required super.price,
    required super.highlightProduct,
    required super.showOnHomeBanner,
    required this.fullDescription,
    required this.images,
    required this.ctaLabel,
    required this.ctaType,
    required this.ctaValue,
  });

  final String fullDescription;
  final List<String> images;
  final String ctaLabel;
  final String ctaType;
  final String ctaValue;

  factory CompanyProductDetail.fromJson(Map<String, dynamic> j) {
    final base = CompanyProductCard.fromJson(j);
    final imgs = j['images'];
    final list = imgs is List
        ? imgs.map((e) => '$e').where((s) => s.isNotEmpty).toList()
        : <String>[];
    return CompanyProductDetail(
      id: base.id,
      name: base.name,
      shortDescription: base.shortDescription,
      bannerImage: base.bannerImage,
      offerTag: base.offerTag,
      price: base.price,
      highlightProduct: base.highlightProduct,
      showOnHomeBanner: base.showOnHomeBanner,
      fullDescription: '${j['fullDescription'] ?? ''}',
      images: list,
      ctaLabel: '${j['ctaLabel'] ?? 'Contact Us'}',
      ctaType: '${j['ctaType'] ?? 'none'}',
      ctaValue: '${j['ctaValue'] ?? ''}',
    );
  }
}

class CompanyProductHome {
  const CompanyProductHome({
    required this.banners,
    required this.highlighted,
  });

  final List<CompanyProductCard> banners;
  final List<CompanyProductCard> highlighted;

  static CompanyProductHome empty() =>
      const CompanyProductHome(banners: [], highlighted: []);

  factory CompanyProductHome.fromJson(Map<String, dynamic> j) {
    List<CompanyProductCard> parseList(dynamic raw) {
      if (raw is! List) return [];
      return raw
          .whereType<Map>()
          .map((e) => CompanyProductCard.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }

    return CompanyProductHome(
      banners: parseList(j['banners']),
      highlighted: parseList(j['highlighted']),
    );
  }
}
