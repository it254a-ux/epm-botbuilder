/**
 * Centralized dayjs configuration with all plugins
 * Import this file instead of 'dayjs' directly to ensure plugins are loaded
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with UTC plugin
dayjs.extend(utc);

export default dayjs;
