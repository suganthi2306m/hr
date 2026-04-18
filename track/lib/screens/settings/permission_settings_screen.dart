import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:track/services/geo/location_permission_catalog.dart';
import 'package:track/services/geo/location_service.dart';

/// Settings → lists every location-related permission with Enabled / Not enabled.
class PermissionSettingsScreen extends StatefulWidget {
  const PermissionSettingsScreen({super.key});

  @override
  State<PermissionSettingsScreen> createState() => _PermissionSettingsScreenState();
}

class _PermissionSettingsScreenState extends State<PermissionSettingsScreen> {
  Future<AttendanceLocationReliabilitySnapshot>? _future;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _future = LocationService.snapshotAttendanceLocationReliability();
    });
  }

  Future<void> _onRefresh() async {
    _reload();
    await _future;
  }

  Future<void> _openFixFlow(BuildContext context) async {
    await LocationService.requestAttendanceLocationReliabilitySetup(context);
    if (mounted) _reload();
  }

  Future<void> _showStepsSheet(
    BuildContext context,
    LocationPermissionCatalogRow row,
  ) async {
    final steps = Platform.isAndroid ? row.stepsAndroid : row.stepsIos;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final theme = Theme.of(ctx);
        final bottom = MediaQuery.paddingOf(ctx).bottom;
        final maxH = MediaQuery.sizeOf(ctx).height * 0.52;
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 8, 20, 16 + bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                row.title,
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                'Where to enable',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxH),
                child: SingleChildScrollView(
                  child: SelectableText(
                    steps,
                    style: theme.textTheme.bodyMedium?.copyWith(height: 1.45),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Close'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () async {
                        await openAppSettings();
                        if (ctx.mounted) Navigator.pop(ctx);
                      },
                      child: const Text('App settings'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Permission settings'),
        centerTitle: true,
        backgroundColor: theme.colorScheme.surface,
        foregroundColor: theme.colorScheme.onSurface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _onRefresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: FutureBuilder<AttendanceLocationReliabilitySnapshot>(
        future: _future,
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Could not load permission status.',
                  style: theme.textTheme.bodyLarge,
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          final snapshot = snap.data!;
          final rows = locationPermissionCatalog(snapshot);
          final allOk = !snapshot.needsSetup;

          return RefreshIndicator(
            onRefresh: _onRefresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: allOk
                            ? theme.colorScheme.primaryContainer.withOpacity(0.55)
                            : theme.colorScheme.errorContainer.withOpacity(0.45),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: allOk
                              ? theme.colorScheme.primary.withOpacity(0.25)
                              : theme.colorScheme.error.withOpacity(0.2),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            allOk ? Icons.check_circle_rounded : Icons.info_rounded,
                            color: allOk
                                ? theme.colorScheme.primary
                                : theme.colorScheme.error,
                            size: 28,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  allOk
                                      ? 'All set'
                                      : 'Action needed for background location',
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  allOk
                                      ? 'These permissions look good for attendance, visits, and tracking when the app is not on screen.'
                                      : 'Enable the items marked “Not enabled” so your location can still sync when the app is in the background, closed from recents, or the phone is asleep (where the OS allows it).',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    height: 1.4,
                                    color: theme.colorScheme.onSurface.withOpacity(0.85),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (!allOk)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                      child: FilledButton.icon(
                        onPressed: () => unawaited(_openFixFlow(context)),
                        icon: const Icon(Icons.auto_fix_high_rounded),
                        label: const Text('Fix permissions with prompts'),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ),
                  ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final row = rows[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _PermissionTile(
                            row: row,
                            onTapDetails: () => unawaited(_showStepsSheet(context, row)),
                          ),
                        );
                      },
                      childCount: rows.length,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    required this.row,
    required this.onTapDetails,
  });

  final LocationPermissionCatalogRow row;
  final VoidCallback onTapDetails;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ok = row.enabled;

    return Material(
      color: theme.colorScheme.surface,
      elevation: 0.5,
      shadowColor: theme.colorScheme.shadow.withOpacity(0.12),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTapDetails,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: ok
                          ? theme.colorScheme.primary.withOpacity(0.12)
                          : theme.colorScheme.error.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      ok ? Icons.verified_outlined : Icons.warning_amber_rounded,
                      color: ok ? theme.colorScheme.primary : theme.colorScheme.error,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          row.title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          row.subtitle,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: ok
                          ? theme.colorScheme.primary.withOpacity(0.14)
                          : theme.colorScheme.error.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: Text(
                        ok ? 'Enabled' : 'Not enabled',
                        style: theme.textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: ok ? theme.colorScheme.primary : theme.colorScheme.error,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(
                    'Where to enable',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.open_in_new_rounded,
                    size: 16,
                    color: theme.colorScheme.primary,
                  ),
                  const Spacer(),
                  Icon(
                    Icons.keyboard_arrow_up_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurfaceVariant.withOpacity(0.7),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
