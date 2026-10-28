#!/usr/bin/env node
// Creates (or resets the password of) an ADMIN account. Run it on your own computer:
//
//   TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="a long passphrase" \
//     node scripts/create-admin.js
//
// Admins can only be created this way -- never through the public sign-up.
const { getDb, dbConfigured } = require('../api/_lib/db');
const { hashPassword, validatePassword, validateEmail } = require('../api/_lib/auth');

(async () => {
    const email = validateEmail(process.env.ADMIN_EMAIL);
    const password = process.env.ADMIN_PASSWORD;
    if (!dbConfigured()) throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
    if (!email) throw new Error('Set ADMIN_EMAIL to a valid email.');
    const problem = validatePassword(password, email);
    if (problem) throw new Error(problem);

    const sql = getDb();
    const hash = await hashPassword(password);
    await sql`
        INSERT INTO owners (email, name, password_hash, role)
        VALUES (${email}, 'Admin', ${hash}, 'admin')
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', disabled = false
    `;
    await sql`DELETE FROM sessions WHERE owner_id = (SELECT id FROM owners WHERE email = ${email})`;
    console.log(`Admin account ready: ${email}`);
})().catch(err => {
    console.error(err.message);
    process.exit(1);
});
