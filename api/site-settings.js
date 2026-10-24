const { getDb } = require('./_lib/db');
const { getFlag } = require('./_lib/app-flags');
const { normalizeHost, parsePlatformHosts, decide, isLocalHost } = require('./_lib/site-settings');

// GET /api/site-settings
// Public. Returns the branding + support contacts for the domain being visited.
// Only public fields are ever selected -- no owner, no status internals.
//
//   { kind: 'platform' }                 -> use the build-time EPM defaults (your own site)
//   { kind: 'site', site: {...} }        -> an operator's site
//   { kind: 'unconfigured', reason }     -> domain not set up / suspended
//
// PLATFORM_HOSTS (env, comma-separated) lists YOUR domains, e.g.
//   executiveprimemarkets.site,www.executiveprimemarkets.site
// While it is unset, unknown hosts are treated as the platform exactly like
// today, so deploying this does not change the live site.
module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // GET /api/site-settings?flag=forced_real -> { on: true|false }: an admin switch (see the Admin page).
    // If the database cannot be reached the switch keeps its normal value, so the site looks the same as always.
    if (req.query && req.query.flag === 'forced_real') {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=2');
        try {
            res.status(200).json({ on: await getFlag(getDb(), 'forced_real') });
        } catch (err) {
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({ on: true });
        }
        return;
    }

    // ?host= is for local testing only; production always trusts the request host.
    const override = process.env.ALLOW_HOST_OVERRIDE === '1' ? req.query.host : '';
    const host = normalizeHost(override || req.headers['x-forwarded-host'] || req.headers.host);
    const platformHosts = parsePlatformHosts(process.env.PLATFORM_HOSTS);
    const isPlatformHost = platformHosts.includes(host) || isLocalHost(host);

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');

    let row = null;
    try {
        const sql = getDb();
        const candidates = host.startsWith('www.') ? [host, host.slice(4)] : [host, `www.${host}`];
        const rows = await sql`
            SELECT domain, name, primary_color, font, logo_url, whatsapp, phone,
                   support_email, telegram, status, plan, about, vision, mission
            FROM sites
            WHERE domain = ANY(${candidates})
            LIMIT 1
        `;
        row = rows[0] || null;
    } catch (err) {
        console.error('site-settings lookup error:', err);
        // Fail open ONLY for your own domains / legacy mode; never show the
        // platform's branding on someone else's domain because the DB hiccuped.
        if (platformHosts.length === 0 || isPlatformHost) {
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({ kind: 'platform' });
        } else {
            res.setHeader('Cache-Control', 'no-store');
            res.status(503).json({ kind: 'error' });
        }
        return;
    }

    res.status(200).json(decide({ host, row, platformHosts }));
};
