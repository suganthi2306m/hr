const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/authMiddleware');
const {
  checkIn,
  checkOut,
  getHistory,
} = require('../controllers/attendanceController');

const router = express.Router();

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
router.get('/history', protect, getHistory);

module.exports = router;
