const Company = require('../models/Company');
const Admin = require('../models/Admin');

async function getCompany(req, res, next) {
  try {
    const company = await Company.findOne({ adminId: req.admin._id });
    return res.json({ company });
  } catch (error) {
    return next(error);
  }
}

async function upsertCompany(req, res, next) {
  try {
    const payload = {
      name: req.body.name,
      address: req.body.address,
      phone: req.body.phone,
      email: req.body.email,
      adminId: req.admin._id,
    };

    const update = { ...payload };
    if (Array.isArray(req.body.branches)) {
      update.branches = req.body.branches
        .filter((b) => b && String(b.name || '').trim())
        .map((b) => ({
          name: String(b.name).trim(),
          code: String(b.code || '').trim(),
          address: String(b.address || '').trim(),
          phone: String(b.phone || '').trim(),
        }));
    }

    const company = await Company.findOneAndUpdate({ adminId: req.admin._id }, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    await Admin.findByIdAndUpdate(req.admin._id, { companySetupCompleted: true });
    return res.json({ company });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCompany,
  upsertCompany,
};
