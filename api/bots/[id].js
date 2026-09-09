const { getDb } = require('../_lib/db');

// Plain Vercel serverless function handler (CommonJS, matching generate-bot.js).
//
// GET    /api/bots/:id  -> public, returns the full bot including xml_content.
//                          Used when the user clicks "Load Bot" on a card.
// DELETE /api/bots/:id  -> admin only, protected by the x-admin-password header.
module.exports = async function handler(req, res) {
    const { id } = req.query;

    if (!id || Number.isNaN(Number(id))) {
        res.status(400).json({ error: 'Invalid bot id' });
        return;
    }

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
            const [bot] = await sql`
                SELECT id, name, description, market, risk_level, xml_content, created_at
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

    if (req.method === 'DELETE') {
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
