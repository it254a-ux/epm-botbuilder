const { getDb } = require('./_lib/db');

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_XML_LENGTH = 200000; // ~200KB, generous for a bot strategy file

const CONTRACT_TYPE_OPTIONS = [
    'Accumulators',
    'Rise/Fall',
    'Matches/Differs',
    'Over/Under',
    'Even/Odd',
    'Multiplier',
    'Other',
];

// Plain Vercel serverless function handler (CommonJS, matching generate-bot.js).
//
// GET  /api/bots  -> public, returns the bot list WITHOUT xml_content (keeps
//                    the payload small; the full bot is fetched individually
//                    via /api/bots/:id when the user clicks "Load Bot").
// POST /api/bots  -> admin only, protected by the x-admin-password header,
//                    checked against the ADMIN_PASSWORD environment variable.
module.exports = async function handler(req, res) {
    let sql;
    try {
        sql = getDb();
    } catch (err) {
        console.error('db init error:', err);
        res.status(500).json({ error: (err && err.message) || 'Database is not configured' });
        return;
    }

    if (req.method === 'GET') {
        try {
            const bots = await sql`
                SELECT id, name, description, market, risk_level, contract_type, created_at
                FROM free_bots
                ORDER BY created_at DESC
            `;
            res.status(200).json({ bots });
        } catch (err) {
            console.error('list bots error:', err);
            res.status(500).json({ error: 'Failed to load bots' });
        }
        return;
    }

    if (req.method === 'POST') {
        const adminPassword = process.env.ADMIN_PASSWORD;
        const providedPassword = req.headers['x-admin-password'];

        if (!adminPassword) {
            res.status(500).json({ error: 'ADMIN_PASSWORD is not set in environment variables' });
            return;
        }
        if (!providedPassword || providedPassword !== adminPassword) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        try {
            const body = req.body || {};
            const name = String(body.name || '').trim();
            const description = String(body.description || '').trim();
            const market = String(body.market || '').trim();
            const risk_level = String(body.risk_level || '').trim();
            const xml_content = String(body.xml_content || '');
            const contract_type_raw = String(body.contract_type || '').trim();
            const contract_type = CONTRACT_TYPE_OPTIONS.includes(contract_type_raw)
                ? contract_type_raw
                : 'Other';

            if (!name || !description || !market || !risk_level || !xml_content) {
                res.status(400).json({
                    error: 'name, description, market, risk_level, and xml_content are all required',
                });
                return;
            }
            if (name.length > MAX_NAME_LENGTH) {
                res.status(400).json({ error: `name is too long (max ${MAX_NAME_LENGTH} characters)` });
                return;
            }
            if (description.length > MAX_DESCRIPTION_LENGTH) {
                res.status(400).json({ error: `description is too long (max ${MAX_DESCRIPTION_LENGTH} characters)` });
                return;
            }
            if (xml_content.length > MAX_XML_LENGTH) {
                res.status(400).json({ error: 'xml_content is too large (max ~200KB)' });
                return;
            }
            if (!xml_content.trim().startsWith('<')) {
                res.status(400).json({ error: 'xml_content does not look like a valid XML file' });
                return;
            }

            const [bot] = await sql`
                INSERT INTO free_bots (name, description, market, risk_level, xml_content, contract_type)
                VALUES (${name}, ${description}, ${market}, ${risk_level}, ${xml_content}, ${contract_type})
                RETURNING id, name, description, market, risk_level, contract_type, created_at
            `;

            res.status(201).json({ bot });
        } catch (err) {
            console.error('create bot error:', err);
            res.status(500).json({ error: 'Failed to save bot' });
        }
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
