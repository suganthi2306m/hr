const fs = require('fs');
const cloudinary = require('cloudinary').v2;

function isConfigured() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function configureIfNeeded() {
  if (!isConfigured()) return false;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return true;
}

/** Cloudinary folder segments: alphanumeric + underscore, bounded length. */
function folderSegment(raw, maxLen = 80) {
  if (raw == null || raw === '') return 'unknown';
  const s = String(raw)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const out = s || 'unknown';
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

/**
 * Upload a multer-saved attendance selfie to Cloudinary.
 * Asset path: {companyName}/attendance/{userName}/attd_selfie_{label}_{timestamp}
 *
 * @param {string} localPath absolute path on disk
 * @param {{ companyName: string, userName: string, label: 'checkin' | 'checkout' }}} meta
 * @returns {Promise<string>} secure HTTPS URL
 */
async function uploadAttendanceSelfie(localPath, meta) {
  if (!configureIfNeeded()) {
    throw new Error('Cloudinary env not set (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)');
  }
  const company = folderSegment(meta.companyName);
  const user = folderSegment(meta.userName);
  const folder = `${company}/attendance/${user}`;
  const stamp = Date.now();
  const publicId = `attd_selfie_${meta.label}_${stamp}`;

  const result = await cloudinary.uploader.upload(localPath, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: false,
  });
  if (!result?.secure_url) {
    throw new Error('Cloudinary upload returned no secure_url');
  }
  return result.secure_url;
}

function safeUnlink(localPath) {
  try {
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  isConfigured,
  uploadAttendanceSelfie,
  safeUnlink,
};
