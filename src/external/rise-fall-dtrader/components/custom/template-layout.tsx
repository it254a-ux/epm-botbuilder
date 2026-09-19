import { Providers } from './providers';
import { Toaster } from '@/external/rise-fall-dtrader/components/ui/sonner';
import ViewportScaler from './ViewportScaler';

/**
 * Shared layout wrapper for all template apps.
 *
 * Composes theme provider, mobile viewport scaling, and toast notifications
 * in a single import. Template `app/layout.tsx` files should wrap their
 * children with this component instead of manually composing these pieces.
 *
 * Usage in a template's app/layout.tsx:
 *
 *   import { TemplateLayout } from '@/external/rise-fall-dtrader/components/custom/template-layout'
 *
 *   <html lang="en" className="h-full lg:h-auto" suppressHydrationWarning>
 *     <body className="... max-lg:h-dvh max-lg:overflow-hidden lg:overflow-y-auto">
 *       <TemplateLayout>{children}</TemplateLayout>
 *     </body>
 *   </html>
 *
 * Notes:
 * - ViewportScaler is mobile-only (active below the `lg` / 1024px breakpoint).
 * - Toaster sits outside ViewportScaler so toasts are never CSS-transformed.
 * - DerivWSProvider (the WS/auth connection) is deliberately NOT composed
 *   here. This layout is torn down and rebuilt every time Dtrader's tab is
 *   left and revisited (Tabs unmounts inactive tabs), so a provider living
 *   here would reconnect from scratch every time. It's mounted instead
 *   above the whole tab area in main.tsx, gated to only start once Dtrader
 *   has actually been visited, so it survives tab switches.
 */
export function TemplateLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <ViewportScaler>{children}</ViewportScaler>
      <Toaster />
    </Providers>
  );
}
