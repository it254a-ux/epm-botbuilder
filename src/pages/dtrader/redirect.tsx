import { Navigate, useLocation } from 'react-router-dom';

/**
 * Opening /dtrader or /dtrader/<type> (a link, or a refresh) goes through the home page's Dtrader tab, so the
 * site always loads Charts first and the other pages afterwards, the same as on every other page.
 */
export default function DtraderRedirect() {
    const { pathname } = useLocation();
    const slug = pathname.replace(/^\/dtrader\/?/i, '').replace(/\/+$/, '');
    return <Navigate to={`/#dtrader${slug ? `/${slug}` : ''}`} replace />;
}
