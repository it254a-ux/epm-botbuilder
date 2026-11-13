# DTrader (Deriv dtrader-template) inside the EPM site

This folder is the full source of https://github.com/deriv-com/dtrader-template with the changes made for executiveprimemarkets.site.
The site shows its **built output**, which lives in `public/dtrader-app/` and is opened by `src/pages/dtrader/index.tsx` in a frame at `/dtrader`.

## Changes made to the template
- `brand.config.json`: `oauth_app_id` is the site's Deriv App ID, redirect URIs point to https://executiveprimemarkets.site
- `babel.config.json` and `packages/core/babel.config.json`: `"sourceType": "unambiguous"` (fixes "ES Modules may not assign module.exports")
- `packages/core/build/constants.js`: the html-loader rule skips `src/index.html` (so the page title and template values render)
- `packages/core/src/App/app.jsx`, `packages/core/src/App/Components/Routes/route-with-sub-routes.jsx`, `packages/components/src/components/route-with-subroutes/route-with-subroutes.tsx`: the router base is `/dtrader-app`
- `package.json`: added rimraf, cross-env, react-i18next, i18next

## Rebuild (Node 22.23.4+ or 24.22.1+)
```bash
cd dtrader-template
npm install --legacy-peer-deps --ignore-scripts --no-audit --no-fund
export NODE_OPTIONS=--max-old-space-size=6000
npm run build --workspace=@deriv/components
npm run build --workspace=@deriv/reports
npm run build --workspace=@deriv/trader -- dtrader-app
npm run build --workspace=@deriv/core -- dtrader-app
rm -rf ../public/dtrader-app && cp -r packages/core/dist ../public/dtrader-app
find ../public/dtrader-app -name '*.map' -delete
```
