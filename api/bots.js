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
// GET    /api/bots           -> public, bot list WITHOUT xml_content (keeps
//                                the payload small).
// GET    /api/bots?id=X      -> public, single bot WITH xml_content — used
//                                when the user clicks "Load Bot". Folded in
//                                here (rather than the separate api/bots/[id].js
//                                dynamic-route file) because Vercel was never
//                                actually invoking that file as a function —
//                                confirmed via server logs showing zero
//                                invocations for it, ever, while this file's
//                                own routes logged normally. Whatever the
//                                exact cause, a single already-proven-working
//                                file is a safer bet than debugging Vercel's
//                                bracket-route detection further.
// POST   /api/bots           -> admin only, protected by the x-admin-password
//                                header, checked against ADMIN_PASSWORD.
// PUT    /api/bots?id=X      -> admin only, same protection. Updates an
//                                existing bot's editable fields. xml_content
//                                is optional here (unlike POST, where it's
//                                required) — the admin panel only sends it
//                                when actually replacing the strategy file,
//                                so editing just the name/market/etc doesn't
//                                require re-uploading the XML.
// DELETE /api/bots?id=X      -> admin only, same protection.
module.exports = async function handler(req, res) {
    let sql;
    try {
        sql = getDb();
    } catch (err) {
        console.error('db init error:', err);
        res.status(500).json({ error: (err && err.message) || 'Database is not configured' });
        return;
    }

    const { id } = req.query;

    if (req.method === 'GET' && id !== undefined) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        if (Number.isNaN(Number(id))) {
            res.status(400).json({ error: 'Invalid bot id' });
            return;
        }
        try {
            const [bot] = await sql`
                SELECT id, name, description, market, risk_level, contract_type, xml_content, created_at
                FROM free_bots
                WHERE id = ${Number(id)}
            `;
            if (!bot) {
                res.status(404).json({ error: 'Bot not found' });
                return;
            }
            res.status(200).json({ bot });
        } catch (err) {
            console.error('get bot error:', err);
            res.status(500).json({ error: 'Failed to load bot' });
        }
        return;
    }

    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
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

    if (req.method === 'PUT') {
        const adminPassword = process.env.ADMIN_PASSWORD;
        const providedPassword = req.headers['x-admin-password'];

        if (!id || Number.isNaN(Number(id))) {
            res.status(400).json({ error: 'Invalid bot id' });
            return;
        }
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
            const contract_type_raw = String(body.contract_type || '').trim();
            const contract_type = CONTRACT_TYPE_OPTIONS.includes(contract_type_raw)
                ? contract_type_raw
                : 'Other';
            // Unlike POST, xml_content is optional — undefined/empty means
            // "leave the existing strategy file alone", not "clear it".
            const xml_content_provided = typeof body.xml_content === 'string' && body.xml_content.length > 0;
            const xml_content = xml_content_provided ? body.xml_content : undefined;

            if (!name || !description || !market || !risk_level) {
                res.status(400).json({
                    error: 'name, description, market, and risk_level are all required',
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
            if (xml_content_provided) {
                if (xml_content.length > MAX_XML_LENGTH) {
                    res.status(400).json({ error: 'xml_content is too large (max ~200KB)' });
                    return;
                }
                if (!xml_content.trim().startsWith('<')) {
                    res.status(400).json({ error: 'xml_content does not look like a valid XML file' });
                    return;
                }
            }

            // sql`` template calls can't conditionally omit a column, so branch
            // into two queries rather than building one dynamically (keeps the
            // parameterization the library handles safe, no string-built SQL).
            const [bot] = xml_content_provided
                ? await sql`
                    UPDATE free_bots
                    SET name = ${name},
                        description = ${description},
                        market = ${market},
                        risk_level = ${risk_level},
                        contract_type = ${contract_type},
                        xml_content = ${xml_content}
                    WHERE id = ${Number(id)}
                    RETURNING id, name, description, market, risk_level, contract_type, created_at
                `
                : await sql`
                    UPDATE free_bots
                    SET name = ${name},
                        description = ${description},
                        market = ${market},
                        risk_level = ${risk_level},
                        contract_type = ${contract_type}
                    WHERE id = ${Number(id)}
                    RETURNING id, name, description, market, risk_level, contract_type, created_at
                `;

            if (!bot) {
                res.status(404).json({ error: 'Bot not found' });
                return;
            }
            res.status(200).json({ bot });
        } catch (err) {
            console.error('update bot error:', err);
            res.status(500).json({ error: 'Failed to update bot' });
        }
        return;
    }

    if (req.method === 'DELETE') {
        const adminPassword = process.env.ADMIN_PASSWORD;
        const providedPassword = req.headers['x-admin-password'];

        if (!id || Number.isNaN(Number(id))) {
            res.status(400).json({ error: 'Invalid bot id' });
            return;
        }
        if (!adminPassword) {
            res.status(500).json({ error: 'ADMIN_PASSWORD is not set in environment variables' });
            return;
        }
        if (!providedPassword || providedPassword !== adminPassword) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        try {
            const [deleted] = await sql`
                DELETE FROM free_bots WHERE id = ${Number(id)} RETURNING id
            `;
            if (!deleted) {
                res.status(404).json({ error: 'Bot not found' });
                return;
            }
            res.status(200).json({ success: true });
        } catch (err) {
            console.error('delete bot error:', err);
            res.status(500).json({ error: 'Failed to delete bot' });
        }
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
