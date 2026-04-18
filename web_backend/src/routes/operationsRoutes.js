const express = require('express');
const {
  listAttendance,
  getDailyAttendance,
  checkIn,
  checkOut,
  markStatus,
  bulkMarkStatus,
} = require('../controllers/attendanceController');
const { listExpenses, createExpense, deleteExpense } = require('../controllers/expenseController');
const { listLeaves, createLeave, updateLeaveStatus } = require('../controllers/leaveController');
const { listNotifications, markNotificationRead } = require('../controllers/notificationController');
const { optimizeRoute } = require('../controllers/routeOptimizeController');
const { listAuditLogs } = require('../controllers/auditController');
const { listCompanyVisitsForOps, getCompanyVisitByIdForOps } = require('../controllers/companyVisitOpsController');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();

router.get('/notifications', auth, authorizeRole('admin'), listNotifications);
router.patch('/notifications/:id/read', auth, authorizeRole('admin'), markNotificationRead);

router.get('/attendance', auth, authorizeRole('admin'), listAttendance);
router.get('/attendance/daily', auth, authorizeRole('admin'), getDailyAttendance);
router.post('/attendance/check-in', auth, authorizeRole('admin'), checkIn);
router.post('/attendance/check-out', auth, authorizeRole('admin'), checkOut);
router.post('/attendance/mark', auth, authorizeRole('admin'), markStatus);
router.post('/attendance/mark-bulk', auth, authorizeRole('admin'), bulkMarkStatus);
router.get('/leaves', auth, authorizeRole('admin'), listLeaves);
router.post('/leaves', auth, authorizeRole('admin'), createLeave);
router.patch('/leaves/:id/status', auth, authorizeRole('admin'), updateLeaveStatus);

router.get('/expenses', auth, authorizeRole('admin'), listExpenses);
router.post('/expenses', auth, authorizeRole('admin'), createExpense);
router.delete('/expenses/:id', auth, authorizeRole('admin'), deleteExpense);

router.post('/route-optimize', auth, authorizeRole('admin'), optimizeRoute);
router.get('/audit-logs', auth, authorizeRole('admin'), listAuditLogs);
router.get('/company-visits/:id', auth, authorizeRole('admin'), getCompanyVisitByIdForOps);
router.get('/company-visits', auth, authorizeRole('admin'), listCompanyVisitsForOps);

module.exports = router;
