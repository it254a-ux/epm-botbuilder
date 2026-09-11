import { observer } from 'mobx-react-lite';
import TradeAnimation from '@/components/trade-animation';
import AccountSwitcher from '@/components/layout/header/account-switcher';
import { generateOAuthURL } from '@/components/shared';
import { useStore } from '@/hooks/useStore';

const RunStrategy = observer(() => {
    const { client } = useStore();
    const { balance, currency, is_logged_in, is_virtual, loginid } = client;

    const handleLogin = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) window.location.replace(oauthUrl);
    };

    return (
        <div className='toolbar__section' data-testid='dt_run_strategy'>
            <div className='toolbar__balance-wrapper'>
                {is_logged_in ? (
                    <AccountSwitcher
                        activeAccount={{ balance, currency, isVirtual: is_virtual, loginid }}
                    />
                ) : (
                    <button type='button' className='toolbar__signin-btn' onClick={handleLogin}>
                        Sign in / Sign up
                    </button>
                )}
            </div>
            <TradeAnimation className='toolbar__animation' />
        </div>
    );
});
export default RunStrategy;
