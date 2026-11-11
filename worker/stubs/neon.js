// One-time Postgres -> Turso migration helper; not used on Cloudflare.
module.exports = {
    neon() {
        throw new Error('The Neon migration route is not available on Cloudflare Workers');
    },
};
