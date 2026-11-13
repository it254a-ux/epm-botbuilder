/**
 * DTrader: Deriv's trading screen, built from the dtrader-template and served from /dtrader-app/
 * (see public/dtrader-app). It sits in the same frame the old page used: below the site header,
 * full width, and the same height (viewport minus 5.6rem on desktop, the full area on mobile).
 */
export default function DtraderPage() {
  return (
    <main className='flex flex-col bg-background max-lg:h-full lg:h-[calc(100vh-5.6rem)] lg:overflow-hidden'>
      <iframe
        title='DTrader'
        src='/dtrader-app/'
        className='h-full w-full flex-1 border-0'
        allow='clipboard-write; fullscreen'
      />
    </main>
  );
}
