const cloudinary = require('cloudinary').v2;

let isCloudinaryConfigured = false;

if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
  isCloudinaryConfigured = true;
  console.log('[CLOUDINARY] Configured via CLOUDINARY_URL env var.');
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  isCloudinaryConfigured = true;
  console.log('[CLOUDINARY] Configured via explicit API credentials.');
} else {
  console.log('[CLOUDINARY] Environment variables not set. Media fallback enabled.');
}

/**
 * Upload base64 or Data URL to Cloudinary
 * @param {string} fileStr - Base64 or Data URL string
 * @param {string} folder - Destination folder on Cloudinary
 * @returns {Promise<string>} Secure HTTPS Cloudinary URL or original string
 */
async function uploadMedia(fileStr, folder = 'whatsapp_clone') {
  if (!fileStr || !isCloudinaryConfigured) {
    return fileStr; // Return as-is if Cloudinary is not configured
  }

  // Check if already a web URL
  if (typeof fileStr === 'string' && (fileStr.startsWith('http://') || fileStr.startsWith('https://'))) {
    return fileStr;
  }

  try {
    const result = await cloudinary.uploader.upload(fileStr, {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' } // Auto compression & format conversion (webp/jpg)
      ]
    });
    console.log(`[CLOUDINARY SUCCESS] Uploaded media ID: ${result.public_id} | URL: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    console.error('[CLOUDINARY ERROR] Upload failed:', err.message);
    return fileStr; // Fallback to original string if upload fails
  }
}

module.exports = {
  uploadMedia,
  isCloudinaryConfigured
};
