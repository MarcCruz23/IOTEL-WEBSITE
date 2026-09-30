const sharp = require('sharp');

// Decode and re-encode uploads so stored images contain pixels, not extra
// metadata or an arbitrary file with an image signature. Bound decompression.
async function normalizeImage(bytes, { avatar = false } = {}) {
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('INVALID_IMAGE');
    const image = sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error('INVALID_IMAGE');
    const result = await image.rotate().resize(avatar ? 256 : 2400, avatar ? 256 : 2400,
        { fit: avatar ? 'cover' : 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    if (result.length > (avatar ? 200000 : 3000000)) throw new Error('IMAGE_TOO_LARGE');
    return result;
}
module.exports = { normalizeImage };
