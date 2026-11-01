import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import './bot-notice.scss';

const DRAWER_OPEN_WIDTH = 366;

// Bots post messages with the page's alert() (for example "Take-profit target
// reached"). This replaces the browser's plain popup with a styled notice on
// every page, for every bot, with a Stop Trading option.
const BotNotice = observer(() => {
    const { run_panel } = useStore();
    const { isDesktop } = useDevice();
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        const originalAlert = window.alert;
        window.alert = (text?: unknown) => {
            setMessage(text === undefined ? '' : String(text));
        };
        return () => {
            window.alert = originalAlert;
        };
    }, []);

    if (message === null) return null;

    return (
        <div
            className='bot-notice-overlay'
            style={isDesktop && run_panel.is_drawer_open ? { width: `${DRAWER_OPEN_WIDTH}px` } : undefined}
        >
            <div className='bot-notice-card'>
                <div className='bot-notice-header'>
                    <span className='bot-notice-icon'>◆</span>
                    <Localize i18n_default_text='Strategy Notice' />
                </div>
                <div className='bot-notice-body'>{message || localize('(no message)')}</div>
                <div className='bot-notice-actions'>
                    <button
                        type='button'
                        className='bot-notice-cancel'
                        onClick={() => {
                            setMessage(null);
                            run_panel.onStopButtonClick();
                        }}
                    >
                        <Localize i18n_default_text='Stop Trading' />
                    </button>
                    <button type='button' className='bot-notice-ok' onClick={() => setMessage(null)}>
                        <Localize i18n_default_text='Acknowledge & Continue' />
                    </button>
                </div>
            </div>
        </div>
    );
});

export default BotNotice;
