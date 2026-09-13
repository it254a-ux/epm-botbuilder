import { ThemeProvider } from 'next-themes';
import { ThemeBridge } from './theme-bridge';
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <ThemeBridge />
      {children}
    </ThemeProvider>
  );
}
