const AttendanceAlarm = require('../models/AttendanceAlarm');

function clampMinutes(m) {
  const n = Math.round(Number(m));
  if (!Number.isFinite(n)) return 9 * 60;
  return Math.max(0, Math.min(24 * 60 - 1, n));
}

function defaultPayload() {
  return {
    checkInEnabled: false,
    checkOutEnabled: false,
    checkInMinutes: 9 * 60,
    checkOutMinutes: 18 * 60,
    timingsHistory: [],
  };
}

exports.getMyAlarm = async (req, res) => {
  try {
    const userId = req.user._id;
    const doc = await AttendanceAlarm.findOne({ userId }).lean();
    if (!doc) {
      return res.json({ success: true, data: defaultPayload() });
    }
    return res.json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load attendance alarms',
      error: error.message,
    });
  }
};

exports.putMyAlarm = async (req, res) => {
  try {
    const userId = req.user._id;
    const body = req.body || {};
    const checkInEnabled = body.checkInEnabled === true;
    const checkOutEnabled = body.checkOutEnabled === true;
    const checkInMinutes = body.checkInMinutes != null ? clampMinutes(body.checkInMinutes) : 9 * 60;
    const checkOutMinutes =
      body.checkOutMinutes != null ? clampMinutes(body.checkOutMinutes) : 18 * 60;

    const snapshot = {
      at: new Date(),
      checkInMinutes,
      checkOutMinutes,
      checkInEnabled,
      checkOutEnabled,
    };

    const doc = await AttendanceAlarm.findOneAndUpdate(
      { userId },
      {
        $set: {
          checkInEnabled,
          checkOutEnabled,
          checkInMinutes,
          checkOutMinutes,
        },
        $push: {
          timingsHistory: {
            $each: [snapshot],
            $slice: -100,
          },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return res.json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to save attendance alarms',
      error: error.message,
    });
  }
};
