import { useEffect, useRef } from 'react';

const DESKTOP_VIDEOS = 4;

declare global {
    interface Window {
        __epmSplashIdx?: number;
    }
}

/** Desktop-only background video for the loading screen. A random clip is
 * picked once per page load (index.html picks it first; this reuses it so the
 * boot screen and the app loader show the same scene). Renders nothing on
 * phones/tablets. */
export default function SplashVideo() {
    const ref = useRef<HTMLVideoElement>(null);
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches;

    useEffect(() => {
        ref.current?.play().catch(() => undefined);
    }, []);

    if (!isDesktop) return null;

    if (!window.__epmSplashIdx) window.__epmSplashIdx = 1 + Math.floor(Math.random() * DESKTOP_VIDEOS);
    const n = window.__epmSplashIdx;

    return (
        <>
            <video
                ref={ref}
                className='epm-splash__video'
                src={`/splash/desktop-${n}.mp4`}
                poster={`/splash/desktop-${n}.jpg`}
                autoPlay
                muted
                loop
                playsInline
                preload='auto'
                aria-hidden='true'
            />
            <div className='epm-splash__scrim' aria-hidden='true' />
        </>
    );
}
