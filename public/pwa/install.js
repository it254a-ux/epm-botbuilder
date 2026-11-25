// Registers the app (service worker) and shows a small "Install app" button when the browser allows installing.
// When the installed app is shown with its title bar merged into the page (window controls overlay), the site's own top bar
// becomes the title bar: the website name written by the browser disappears, the bar can be dragged, and nothing hides under the window buttons.
(function () {
    var st = document.createElement('style');
    st.textContent =
        '@media (display-mode: window-controls-overlay){' +
        '.app-header{-webkit-app-region:drag;app-region:drag;padding-left:env(titlebar-area-x,0);padding-right:calc(100vw - env(titlebar-area-x,0px) - env(titlebar-area-width,100vw));min-height:env(titlebar-area-height,40px)}' +
        '.app-header a,.app-header button,.app-header input,.app-header select,.app-header [role=button],.app-header [role=tab],.app-header [tabindex]{-webkit-app-region:no-drag;app-region:no-drag}' +
        '}';
    document.head.appendChild(st);
})();

(function () {
    if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/localhost/.test(location.href)) return;
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
    });

    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (standalone) return;
    try { if (localStorage.getItem('epm_install_hidden') === '1') return; } catch (e) {}

    var pill;
    function show(text, onClick) {
        if (pill) return;
        pill = document.createElement('div');
        pill.setAttribute('style', 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;' +
            'padding:10px 14px;border-radius:999px;background:#0e1621;color:#fff;border:1px solid rgba(255,200,60,.55);box-shadow:0 8px 24px rgba(0,0,0,.45);' +
            'font:600 14px system-ui,sans-serif;max-width:calc(100vw - 24px)');
        var label = document.createElement('span');
        label.textContent = text;
        pill.appendChild(label);
        if (onClick) {
            var go = document.createElement('button');
            go.textContent = 'Install';
            go.setAttribute('style', 'border:0;border-radius:999px;padding:6px 14px;background:#f5c542;color:#1a1a1a;font:700 13px system-ui,sans-serif;cursor:pointer');
            go.onclick = onClick;
            pill.appendChild(go);
        }
        var x = document.createElement('button');
        x.textContent = '×';
        x.setAttribute('aria-label', 'Close');
        x.setAttribute('style', 'border:0;background:transparent;color:#9aa6b8;font-size:20px;line-height:1;cursor:pointer;padding:0 2px');
        x.onclick = function () {
            hide();
            try { localStorage.setItem('epm_install_hidden', '1'); } catch (e) {}
        };
        pill.appendChild(x);
        document.body.appendChild(pill);
    }
    function hide() {
        if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
        pill = null;
    }

    // Chrome, Edge, Android: the browser offers the install
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferred = e;
        show('Install Executive Prime Markets as an app', function () {
            hide();
            deferred.prompt();
            deferred = null;
        });
    });
    window.addEventListener('appinstalled', hide);

    // iPhone / iPad (Safari has no install button): tell how to add it
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (ios) setTimeout(function () { show('To install: tap Share, then "Add to Home Screen"'); }, 4000);
})();
