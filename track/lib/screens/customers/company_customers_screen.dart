import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:track/config/app_colors.dart';
import 'package:track/models/customer.dart';
import 'package:track/models/task.dart';
import 'package:track/navigation/main_shell_navigation.dart';
import 'package:track/screens/auth/login_screen.dart';
import 'package:track/screens/customers/customer_detail_tabs_screen.dart';
import 'package:track/screens/geo/add_customer_screen.dart';
import 'package:track/screens/geo/add_task_screen.dart';
import 'package:track/screens/geo/simple_task_info_screen.dart';
import 'package:track/screens/profile/profile_screen.dart';
import 'package:track/screens/settings/settings_screen.dart';
import 'package:track/services/auth_service.dart';
import 'package:track/services/customer_service.dart';
import 'package:track/services/task_service.dart';
import 'package:track/widgets/app_shell_navigation.dart';
import 'package:track/widgets/location_loader.dart';

/// Company customers (all) + tasks assigned to you (same API as My Tasks).
class CompanyCustomersScreen extends StatefulWidget {
  const CompanyCustomersScreen({super.key});

  @override
  State<CompanyCustomersScreen> createState() => _CompanyCustomersScreenState();
}

class _CompanyCustomersScreenState extends State<CompanyCustomersScreen>
    with MainShellSwipeNavigation {
  final CustomerService _customerService = CustomerService();
  final TaskService _taskService = TaskService();
  final TextEditingController _searchCtrl = TextEditingController();
  final TextEditingController _taskSearchCtrl = TextEditingController();
  final ScrollController _taskWeekScrollController = ScrollController();

  List<Customer> _customers = const [];
  List<Task> _tasks = const [];
  bool _loadingCustomers = true;
  bool _loadingTasks = false;
  String? _error;
  String? _userId;

  int _tabIndex = 0;
  bool _customerSortAsc = true;
  /// Task tab: same status groups as My Tasks (`all`, `approved`, `pending`, …).
  String _taskStatusFilter = 'all';
  late DateTime _selectedTaskDay;

  static const int _taskStripPastDays = 20;
  static const int _taskStripDayCount = 41;
  static const double _taskDayCellWidth = 52;

  @override
  void initState() {
    super.initState();
    _selectedTaskDay = _dateOnly(DateTime.now());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduleScrollTaskStripToDate(_dateOnly(DateTime.now()));
    });
    _bootstrap();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _taskSearchCtrl.dispose();
    _taskWeekScrollController.dispose();
    super.dispose();
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static bool _sameCalendarDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  DateTime _taskStripRangeStart() =>
      _dateOnly(DateTime.now()).subtract(const Duration(days: _taskStripPastDays));

  int? _indexInTaskStrip(DateTime day) {
    final start = _taskStripRangeStart();
    final idx = _dateOnly(day).difference(start).inDays;
    if (idx < 0 || idx >= _taskStripDayCount) return null;
    return idx;
  }

  void _scheduleScrollTaskStripToDate(DateTime day) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _scrollTaskStripDateToCenter(day);
    });
  }

  void _scrollTaskStripDateToCenter(DateTime day) {
    if (!_taskWeekScrollController.hasClients) return;
    final idx = _indexInTaskStrip(day);
    if (idx == null) return;
    final viewport = _taskWeekScrollController.position.viewportDimension;
    final maxExtent = _taskWeekScrollController.position.maxScrollExtent;
    final cellCenter = idx * _taskDayCellWidth + _taskDayCellWidth / 2;
    final offset = (cellCenter - viewport / 2).clamp(0.0, maxExtent);
    _taskWeekScrollController.jumpTo(offset);
  }

  DateTime _assignedDayKey(Task t) {
    if (t.assignedDate != null) {
      return _dateOnly(t.assignedDate!);
    }
    return _dateOnly(t.expectedCompletionDate);
  }

  Future<void> _readUserLine() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('user');
    if (raw != null && raw.isNotEmpty) {
      final map = jsonDecode(raw);
      if (map is Map) {
        final id = map['_id'] ?? map['id'] ?? map['userId'];
        if (id != null) {
          _userId = id is String ? id : id.toString();
        }
      }
    }
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loadingCustomers = true;
      _error = null;
    });
    try {
      await _readUserLine();
      final list = await _customerService.getAllCustomers();
      if (!mounted) return;
      setState(() {
        _customers = list;
        _loadingCustomers = false;
      });
      if (_tabIndex == 1) await _loadTasks();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loadingCustomers = false;
      });
    }
  }

  Future<void> _loadTasks() async {
    if (_userId == null || _userId!.isEmpty) {
      setState(() {
        _tasks = const [];
        _loadingTasks = false;
        _error = 'Not logged in.';
      });
      return;
    }
    setState(() {
      _loadingTasks = true;
      _error = null;
    });
    try {
      final list = await _taskService.getAssignedTasks(_userId!);
      if (!mounted) return;
      setState(() {
        _tasks = list;
        _loadingTasks = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loadingTasks = false;
      });
    }
  }

  bool _matchesTaskStatusFilter(TaskStatus status) {
    switch (_taskStatusFilter) {
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

  List<Task> get _visibleTasks {
    var list = _tasks.where((t) => _matchesTaskStatusFilter(t.status)).toList();
    final q = _taskSearchCtrl.text.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((t) {
        if (t.taskId.toLowerCase().contains(q)) return true;
        if (t.taskTitle.toLowerCase().contains(q)) return true;
        if (t.customer != null && t.customer!.customerName.toLowerCase().contains(q)) {
          return true;
        }
        if (t.customer?.companyName != null &&
            t.customer!.companyName!.toLowerCase().contains(q)) {
          return true;
        }
        return false;
      }).toList();
    }
    final sel = _dateOnly(_selectedTaskDay);
    return list.where((t) => _assignedDayKey(t) == sel).toList();
  }

  List<Customer> get _visibleCustomers {
    final q = _searchCtrl.text.trim().toLowerCase();
    final out = _customers.where((c) {
      final cn = (c.companyName ?? '').toLowerCase();
      final em = (c.emailId ?? c.email ?? '').toLowerCase();
      final ph = (c.customerNumber ?? '').toLowerCase();
      return c.customerName.toLowerCase().contains(q) || cn.contains(q) || em.contains(q) || ph.contains(q);
    }).toList();
    out.sort(
      (a, b) => _customerSortAsc
          ? a.customerName.toLowerCase().compareTo(b.customerName.toLowerCase())
          : b.customerName.toLowerCase().compareTo(a.customerName.toLowerCase()),
    );
    return out;
  }

  void _onTopAddPressed() {
    if (_tabIndex == 0) {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const AddCustomerScreen()),
      ).then((_) => _bootstrap());
      return;
    }
    if (_userId != null && _userId!.isNotEmpty) {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => AddTaskScreen(userId: _userId!)),
      ).then((_) => _loadTasks());
    }
  }

  Future<void> _openCustomerFilterSheet() async {
    var tempAsc = _customerSortAsc;
    final apply = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Customer filters',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              RadioListTile<bool>(
                value: true,
                groupValue: tempAsc,
                onChanged: (v) {
                  if (v == null) return;
                  setSheetState(() => tempAsc = v);
                },
                title: const Text('Sort name A → Z'),
              ),
              RadioListTile<bool>(
                value: false,
                groupValue: tempAsc,
                onChanged: (v) {
                  if (v == null) return;
                  setSheetState(() => tempAsc = v);
                },
                title: const Text('Sort name Z → A'),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () {
                    _searchCtrl.clear();
                    Navigator.pop(ctx, true);
                  },
                  icon: const Icon(Icons.clear_rounded),
                  label: const Text('Clear search'),
                ),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Apply'),
              ),
            ],
          ),
        ),
      ),
    );
    if (apply != true || !mounted) return;
    setState(() => _customerSortAsc = tempAsc);
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

  Future<void> _openTaskFiltersSheet() async {
    var draftStatus = _taskStatusFilter;
    final draftSearch = TextEditingController(text: _taskSearchCtrl.text);

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Task filters',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Colors.black,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          icon: const Icon(Icons.close_rounded, color: Colors.black),
                          tooltip: 'Close',
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: draftStatus,
                      decoration: const InputDecoration(
                        labelText: 'Status',
                        border: OutlineInputBorder(),
                        labelStyle: TextStyle(color: Colors.black),
                      ),
                      style: const TextStyle(color: Colors.black),
                      dropdownColor: Colors.white,
                      items: _taskStatusDropdownItems(),
                      onChanged: (v) => setSheetState(() => draftStatus = v ?? 'all'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: draftSearch,
                      decoration: const InputDecoration(
                        labelText: 'Search',
                        hintText: 'Task name, code, customer…',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.search_rounded),
                      ),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Apply'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (applied != true || !mounted) {
      draftSearch.dispose();
      return;
    }
    final q = draftSearch.text;
    draftSearch.dispose();
    if (!mounted) return;
    setState(() {
      _taskStatusFilter = draftStatus;
      _taskSearchCtrl.text = q;
    });
  }

  void _openAppMenu(BuildContext context) {
    showAppDrawerMenu(
      context,
      onAddTask: _userId != null && _userId!.isNotEmpty
          ? () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => AddTaskScreen(userId: _userId!)),
              ).then((_) => _bootstrap());
            }
          : null,
      onAddCustomer: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const AddCustomerScreen()),
        ).then((_) => _bootstrap());
      },
      onProfile: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        ).then((_) => _bootstrap());
      },
      onSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        ).then((_) => _bootstrap());
      },
      onLogout: _logout,
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

  void _onCustomerTap(Customer c) {
    final id = c.id;
    if (id == null || id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This customer has no id yet.')),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => CustomerDetailTabsScreen(customer: c),
      ),
    );
  }

  bool get _hasActiveTaskFilters =>
      _taskStatusFilter != 'all' || _taskSearchCtrl.text.trim().isNotEmpty;

  void _openTaskDetail(Task task) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => SimpleTaskInfoScreen(task: task),
      ),
    ).then((_) {
      if (mounted) _loadTasks();
    });
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

  Widget _taskCard(Task task) {
    final statusColor = _getStatusChipColor(task.status);
    final isCompleted = task.status == TaskStatus.completed;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: Colors.grey.shade300),
        ),
        child: InkWell(
          onTap: () => _openTaskDetail(task),
          borderRadius: BorderRadius.circular(14),
          child: Opacity(
            opacity: isCompleted ? 0.72 : 1,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: _taskCardIconBgFor(task),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      _taskCardIconFor(task),
                      color: _taskCardIconFgFor(task),
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.taskTitle,
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${task.taskId} · ${_companyNameLine(task)}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          task.status.displayName.toUpperCase(),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.35,
                            color: statusColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: Colors.grey.shade500),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _taskDayCell(DateTime day, DateTime selected) {
    final isSelected = _sameCalendarDay(day, selected);
    final label = DateFormat('EEE').format(day).substring(0, 2).toUpperCase();
    return InkWell(
      onTap: () {
        setState(() => _selectedTaskDay = _dateOnly(day));
        _scheduleScrollTaskStripToDate(_selectedTaskDay);
      },
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
                color: isSelected ? AppColors.primary : Colors.black45,
              ),
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: isSelected ? Colors.black : Colors.black87,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _taskDateStrip() {
    final start = _taskStripRangeStart();
    final days = List.generate(
      _taskStripDayCount,
      (i) => start.add(Duration(days: i)),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
      child: Material(
        elevation: 6,
        shadowColor: Colors.black26,
        borderRadius: BorderRadius.circular(18),
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          child: SingleChildScrollView(
            controller: _taskWeekScrollController,
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final day in days)
                  SizedBox(
                    width: _taskDayCellWidth,
                    child: _taskDayCell(day, _selectedTaskDay),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _customerCard(Customer c) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: Colors.grey.shade300),
        ),
        child: InkWell(
          onTap: () => _onCustomerTap(c),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.business_rounded, color: Colors.grey.shade900, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c.customerName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF1A1A1A),
                        ),
                      ),
                      if (c.companyName != null && c.companyName!.trim().isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          c.companyName!.trim(),
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade700, fontWeight: FontWeight.w500),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 6),
                      Text(
                        '${c.city} · ${c.pincode}',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: Colors.grey.shade500),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final busy = _tabIndex == 0 ? _loadingCustomers : _loadingTasks;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        bottom: false,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onHorizontalDragEnd: (details) => handleMainShellSwipe(details, 2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
                ),
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          onPressed: () => _openAppMenu(context),
                          icon: Icon(Icons.menu_rounded, color: Colors.black.withValues(alpha: 0.85)),
                          tooltip: 'Menu',
                        ),
                        const Expanded(
                          child: Text(
                            'CUSTOMERS',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.35,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: _onTopAddPressed,
                          icon: Icon(Icons.add_rounded, color: Colors.black.withValues(alpha: 0.85)),
                          tooltip: _tabIndex == 0 ? 'Add customer' : 'Add task',
                        ),
                        IconButton(
                          onPressed: () async {
                            if (_tabIndex == 0) {
                              await _bootstrap();
                            } else {
                              await _loadTasks();
                            }
                          },
                          icon: Icon(Icons.refresh_rounded, color: Colors.black.withValues(alpha: 0.85)),
                          tooltip: 'Refresh',
                        ),
                        IconButton(
                          onPressed: () {
                            if (_tabIndex == 1) {
                              _openTaskFiltersSheet();
                            } else {
                              _openCustomerFilterSheet();
                            }
                          },
                          icon: Icon(
                            _tabIndex == 1 && _hasActiveTaskFilters
                                ? Icons.filter_alt
                                : Icons.filter_alt_outlined,
                            color: Colors.black.withValues(alpha: 0.85),
                          ),
                          tooltip: 'Filter',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFF6F6F6),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => setState(() => _tabIndex = 0),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: BoxDecoration(
                              color: _tabIndex == 0 ? AppColors.primary : Colors.transparent,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text('Customer', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ),
                      Expanded(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () {
                            setState(() => _tabIndex = 1);
                            _scheduleScrollTaskStripToDate(_selectedTaskDay);
                            _loadTasks();
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: BoxDecoration(
                              color: _tabIndex == 1 ? AppColors.primary : Colors.transparent,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text('Tasks', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (_tabIndex == 1) _taskDateStrip(),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _tabIndex == 0 ? _searchCtrl : _taskSearchCtrl,
                        decoration: InputDecoration(
                          hintText: _tabIndex == 0
                              ? 'Search name / company'
                              : 'Task name, code, customer…',
                          isDense: true,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          suffixIcon: IconButton(
                            icon: const Icon(Icons.search_rounded),
                            onPressed: () {
                              if (_tabIndex == 0) {
                                setState(() {});
                              } else {
                                setState(() {});
                              }
                            },
                          ),
                        ),
                        onChanged: (_) {
                          if (_tabIndex == 1) setState(() {});
                        },
                        onSubmitted: (_) {
                          if (_tabIndex == 0) {
                            setState(() {});
                          } else {
                            setState(() {});
                          }
                        },
                      ),
                    ),
                    IconButton(
                      tooltip: 'Refresh',
                      onPressed: () async {
                        if (_tabIndex == 0) {
                          await _bootstrap();
                        } else {
                          await _loadTasks();
                        }
                      },
                      icon: const Icon(Icons.refresh_rounded),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _error != null && !busy
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_error!, textAlign: TextAlign.center),
                        ),
                      )
                    : busy
                        ? const Center(child: LocationLoader(size: 44))
                        : RefreshIndicator(
                            color: AppColors.primary,
                            onRefresh: () async {
                              if (_tabIndex == 0) {
                                await _bootstrap();
                              } else {
                                await _loadTasks();
                              }
                            },
                            child: _tabIndex == 0
                                ? (_visibleCustomers.isEmpty
                                    ? ListView(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        children: [
                                          const SizedBox(height: 80),
                                          Center(
                                            child: Text(
                                              _customers.isEmpty
                                                  ? 'No customers found for your company.'
                                                  : 'No customers match your search.',
                                            ),
                                          ),
                                        ],
                                      )
                                    : ListView.builder(
                                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        itemCount: _visibleCustomers.length,
                                        itemBuilder: (_, i) => _customerCard(_visibleCustomers[i]),
                                      ))
                                : (_tasks.isEmpty
                                    ? ListView(
                                        physics: const AlwaysScrollableScrollPhysics(),
                                        children: const [
                                          SizedBox(height: 80),
                                          Center(child: Text('No tasks assigned to you.')),
                                        ],
                                      )
                                    : _visibleTasks.isEmpty
                                        ? ListView(
                                            physics: const AlwaysScrollableScrollPhysics(),
                                            children: const [
                                              SizedBox(height: 80),
                                              Center(child: Text('No tasks match filters for this day.')),
                                            ],
                                          )
                                        : ListView.builder(
                                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                                            physics: const AlwaysScrollableScrollPhysics(),
                                            itemCount: _visibleTasks.length,
                                            itemBuilder: (_, i) => _taskCard(_visibleTasks[i]),
                                          )),
                          ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: OvalBottomNavBar(
        currentIndex: null,
        onTap: (i) => pushMainShellByIndex(context, i),
      ),
    );
  }
}
