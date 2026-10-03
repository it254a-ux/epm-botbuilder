import { useEffect, useState } from 'react';

type Listener = (message: string | null) => void;

let current_message: string | null = null;
const listeners = new Set<Listener>();

/** Posts a message into the Run panel's own in-panel notice -- used instead
 *  of a global toast so "bot loaded" confirmations render inside the Run
 *  panel itself, not as a page-wide popup that can sit over the nav. */
export function showBotLoadedNotice(message: string) {
    current_message = message;
    listeners.forEach(listener => listener(current_message));
}

export function dismissBotLoadedNotice() {
    current_message = null;
    listeners.forEach(listener => listener(current_message));
}

export function useBotLoadedNotice(): string | null {
    const [message, setMessage] = useState(current_message);
    useEffect(() => {
        listeners.add(setMessage);
        return () => {
            listeners.delete(setMessage);
        };
    }, []);
    return message;
}
