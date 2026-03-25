const crypto = require('crypto');

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function hashPass(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

const MIME_TYPES = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
};

const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];

function getMimeType(ext) {
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

module.exports = { genId, hashPass, ALLOWED_EXTENSIONS, getMimeType };
