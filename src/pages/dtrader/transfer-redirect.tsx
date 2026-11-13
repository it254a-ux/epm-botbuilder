import { useEffect } from 'react';
import { standalone_routes } from '@/components/shared/utils/routes/routes';

/**
 * DTrader's "Transfer" / "Deposit" buttons open /transfer on this site. The real transfer page lives on
 * Deriv's home site, so this sends the visitor there (with the same currency and language) instead of a 404.
 */
export default function TransferRedirect() {
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const curr = q.get('curr');
        const lang = q.get('lang');
        const url = `${standalone_routes.transfer}${curr ? `&curr=${curr}` : ''}${lang ? `&lang=${lang}` : ''}`;
        window.location.replace(url);
    }, []);
    return null;
}
