import { useEffect, useRef } from 'react';
import { attachDtrader, detachDtrader, loadDtrader } from './native-host';

/**
 * DTrader: Deriv's trading screen (built from the dtrader-template) running inside the site itself, no iframe.
 * It sits in the same frame the old page used: below the site header, full width, and the same height
 * (viewport minus 5.6rem on desktop, the full area on mobile).
 */
export default function DtraderPage() {
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    attachDtrader(el);
    void loadDtrader();
    return () => detachDtrader();
  }, []);

  return (
    <main className='flex flex-col bg-background max-lg:h-full lg:h-[calc(100vh-5.6rem)] lg:overflow-hidden'>
      <div ref={frame} className='h-full w-full flex-1' />
    </main>
  );
}
