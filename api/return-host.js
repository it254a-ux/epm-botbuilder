const { getDb } = require('./_lib/db');
const A = require('./_lib/auth');
const S = require('./_lib/site-settings');

// GET /api/return-host?host=elitetraders.example.com
//
// Used by the platform's main domain after a Deriv login: "may I send this sign-in
// code back to that host?" We say yes ONLY for an active FREE site that lives under
// PLATFORM_ROOT_DOMAIN -- i.e. a site served by this very deployment. Custom domains
// are never bounced to (they are registered with Deriv directly), and an arbitrary host
// can never receive a code, so this cannot be used as an open redirect.
module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ ok: false });
    if (!A.onPlatformHost(req, 'strict')) return res.status(404).json({ ok: false });

    const root = S.normalizeHost(process.env.PLATFORM_ROOT_DOMAIN);
    const host = S.normalizeHost(req.query.host);
    if (!root || !host || host === root || !host.endsWith(`.${root}`) || !S.sanitizeDomain(host)) {
        return res.status(200).json({ ok: false });
    }
    try {
        const rows = await getDb()`SELECT 1 FROM sites WHERE domain = ${host} AND plan = 'free' AND status = 'active' LIMIT 1`;
        return res.status(200).json({ ok: rows.length > 0 });
    } catch (err) {
        console.error('return-host error:', err);
        return res.status(200).json({ ok: false });
    }
};
