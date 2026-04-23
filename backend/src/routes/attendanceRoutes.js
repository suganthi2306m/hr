const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/authMiddleware');
const {
  checkIn,
  checkOut,
  getHistory,
  getShiftMeta,
  logPunchButtonClick,
} = require('../controllers/attendanceController');
const { getMyAlarm, putMyAlarm } = require('../controllers/attendanceAlarmController');

const router = express.Router();

router.use((req, _res, next) => {
  console.log(
    `[AttendancePunchDebug][backend][route] ${req.method} ${req.originalUrl} ` +
      `contentType=${req.headers['content-type'] || '-'} ip=${req.ip || '-'}`,
  );
  next();
});

const selfieDir = path.join(process.cwd(), '..', 'selfie');
if (!fs.existsSync(selfieDir)) fs.mkdirSync(selfieDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, selfieDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `attendance-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(
      file.mimetype,
    );
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

router.post('/checkin', protect, upload.single('selfie'), checkIn);
router.post('/checkout', protect, upload.single('selfie'), checkOut);
router.post('/check-in', protect, upload.single('selfie'), checkIn);
router.post('/check-out', protect, upload.single('selfie'), checkOut);
router.post('/punch-click-log', protect, express.json(), logPunchButtonClick);
router.get('/history', protect, getHistory);
router.get('/shift-meta', protect, getShiftMeta);
router.get('/alarms', protect, getMyAlarm);
router.put('/alarms', protect, express.json(), putMyAlarm);

module.exports = router;
