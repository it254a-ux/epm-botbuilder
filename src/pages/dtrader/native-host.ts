import './dtrader-host.css';
/**
 * Runs Deriv's DTrader (built from dtrader-template, files in public/dtrader-app) inside the site's own page,
 * with no iframe. It signs in with the website's login, and stays loaded after the first visit so coming
 * back to it is instant.
 */
const ASSET_BASE = '/dtrader-app/';
const HOLDER_ID = 'epm-dtrader-holder';
const ROOT_ID = 'derivatives_trader';

let loading: Promise<void> | null = null;
let themeSyncStarted = false;

/** The site's own light/dark choice (the site saves it as 'theme' and puts a class on <body>). */
const siteIsDark = (): boolean => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
  } catch {
    /* no saved theme */
  }
  return document.body.classList.contains('theme--dark');
};

/** Tells DTrader's own theme setting before it starts, so it never opens in the wrong theme. */
function seedTheme(): void {
  try {
    const saved = JSON.parse(localStorage.getItem('ui_store') || '{}') || {};
    saved.is_dark_mode_on = siteIsDark();
    localStorage.setItem('ui_store', JSON.stringify(saved));
  } catch {
    /* ignore */
  }
}

/**
 * Keeps DTrader (and its chart) in the site's theme, both when it opens and whenever the site's theme switch is used.
 * DTrader writes the same <body> theme classes as the site, so the site's saved choice is always the one that wins.
 */
function startThemeSync(): void {
  if (themeSyncStarted) return;
  themeSyncStarted = true;
  const apply = () => {
    const dark = siteIsDark();
    const ui = (window as unknown as { __deriv_store?: { ui?: { is_dark_mode_on?: boolean; setDarkMode?: (v: boolean) => void } } })
      .__deriv_store?.ui;
    if (ui?.setDarkMode && ui.is_dark_mode_on !== dark) ui.setDarkMode(dark);
    const cls = document.body.classList;
    if (dark !== cls.contains('theme--dark')) {
      cls.remove('theme--light', 'theme--dark');
      cls.add(dark ? 'theme--dark' : 'theme--light');
    }
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
  };
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.setInterval(apply, 1500);
  apply();
}

/** Gives the template the website's login: it looks for its token in this tab's session storage. */
export function shareSiteLogin(): void {
  try {
    const raw = localStorage.getItem('auth_info');
    if (!raw) return;
    const info = JSON.parse(raw) as { access_token?: string; refresh_token?: string; expires_at?: number };
    if (!info?.access_token) return;
    // Open on the account the website is on (Real or Demo), not on whichever account the template picks first.
    const loginid = localStorage.getItem('active_loginid');
    if (loginid) sessionStorage.setItem('active_loginid', loginid);
    // The site keeps the expiry in seconds, the template in milliseconds.
    const expires_at = info.expires_at ? (info.expires_at < 1e12 ? info.expires_at * 1000 : info.expires_at) : null;
    sessionStorage.setItem(
      'auth_info',
      JSON.stringify({ access_token: info.access_token, refresh_token: info.refresh_token, expires_at })
    );
  } catch {
    /* no login to share */
  }
}

/** A hidden place that keeps DTrader alive while another tab is showing. */
function getHolder(): HTMLElement {
  let holder = document.getElementById(HOLDER_ID);
  if (!holder) {
    holder = document.createElement('div');
    holder.id = HOLDER_ID;
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;height:800px;overflow:hidden;visibility:hidden;';
    document.body.appendChild(holder);
  }
  return holder;
}

function getRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'derivatives-trader';
    root.style.cssText = 'height:100%;width:100%;';
    getHolder().appendChild(root);
  }
  return root;
}

const addCss = (href: string) =>
  new Promise<void>(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });

const addScript = (src: string) =>
  new Promise<void>(resolve => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.body.appendChild(s);
  });

