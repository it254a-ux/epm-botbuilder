import { useEffect } from 'react';
import { dismissBotLoadedNotice, useBotLoadedNotice } from './bot-loaded-notice';
import './bot-loaded-notice.scss';

const AUTO_DISMISS_MS = 4000;

function BotLoadedNotice() {
    const message = useBotLoadedNotice();

    useEffect(() => {
        if (!message) return undefined;
        const timer = setTimeout(dismissBotLoadedNotice, AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [message]);

    if (!message) return null;

    return (
        <div className='bot-loaded-notice'>
            <div className='bot-loaded-notice__card'>
                <button
                    type='button'
                    className='bot-loaded-notice__close'
                    onClick={dismissBotLoadedNotice}
                    aria-label='Dismiss'
                >
                    ×
                </button>
                <div className='bot-loaded-notice__icon'>✓</div>
                <div className='bot-loaded-notice__text'>
                    <div className='bot-loaded-notice__title'>Strategy Loaded</div>
                    <div className='bot-loaded-notice__message'>{message}</div>
                </div>
            </div>
        </div>
    );
}

export default BotLoadedNotice;
