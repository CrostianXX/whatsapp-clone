const cloudinary = require('cloudinary').v2;

const cloudinaryUrl = process.env.CLOUDINARY_URL;

if (cloudinaryUrl) {
  console.log('[CLOUDINARY] Cloudinary URL provided. Media storage initialized.');
} else {
  console.log('[CLOUDINARY] CLOUDINARY_URL not set. Falling back to Data URL storage...');
}

/**
 * Uploads a base64 media file to Cloudinary (or returns original Data URL if unconfigured)
 * @param {string} fileBuffer - Base64 Data URL (e.g. data:image/png;base64,...)
 * @param {string} folder - Destination folder in Cloudinary
 * @returns {Promise<string>} - HTTPS Cloudinary URL or original base64 Data URL
 */
async function uploadMedia(fileBuffer, folder = 'whatsapp-clone-media') {
  if (!fileBuffer || typeof fileBuffer !== 'string') return fileBuffer;
  if (!cloudinaryUrl || !fileBuffer.startsWith('data:')) return fileBuffer;

  try {
    const uploadResponse = await cloudinary.uploader.upload(fileBuffer, {
      folder: folder,
      resource_type: 'auto'
    });
    return uploadResponse.secure_url;
  } catch (err) {
    console.error('[CLOUDINARY UPLOAD ERROR] Fallback to original Data URL:', err.message);
    return fileBuffer;
  }
}

module.exports = {
  cloudinary,
  uploadMedia
};
