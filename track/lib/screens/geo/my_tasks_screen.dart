// hrms/lib/screens/geo/my_tasks_screen.dart
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/config/app_route_observer.dart';
import 'package:track/models/task.dart';
import 'package:track/services/customer_service.dart';
import 'package:track/services/task_service.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/dashboard/dashboard_screen.dart';
import 'package:track/screens/geo/add_task_screen.dart';
import 'package:track/screens/geo/add_customer_screen.dart';
import 'package:track/screens/geo/arrived_screen.dart';
import 'package:track/screens/geo/completed_task_detail_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/screens/geo/task_detail_screen.dart';
import 'package:track/screens/visits/visits_screen.dart';
import 'package:intl/intl.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/task_brand_icon.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/services/auth_service.dart';

class MyTasksScreen extends StatefulWidget {
  final int? dashboardTabIndex;
  final void Function(int index)? onNavigateToIndex;

  const MyTasksScreen({
    super.key,
    this.dashboardTabIndex,
    this.onNavigateToIndex,
  });

  @override
  State<MyTasksScreen> createState() => _MyTasksScreenState();
}

class _MyTasksScreenState extends State<MyTasksScreen>
    with WidgetsBindingObserver, RouteAware {
  String? _loggedInUserId;
  List<Task> _tasks = [];
  bool _isLoading = true;
  String? _errorMessage;

  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _statusFilter = 'all';
  /// Selected calendar day for filtering by assignment / created date (`Task.assignedDate`).
  late DateTime _selectedAssignDate;

  /// Horizontal date strip: `pastDays` before today + today + rest (41 cells × 52pt).
  static const int _weekStripPastDays = 20;
  static const int _weekStripDayCount = 41;
  static const double _weekDayCellWidth = 52;
  final ScrollController _weekStripScrollController = ScrollController();

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
  static bool _sameCalendarDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  DateTime _assignedDayKey(Task t) {
    if (t.assignedDate != null) {
      return _dateOnly(t.assignedDate!);
    }
    return _dateOnly(t.expectedCompletionDate);
  }


  @override
  void initState() {
    super.initState();
    _selectedAssignDate = _dateOnly(DateTime.now());
    WidgetsBinding.instance.addObserver(this);
    _loadLoggedInUserId();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduleScrollWeekStripToDate(_dateOnly(DateTime.now()));
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route is PageRoute) {
      appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    _searchController.dispose();
    _weekStripScrollController.dispose();
    super.dispose();
  }

  DateTime _weekStripRangeStart() =>
      _dateOnly(DateTime.now()).subtract(const Duration(days: _weekStripPastDays));

  int? _indexInWeekStrip(DateTime day) {
    final start = _weekStripRangeStart();
    final idx = _dateOnly(day).difference(start).inDays;
    if (idx < 0 || idx >= _weekStripDayCount) return null;
    return idx;
  }

  void _scheduleScrollWeekStripToDate(DateTime day) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _scrollWeekStripDateToCenter(day);
    });
  }

  void _scrollWeekStripDateToCenter(DateTime day) {
    if (!_weekStripScrollController.hasClients) return;
    final idx = _indexInWeekStrip(day);
    if (idx == null) return;
    final viewport = _weekStripScrollController.position.viewportDimension;
    final maxExtent = _weekStripScrollController.position.maxScrollExtent;
    final cellCenter = idx * _weekDayCellWidth + _weekDayCellWidth / 2;
    final offset = (cellCenter - viewport / 2).clamp(0.0, maxExtent);
    _weekStripScrollController.jumpTo(offset);
  }

  @override
  void didPopNext() {
    if (mounted) {
      _fetchTasks();
    }
  }

  List<Task> get _filteredTasks {
    List<Task> list = _tasks.where((t) => _matchesStatusFilter(t.status)).toList();
    // Search: customer name, task name, taskId
    if (_searchQuery.trim().isNotEmpty) {
      final q = _searchQuery.trim().toLowerCase();
      list = list.where((t) {
        if (t.taskId.toLowerCase().contains(q)) return true;
        if (t.taskTitle.toLowerCase().contains(q)) return true;
        if (t.customer != null &&
            t.customer!.customerName.toLowerCase().contains(q)) {
          return true;
        }
        return false;
      }).toList();
    }
    final sel = _dateOnly(_selectedAssignDate);
    list = list.where((t) => _assignedDayKey(t) == sel).toList();
    return list;
  }

  bool _matchesStatusFilter(TaskStatus status) {
    switch (_statusFilter) {
      case 'all':
        return true;
      case 'approved':
        return status == TaskStatus.approved;
      case 'pending':
        return status == TaskStatus.pending ||
            status == TaskStatus.exitedOnArrival ||
            status == TaskStatus.exited ||
            status == TaskStatus.hold ||
            status == TaskStatus.holdOnArrival ||
            status == TaskStatus.assigned;
      case 'rejected':
        return status == TaskStatus.rejected;
      case 'completed':
        return status == TaskStatus.completed;
      default:
        return true;
    }
  }

  void _refreshFilters() {
    setState(() {
      _searchQuery = _searchController.text;
    });
  }

  bool get _hasActiveFilters =>
      _statusFilter != 'all' || _searchQuery.trim().isNotEmpty;

  String _statusFilterDisplayName(String code) {
    switch (code) {
      case 'all':
        return 'All';
      case 'approved':
        return 'Approved';
      case 'pending':
        return 'Pending';
      case 'rejected':
        return 'Rejected';
      case 'completed':
        return 'Completed';
      default:
        return code;
    }
  }

  List<DropdownMenuItem<String>> _taskStatusDropdownItems() {
    return const [
      DropdownMenuItem<String>(value: 'all', child: Text('All')),
      DropdownMenuItem<String>(value: 'approved', child: Text('Approved')),
      DropdownMenuItem<String>(value: 'pending', child: Text('Pending')),
      DropdownMenuItem<String>(value: 'rejected', child: Text('Rejected')),
      DropdownMenuItem<String>(value: 'completed', child: Text('Completed')),
    ];
  }

  String _appliedFiltersSummary() {
    final parts = <String>[];
    if (_statusFilter != 'all') {
      parts.add(_statusFilterDisplayName(_statusFilter));
    }
    final q = _searchQuery.trim();
    if (q.isNotEmpty) {
      parts.add('Search: "$q"');
    }
    return parts.isEmpty ? 'Showing all tasks for this day' : parts.join(' · ');
  }

  String _sheetFiltersSummary(String statusCode, String searchText) {
    final parts = <String>[];
    if (statusCode != 'all') {
      parts.add(_statusFilterDisplayName(statusCode));
    }
    final q = searchText.trim();
    if (q.isNotEmpty) {
      parts.add('Search: "$q"');
    }
    return parts.isEmpty ? 'No extra filters — all statuses' : parts.join(' · ');
  }

  void _clearAllTaskFilters() {
    setState(() {
      _statusFilter = 'all';
      _searchController.clear();
      _searchQuery = '';
    });
  }

  Widget _buildAppliedFiltersBanner() {
    if (!_hasActiveFilters) return const SizedBox.shrink();
    return Material(
      color: AppColors.primary.withValues(alpha: 0.22),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.filter_alt_rounded, color: AppColors.primary, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Filters applied',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _appliedFiltersSummary(),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.black.withValues(alpha: 0.72),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () async {
                await _fetchTasks();
                if (mounted) setState(() {});
              },
              icon: const Icon(Icons.refresh_rounded, color: Colors.black87),
              tooltip: 'Refresh tasks',
            ),
            TextButton(
              onPressed: _clearAllTaskFilters,
              child: const Text(
                'CLEAR',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: Colors.black,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openTaskFiltersBottomSheet() {
    var draftStatus = _statusFilter;
    final draftSearchController = TextEditingController(text: _searchController.text);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) {
        final bottomPad = MediaQuery.paddingOf(ctx).bottom;
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: StatefulBuilder(
            builder: (ctx, setModal) {
              return Container(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(ctx).height * 0.88,
                ),
                color: Colors.white,
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(20, 8, 20, 16 + bottomPad),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Filters',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                                color: AppColors.primary,
                              ),
                            ),
                          ),
                          IconButton(
                            onPressed: () => Navigator.pop(ctx),
                            icon: const Icon(Icons.close_rounded, color: Colors.black87),
                          ),
                        ],
                      ),
                      Text(
                        'Filters applied',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _sheetFiltersSummary(draftStatus, draftSearchController.text),
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.black.withValues(alpha: 0.65),
                        ),
                      ),
                      const SizedBox(height: 16),
                      InputDecorator(
                        decoration: InputDecoration(
                          labelText: 'Task status',
                          labelStyle: TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w800,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.black38),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                              color: Colors.black.withValues(alpha: 0.35),
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.black, width: 2),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            isExpanded: true,
                            value: draftStatus,
                            items: _taskStatusDropdownItems(),
                            onChanged: (v) {
                              if (v == null) return;
                              setModal(() => draftStatus = v);
                            },
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: draftSearchController,
                        decoration: InputDecoration(
                          hintText: 'Customer name, task name, task ID',
                          prefixIcon: Icon(Icons.search_rounded, color: AppColors.primary),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                              color: Colors.black.withValues(alpha: 0.35),
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Colors.black, width: 2),
                          ),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        onChanged: (_) => setModal(() {}),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          IconButton(
                            style: IconButton.styleFrom(
                              backgroundColor: AppColors.primary.withValues(alpha: 0.4),
                              foregroundColor: Colors.black,
                              side: const BorderSide(color: Colors.black26),
                            ),
                            onPressed: () async {
                              await _fetchTasks();
                              if (ctx.mounted) setModal(() {});
                            },
                            icon: const Icon(Icons.refresh_rounded),
                            tooltip: 'Refresh tasks',
                          ),
                          const Spacer(),
                          TextButton(
                            onPressed: () {
                              setModal(() {
                                draftStatus = 'all';
                                draftSearchController.clear();
                              });
                            },
                            child: const Text(
                              'CLEAR',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                color: Colors.black87,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.black,
                              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                            ),
                            onPressed: () {
                              Navigator.pop(ctx);
                              if (!mounted) return;
                              setState(() {
                                _statusFilter = draftStatus;
                                _searchController.text = draftSearchController.text;
                                _searchQuery = draftSearchController.text;
                              });
                            },
                            child: const Text(
                              'Apply',
                              style: TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    ).whenComplete(draftSearchController.dispose);
  }

  Widget _buildHeroAndWeekStrip() {
    final start = _weekStripRangeStart();
    final days = List.generate(
      _weekStripDayCount,
      (i) => start.add(Duration(days: i)),
    );
    final sel = _dateOnly(_selectedAssignDate);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.vertical(bottom: Radius.circular(20)),
          ),
          padding: const EdgeInsets.fromLTRB(12, 8, 4, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    onPressed: () => _openAppMenu(context),
                    icon: Icon(
                      Icons.menu_rounded,
                      color: Colors.black.withValues(alpha: 0.85),
                    ),
                    tooltip: 'Menu',
                  ),
                  const Expanded(
                    child: Text(
                      'YOUR TASKS',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.black,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.35,
                      ),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TextButton.icon(
                    onPressed: () async {
                      final now = DateTime.now();
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: _selectedAssignDate,
                        firstDate: now.subtract(const Duration(days: 365)),
                        lastDate: now.add(const Duration(days: 365)),
                      );
                      if (picked != null && mounted) {
                        final d = _dateOnly(picked);
                        setState(() => _selectedAssignDate = d);
                        _scheduleScrollWeekStripToDate(d);
                      }
                    },
                    icon: Icon(
                      Icons.calendar_month_rounded,
                      color: Colors.black.withValues(alpha: 0.82),
                      size: 20,
                    ),
                    label: Text(
                      _sameCalendarDay(_selectedAssignDate, DateTime.now())
                          ? 'Today'
                          : DateFormat('dd MMM').format(_selectedAssignDate),
                      style: const TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (_loggedInUserId != null && _loggedInUserId!.isNotEmpty)
                    IconButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) =>
                                AddTaskScreen(userId: _loggedInUserId!),
                          ),
                        ).then((_) => _fetchTasks());
                      },
                      icon: Icon(
                        Icons.add_circle_outline,
                        color: Colors.black.withValues(alpha: 0.82),
                      ),
                      tooltip: 'Add task',
                    ),
                  IconButton(
                    onPressed: _openTaskFiltersBottomSheet,
                    icon: Icon(
                      _hasActiveFilters
                          ? Icons.filter_alt
                          : Icons.filter_alt_outlined,
                      color: Colors.black.withValues(alpha: 0.82),
                    ),
                    tooltip: 'Filters',
                  ),
                ],
              ),
            ],
          ),
        ),
        Transform.translate(
          offset: const Offset(0, -30),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Material(
              elevation: 10,
              shadowColor: Colors.black45,
              borderRadius: BorderRadius.circular(18),
              color: Colors.white,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                child: SingleChildScrollView(
                  controller: _weekStripScrollController,
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final day in days)
                        SizedBox(
                          width: _weekDayCellWidth,
                          child: _weekDayCell(
                            day,
                            sel,
                            onSelect: () {
                              final d = _dateOnly(day);
                              setState(() => _selectedAssignDate = d);
                              _scheduleScrollWeekStripToDate(d);
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 2),
      ],
    );
  }

  Widget _weekDayCell(
    DateTime day,
    DateTime sel, {
    required VoidCallback onSelect,
  }) {
    final dOnly = _dateOnly(day);
    final isSel = dOnly == sel;
    final label = DateFormat('EEE').format(day).substring(0, 2).toUpperCase();
    return InkWell(
      onTap: onSelect,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: isSel ? AppColors.primary : Colors.black45,
              ),
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: isSel ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: isSel ? Colors.black : Colors.black87,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed && mounted) {
      _refreshWhenReturning();
    }
  }

  void _refreshWhenReturning() {
    if (_loggedInUserId != null || _tasks.isNotEmpty) {
      _fetchTasks();
    }
  }

  Future<void> _loadLoggedInUserId() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userString = prefs.getString('user');
      if (userString == null || userString.isEmpty) {
        if (mounted) {
          setState(() {
            _isLoading = false;
            _errorMessage = 'User not logged in.';
          });
        }
        return;
      }
      Map<String, dynamic>? userData;
      try {
        userData = jsonDecode(userString) as Map<String, dynamic>?;
      } catch (_) {
        if (mounted) {
          setState(() {
            _isLoading = false;
            _errorMessage = 'Invalid user data.';
          });
        }
        return;
      }
      if (userData == null) {
        if (mounted) {
          setState(() {
            _isLoading = false;
            _errorMessage = 'User not logged in.';
          });
        }
        return;
      }
      final userId = userData['_id'] ?? userData['id'] ?? userData['userId'];
      if (userId != null) {
        if (mounted) {
          setState(() {
            _loggedInUserId = userId is String ? userId : userId.toString();
          });
        }
      }
      await _fetchTasks();
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to load: ${e.toString()}';
        });
      }
    }
  }

  Future<void> _fetchTasks() async {
    if (!mounted) return;
    try {
      List<Task> assignedTasks;
      if (_loggedInUserId != null && _loggedInUserId!.isNotEmpty) {
        assignedTasks = await TaskService().getAssignedTasks(_loggedInUserId!);
      } else {
        assignedTasks = await TaskService().getAllTasks();
      }

      if (!mounted) return;
      List<Task> tasksWithCustomer = [];
      for (var task in assignedTasks) {
        if (task.customerId != null && task.customerId!.isNotEmpty) {
          try {
            final customer = await CustomerService().getCustomerById(
              task.customerId!,
            );
            tasksWithCustomer.add(task.copyWith(customer: customer));
          } catch (_) {
            tasksWithCustomer.add(task);
          }
        } else {
          tasksWithCustomer.add(task);
        }
        if (!mounted) return;
      }

      if (mounted) {
        setState(() {
          _tasks = tasksWithCustomer;
          _isLoading = false;
          _errorMessage = null;
        });
        _scheduleScrollWeekStripToDate(_dateOnly(DateTime.now()));
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Failed to load tasks';
          _isLoading = false;
        });
        _scheduleScrollWeekStripToDate(_dateOnly(DateTime.now()));
      }
    }
  }

  void _openTaskFromList(Task task) {
    final isCompleted = task.status == TaskStatus.completed;
    if (isCompleted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => CompletedTaskDetailScreen(task: task),
        ),
      );
      return;
    }
    if (task.status == TaskStatus.arrived ||
        task.status == TaskStatus.holdOnArrival ||
        task.status == TaskStatus.reopenedOnArrival) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => ArrivedScreen(
            taskMongoId: task.id,
            taskId: task.taskId,
            task: task,
            totalDuration: Duration(
              seconds: task.tripDurationSeconds ?? 0,
            ),
            totalDistanceKm: task.tripDistanceKm ?? 0.0,
            isWithinGeofence: false,
            arrivalTime: task.arrivalTime ?? DateTime.now(),
            sourceLat: task.sourceLocation?.lat,
            sourceLng: task.sourceLocation?.lng,
            sourceAddress: task.sourceLocation?.address,
            destLat: task.destinationLocation?.lat,
            destLng: task.destinationLocation?.lng,
            destAddress: task.destinationLocation?.address,
            arrivalAtLat: task.arrivalLocation?.lat,
            arrivalAtLng: task.arrivalLocation?.lng,
            arrivalAtAddress: task.arrivalLocation?.displayAddress,
          ),
        ),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => TaskDetailScreen(task: task),
      ),
    );
  }

  void _navigateToIndex(int index) {
    if (widget.onNavigateToIndex != null) {
      widget.onNavigateToIndex!(index);
      return;
    }
    if (index == 1) return;
    final Widget target = switch (index) {
      0 => const DashboardScreen(),
      2 => const VisitsScreen(),
      _ => const MyTasksScreen(),
    };
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => target),
    );
  }

  Future<void> _logout() async {
    await AuthService().logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onAddTask: _loggedInUserId != null && _loggedInUserId!.isNotEmpty
          ? () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) =>
                      AddTaskScreen(userId: _loggedInUserId!),
                ),
              ).then((_) => _fetchTasks());
            }
          : null,
      onAddCustomer: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => const AddCustomerScreen(),
          ),
        ).then((_) => _refreshWhenReturning());
      },
      onProfile: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        ).then((_) => _refreshWhenReturning());
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ).then((_) => _refreshWhenReturning());
      },
      onLogout: _logout,
    );
  }

  static const List<IconData> _taskCardIcons = [
    Icons.assignment_rounded,
    Icons.task_alt_rounded,
    Icons.checklist_rounded,
    Icons.local_shipping_outlined,
    Icons.business_center_outlined,
    Icons.engineering_outlined,
    Icons.inventory_2_outlined,
    Icons.place_outlined,
  ];

  static const List<Color> _taskCardIconBgTints = [
    Color(0xFFE3F2FD),
    Color(0xFFE8F5E9),
    Color(0xFFFFF3E0),
    Color(0xFFF3E5F5),
    Color(0xFFE0F7FA),
    Color(0xFFFFEBEE),
    Color(0xFFECEFF1),
    Color(0xFFE8EAF6),
  ];

  IconData _taskCardIconFor(Task task) {
    final key = task.id ?? task.taskId;
    final i = key.hashCode.abs() % _taskCardIcons.length;
    return _taskCardIcons[i];
  }

  Color _taskCardIconBgFor(Task task) {
    final key = task.id ?? task.taskId;
    final i = key.hashCode.abs() % _taskCardIconBgTints.length;
    return _taskCardIconBgTints[i];
  }

  Color _taskCardIconFgFor(Task task) {
    final key = task.id ?? task.taskId;
    final i = key.hashCode.abs() % _taskCardIconBgTints.length;
    return [
      Colors.blue.shade700,
      Colors.green.shade700,
      Colors.orange.shade800,
      Colors.purple.shade700,
      Colors.cyan.shade700,
      Colors.red.shade700,
      Colors.blueGrey.shade700,
      Colors.indigo.shade700,
    ][i];
  }

  String _companyNameLine(Task task) {
    final c = task.customer;
    if (c == null) return '—';
    final company = c.companyName?.trim();
    if (company != null && company.isNotEmpty) return company;
    final name = c.customerName.trim();
    if (name.isNotEmpty) return name;
    return '—';
  }

  Color _getStatusChipColor(TaskStatus status) {
    switch (status) {
      case TaskStatus.pending:
        return Colors.orange.shade600;
      case TaskStatus.inProgress:
        return Colors.blue.shade600;
      case TaskStatus.arrived:
        return Colors.indigo.shade600;
      case TaskStatus.exited:
        return Colors.amber.shade700;
      case TaskStatus.exitedOnArrival:
        return Colors.orange.shade800;
      case TaskStatus.hold:
      case TaskStatus.holdOnArrival:
        return Colors.amber.shade700;
      case TaskStatus.reopenedOnArrival:
        return Colors.teal.shade600;
      case TaskStatus.completed:
        return Colors.green.shade600;
      case TaskStatus.waitingForApproval:
        return Colors.amber.shade600;
      case TaskStatus.assigned:
        return Colors.green.shade600;
      case TaskStatus.scheduled:
        return Colors.blue.shade600;
      case TaskStatus.approved:
      case TaskStatus.staffapproved:
        return Colors.teal.shade600;
      case TaskStatus.rejected:
        return Colors.red.shade600;
      case TaskStatus.reopened:
        return Colors.teal.shade600;
      case TaskStatus.cancelled:
        return Colors.grey.shade600;
      case TaskStatus.onlineReady:
        return Colors.grey.shade600;
    }
  }

  Widget _buildTasksErrorBody() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline_rounded, size: 48, color: Colors.red.shade300),
            const SizedBox(height: 16),
            Text(
              _errorMessage!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () {
                setState(() {
                  _errorMessage = null;
                  _isLoading = true;
                });
                _loadLoggedInUserId();
              },
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTasksListBody(ColorScheme colorScheme) {
    return _tasks.isEmpty
                            ? RefreshIndicator(
                                onRefresh: _fetchTasks,
                                child: SingleChildScrollView(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  child: SizedBox(
                                    height:
                                        MediaQuery.of(context).size.height *
                                        0.6,
                                    child: Center(
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          TaskBrandIcon(
                                            size: 80,
                                            color: colorScheme.onSurfaceVariant,
                                          ),
                                          const SizedBox(height: 12),
                                          Text(
                                            'No tasks assigned yet',
                                            style: TextStyle(
                                              fontSize: 16,
                                              color: colorScheme.onSurfaceVariant,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              )
                            : _filteredTasks.isEmpty
                            ? RefreshIndicator(
                                onRefresh: _fetchTasks,
                                child: SingleChildScrollView(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  child: SizedBox(
                                    height:
                                        MediaQuery.of(context).size.height *
                                        0.5,
                                    child: Center(
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                            Icons.filter_list_off,
                                            size: 64,
                                            color: colorScheme.onSurfaceVariant,
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            'No tasks match filters',
                                            style: TextStyle(
                                              fontSize: 14,
                                              color: colorScheme.onSurfaceVariant,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              )
                            : RefreshIndicator(
                                onRefresh: _fetchTasks,
                                child: ListView.builder(
                                  padding: const EdgeInsets.fromLTRB(
                                    12,
                                    4,
                                    12,
                                    12,
                                  ),
                                  itemCount: _filteredTasks.length,
                                  itemBuilder: (context, index) {
                                    final task = _filteredTasks[index];
                                    final isCompleted =
                                        task.status == TaskStatus.completed;
                                    final statusColor = _getStatusChipColor(
                                      task.status,
                                    );

                                    final showHoldActions =
                                        task.status == TaskStatus.hold ||
                                        task.status ==
                                            TaskStatus.holdOnArrival;

                                    return Container(
                                      margin: const EdgeInsets.only(
                                        bottom: 8,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius:
                                            BorderRadius.circular(14),
                                        border: Border.all(
                                          color: const Color(0xFFE0E0E0),
                                          width: 1,
                                        ),
                                      ),
                                      child: Padding(
                                        padding: const EdgeInsets.all(12),
                                        child: Opacity(
                                          opacity: isCompleted ? 0.7 : 1.0,
                                          child: Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Expanded(
                                                child: InkWell(
                                                  borderRadius:
                                                      BorderRadius.circular(
                                                    12,
                                                  ),
                                                  onTap: () =>
                                                      _openTaskFromList(task),
                                                  child: Padding(
                                                    padding:
                                                        const EdgeInsets.only(
                                                      right: 4,
                                                      bottom: 2,
                                                    ),
                                                    child: Row(
                                                      crossAxisAlignment:
                                                          CrossAxisAlignment
                                                              .start,
                                                      children: [
                                                        Container(
                                                          padding:
                                                              const EdgeInsets
                                                                  .all(10),
                                                          decoration:
                                                              BoxDecoration(
                                                            color:
                                                                _taskCardIconBgFor(
                                                              task,
                                                            ),
                                                            borderRadius:
                                                                BorderRadius
                                                                    .circular(
                                                              12,
                                                            ),
                                                          ),
                                                          child: Icon(
                                                            _taskCardIconFor(
                                                              task,
                                                            ),
                                                            color:
                                                                _taskCardIconFgFor(
                                                              task,
                                                            ),
                                                            size: 22,
                                                          ),
                                                        ),
                                                        const SizedBox(
                                                          width: 12,
                                                        ),
                                                        Expanded(
                                                          child: Column(
                                                            crossAxisAlignment:
                                                                CrossAxisAlignment
                                                                    .start,
                                                            children: [
                                                              Text(
                                                                task.taskTitle,
                                                                style:
                                                                    const TextStyle(
                                                                  fontSize: 15,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w700,
                                                                  color: Colors
                                                                      .black,
                                                                ),
                                                                maxLines: 2,
                                                                overflow:
                                                                    TextOverflow
                                                                        .ellipsis,
                                                              ),
                                                              const SizedBox(
                                                                height: 4,
                                                              ),
                                                              Text(
                                                                _companyNameLine(
                                                                  task,
                                                                ),
                                                                style:
                                                                    TextStyle(
                                                                  fontSize: 13,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                  color: Colors
                                                                      .grey
                                                                      .shade700,
                                                                ),
                                                                maxLines: 1,
                                                                overflow:
                                                                    TextOverflow
                                                                        .ellipsis,
                                                              ),
                                                              const SizedBox(
                                                                height: 6,
                                                              ),
                                                              Text(
                                                                task.status
                                                                    .displayName
                                                                    .toUpperCase(),
                                                                style:
                                                                    TextStyle(
                                                                  fontSize: 11,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w700,
                                                                  letterSpacing:
                                                                      0.4,
                                                                  color:
                                                                      statusColor,
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
                                              if (showHoldActions)
                                                Material(
                                                  color: AppColors.primary,
                                                  shape: const CircleBorder(),
                                                  child: InkWell(
                                                    customBorder:
                                                        const CircleBorder(),
                                                    onTap: () =>
                                                        _openTaskFromList(task),
                                                    child: const Padding(
                                                      padding: EdgeInsets.all(10),
                                                      child: Icon(
                                                        Icons.play_arrow_rounded,
                                                        color: Colors.black87,
                                                        size: 26,
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop();
        }
      },
      child: Builder(
        builder: (context) {
          final colorScheme = Theme.of(context).colorScheme;
          return Scaffold(
            backgroundColor: Colors.white,
            body: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeroAndWeekStrip(),
                  if (_errorMessage == null) ...[
                    _buildAppliedFiltersBanner(),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
                      child: Row(
                        children: [
                          Container(
                            width: 4,
                            height: 18,
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'YOUR QUEUE',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                              letterSpacing: 1.1,
                              color: colorScheme.onSurface,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  Expanded(
                    child: _isLoading
                        ? Align(
                            alignment: Alignment.topCenter,
                            child: Padding(
                              padding: const EdgeInsets.only(top: 72),
                              child: SizedBox(
                                width: 44,
                                height: 44,
                                child: CircularProgressIndicator(
                                  strokeWidth: 3.2,
                                  color: AppColors.primary,
                                ),
                              ),
                            ),
                          )
                        : _errorMessage != null
                            ? _buildTasksErrorBody()
                            : _buildTasksListBody(colorScheme),
                  ),
                ],
              ),
            ),
            bottomNavigationBar: OvalBottomNavBar(
              currentIndex: 1,
              onTap: _navigateToIndex,
            ),
          );
        },
      ),
    );
  }
}