/** Starts DTrader once (safe to call many times, e.g. from the site's tab preloading). */
export function loadDtrader(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    shareSiteLogin();
    startAccountSync();
    startSelfRepair();
    startConnectionRepair();
    void import('./auto-switch').then(m => m.startAutoSwitch());
    startUrlSync();
    startVideoSwap();
    startChartZoomOut();
    if (/^\/dtrader\/./i.test(window.location.pathname)) {
      pendingSlug = pendingSlug || readSlugFromPath();
      history.replaceState(window.history.state, '', '/dtrader');
    }
    seedTheme();
    startThemeSync();
    getRoot();
    const html = await (await fetch(ASSET_BASE)).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const abs = (u: string) => (u.startsWith('http') || u.startsWith('/') ? u : ASSET_BASE + u);
    const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(l => abs(l.getAttribute('href') || ''));
    const scripts = Array.from(doc.querySelectorAll('script[src]')).map(s => abs(s.getAttribute('src') || ''));
    await Promise.all(styles.filter(Boolean).map(addCss));
    for (const src of scripts.filter(Boolean)) await addScript(src);
  })().catch(err => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Shows DTrader inside `container` (the page's frame). */
export function attachDtrader(container: HTMLElement): void {
  pendingSlug = readSlugFromPath() || pendingSlug;
  container.appendChild(getRoot());
  redrawCharts();
}

/** Puts DTrader back in the hidden holder so it keeps running. */
export function detachDtrader(): void {
  const root = document.getElementById(ROOT_ID);
  if (root) getHolder().appendChild(root);
  redrawCharts(); // the Charts page is shown again: make it measure itself
}

/**
 * Follows the website's account switcher: when the site's active account changes, DTrader switches to the
 * same account (no reload), so Real/Demo always match the rest of the site.
 */
let watching = false;
export function startAccountSync(): void {
  if (watching) return;
  watching = true;
  let last = localStorage.getItem('active_loginid');
  window.setInterval(() => {
    const now = localStorage.getItem('active_loginid');
    if (!now || now === last) return;
    last = now;
    try {
      sessionStorage.setItem('active_loginid', now);
    } catch {
      /* ignore */
    }
    (window as unknown as { __epmSwitchAccount?: (id: string) => void }).__epmSwitchAccount?.(now);
  }, 500);
}

/**
 * Self-repair: after a site update, an old open tab can ask for a DTrader file that no longer exists
 * (a "Loading chunk failed" crash). Reload once to pick up the new version instead of staying broken.
 */
let healing = false;
export function startSelfRepair(): void {
  if (healing) return;
  healing = true;
  const check = (msg: unknown) => {
    const text = String((msg as { message?: string })?.message ?? msg ?? '');
    if (!/ChunkLoadError|Loading chunk|Loading CSS chunk|Unexpected token '<'/i.test(text)) return;
    try {
      const last = Number(sessionStorage.getItem('epm_dtrader_reload') || 0);
      if (Date.now() - last < 60000) return; // never loop
      sessionStorage.setItem('epm_dtrader_reload', String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  };
  window.addEventListener('error', e => check(e.error ?? e.message));
  window.addEventListener('unhandledrejection', e => check(e.reason));
}

/**
 * Connection repair: when DTrader loses its connection to Deriv for good (the internet dropped, the computer slept...) it shows its own
 * "An unexpected error occurred - Connection failed. Please refresh this page" screen and stays stuck until someone presses Refresh.
 * Nobody should ever see that screen: it is hidden, a short "Reconnecting" note is shown instead, and the page is reloaded by itself as
 * soon as the internet is back. It only happens while DTrader is the page being looked at (never while the person is on another tab such
 * as Forex Live, where a reload would stop an armed Sniper). If it keeps failing (3 times within 2 minutes) the original screen is left
 * visible so it can never become an endless reload loop.
 */
let repairing = false;
export function startConnectionRepair(): void {
  if (repairing) return;
  repairing = true;
  let note: HTMLElement | null = null;
  let reloadTimer = 0;
  const tooMany = (): boolean => {
    try {
      const now = Date.now();
      const times = (JSON.parse(sessionStorage.getItem('epm_dtrader_conn') || '[]') as number[]).filter(t => now - t < 120000);
      return times.length >= 3;
    } catch {
      return false;
    }
  };
  const remember = () => {
    try {
      const now = Date.now();
      const times = (JSON.parse(sessionStorage.getItem('epm_dtrader_conn') || '[]') as number[]).filter(t => now - t < 120000);
      times.push(now);
      sessionStorage.setItem('epm_dtrader_conn', JSON.stringify(times));
    } catch {
      /* ignore */
    }
  };
  const showNote = () => {
    if (note) return;
    note = document.createElement('div');
    note.setAttribute('role', 'status');
    note.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:var(--general-main-1,#151a24);color:#cbd5e1;font:400 14px/1.4 inherit;';
    note.innerHTML =
      '<div style="text-align:center"><div style="width:26px;height:26px;margin:0 auto 12px;border:2px solid rgba(148,163,184,.3);border-top-color:#e8b93f;border-radius:50%;animation:epm-spin 0.9s linear infinite"></div>Reconnecting&hellip;</div>' +
      '<style>@keyframes epm-spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(note);
  };
  const reloadWhenOnline = () => {
    window.clearTimeout(reloadTimer);
    if (!navigator.onLine) return; // the 'online' event tries again
    reloadTimer = window.setTimeout(() => {
      remember();
      window.location.reload();
    }, 1500);
  };
  const failed = (): boolean => {
    const box = document.querySelector('.derivatives-trader .fullscreen-error, #derivatives_trader .fullscreen-error');
    return !!box && /Connection failed|unexpected error/i.test(box.textContent || '');
  };
  window.setInterval(() => {
    if (!document.body.classList.contains('epm-dtrader-active')) return;
    if (!failed()) return;
    if (tooMany()) return; // leave DTrader's own Refresh screen
    showNote();
    if (!reloadTimer) reloadWhenOnline();
  }, 1000);
  window.addEventListener('online', () => {
    if (note) {
      reloadTimer = 0;
      reloadWhenOnline();
    }
  });
}

/**
 * Clean web addresses: /dtrader/rise-fall, /dtrader/accumulators, /dtrader/even-odd, ...
 * The address follows the selected trade type, and opening such an address selects that trade type.
 * (DTrader itself writes long ?chart_type=...&symbol=... addresses; those are not shown.)
 */
const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');

let pendingSlug: string | null = null;
let urlSyncing = false;
const TYPES_SELECTOR = '.derivatives-trader .trade__trade-types';

function readSlugFromPath(): string | null {
  const m =
    window.location.pathname.match(/^\/dtrader\/([a-z-]+)\/?$/i) || window.location.hash.match(/^#dtrader\/([a-z-]+)$/i);
  return m ? m[1].toLowerCase() : null;
}

export function startUrlSync(): void {
  if (urlSyncing) return;
  urlSyncing = true;

  // Hide DTrader's own long address while its page is on screen.
  const original = history.replaceState.bind(history);
  history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    if (url && /trade_type=/.test(String(url))) return; // never show DTrader's long address (also while it runs hidden in the background)
    original(data, unused, url);
  };

  window.setInterval(() => {
    if (!document.body.classList.contains('epm-dtrader-active')) return;
    const box = document.querySelector(TYPES_SELECTOR);
    if (!box) return;
    const chips = Array.from(box.querySelectorAll<HTMLButtonElement>('button'));
    if (!chips.length) return;
    const selected = chips.find(c => c.getAttribute('data-state') === 'selected');

    if (pendingSlug) {
      const wanted = chips.find(c => slugOf(c.textContent || '') === pendingSlug);
      pendingSlug = null;
      if (wanted && wanted !== selected) {
        wanted.click();
        return;
      }
    }

    if (!selected) return;
    const slug = slugOf(selected.textContent || '');
    if (!slug) return;
    if (window.location.pathname.startsWith('/dtrader')) {
      const target = `/dtrader/${slug}`;
      if (window.location.pathname !== target || window.location.search || window.location.hash) {
        original(window.history.state, '', target);
      }
    } else {
      // inside the home page's Dtrader tab: keep the site's #hash style
      const target = `${window.location.pathname}#dtrader/${slug}`;
      if (window.location.search || window.location.hash !== `#dtrader/${slug}`) {
        original(window.history.state, '', target);
      }
    }
  }, 250);
}

/**
 * Charts draw on a canvas that is sized when the page is shown. After DTrader is moved in or out of view (or
 * the Charts page comes back), tell every chart to measure itself again so none stays blank.
 */
export function redrawCharts(): void {
  [60, 250, 600, 1400].forEach(ms =>
    window.setTimeout(() => {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch {
        /* ignore */
      }
    }, ms)
  );
}

/**
 * Help videos: DTrader's videos are on Deriv's video account, which only plays on Deriv's own sites. If a copy of a
 * video is saved in /dtrader-videos/<video id>.mp4 (see public/dtrader-videos/README.txt), it is played from there instead.
 * Videos with no saved copy are left as they are.
 */
const videoFiles = new Map<string, Promise<boolean>>();
const hasVideoFile = (id: string): Promise<boolean> => {
  let known = videoFiles.get(id);
  if (!known) {
    known = fetch(`/dtrader-videos/${id}.mp4`, { method: 'HEAD' })
      .then(r => r.ok && /video|octet/i.test(r.headers.get('content-type') || ''))
      .catch(() => false);
    videoFiles.set(id, known);
  }
  return known;
};

let videoSwapStarted = false;
export function startVideoSwap(): void {
  if (videoSwapStarted) return;
  videoSwapStarted = true;
  const swap = (frame: HTMLIFrameElement) => {
    const m = frame.src.match(/^https:\/\/iframe\.cloudflarestream\.com\/([0-9a-f]{32})\?(.*)$/i);
    if (frame.dataset.epmChecked) return;
    frame.dataset.epmChecked = '1';
    const [, id, query] = m || [];
    const hide = () => {
      // Deriv's player is blocked on this site: remove the whole video box (and its black background)
      const box = (frame.closest('.stream__wrapper, .guide-video__wrapper, [class*="video"]') ||
        frame.parentElement) as HTMLElement | null;
      (box || frame).style.setProperty('display', 'none', 'important');
    };
    if (!id) return hide();
    const params = new URLSearchParams(query);
    void hasVideoFile(id).then(found => {
      if (!frame.isConnected) return;
      if (!found) return hide();
      const video = document.createElement('video');
      video.className = frame.className;
      video.src = `/dtrader-videos/${id}.mp4`;
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:transparent;';
      video.autoplay = params.get('autoplay') !== 'false';
      video.muted = params.get('muted') !== 'false';
      video.loop = params.get('loop') !== 'false';
      video.controls = params.get('controls') === 'true';
      video.playsInline = true;
      frame.replaceWith(video);
      void video.play().catch(() => undefined);
    });
  };
  const scan = () =>
    document.querySelectorAll<HTMLIFrameElement>('iframe[src*="cloudflarestream.com"]').forEach(swap);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  window.setInterval(scan, 1000);
  scan();
}

/**
 * The chart opens zoomed out (many candles in view) instead of zoomed right in. DTrader's chart has no setting for its
 * opening zoom, so once the chart is on screen with its data, its own "zoom out" button is pressed a few times, once
 * for each chart (each open or refresh). The user can still zoom however they like afterwards.
 */
const ZOOM_OUT_STEPS = 6;
let zoomedOutButton: Element | null = null;
export function startChartZoomOut(): void {
  window.setInterval(() => {
    if (!document.body.classList.contains('epm-dtrader-active')) return;
    const button = document.querySelector<HTMLElement>('.derivatives-trader .cq-zoom-out');
    if (!button || button === zoomedOutButton) return;
    const chart = button.closest('.sc-chart, .smartcharts, .ciq-chart-area') || document.querySelector('.derivatives-trader');
    if (/Retrieving Chart Data|Loading/i.test(chart?.textContent || '')) return; // wait until the data is drawn
    zoomedOutButton = button;
    window.setTimeout(() => {
      for (let i = 0; i < ZOOM_OUT_STEPS; i++) window.setTimeout(() => button.click(), i * 120);
    }, 800);
  }, 700);
}
