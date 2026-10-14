// Shared password check for the signal machine's protected endpoints.
// The password is SIGNALS_SECRET (Vercel environment variable). If it is not set, nothing is allowed.
const crypto = require('crypto');

function authorised(req) {
    const secret = process.env.SIGNALS_SECRET;
    if (!secret) return false; // never open by accident
    const headers = req.headers || {};
    const bearer = String(headers.authorization || '');
    const given = bearer.startsWith('Bearer ')
        ? bearer.slice(7)
        : String(headers['x-signals-key'] || (req.query && req.query.key) || '');
    const a = Buffer.from(given);
    const b = Buffer.from(secret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { authorised };
