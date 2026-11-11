// Master switch for the Telegram signal sender / generator.
// The signal watchers (the H1 one and the M15 + M5 one) do nothing unless the environment variable
// SIGNALS_ENABLED is set to "on". While it is not set they answer the cron job with "paused", analyse
// nothing, save nothing and send nothing to Telegram. The website feed and the admin page keep working
// and keep showing the signals already saved.
//
// To resume: Vercel > Settings > Environment Variables > add SIGNALS_ENABLED = on > redeploy.
function signalsPaused() {
    return String(process.env.SIGNALS_ENABLED || '').trim().toLowerCase() !== 'on';
}

module.exports = { signalsPaused };
