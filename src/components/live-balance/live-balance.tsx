import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './live-balance.scss';

const formatBalance = (balance: string) => {
    const amount = Number(balance ?? 0);
    return amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const LiveBalance = observer(() => {
    const { client } = useStore();
    const { balance, currency, is_logged_in, is_virtual } = client;

    if (!is_logged_in) return null;

    return (
        <div className='toolbar__balance-badge' data-testid='dt_live_balance'>
            <span className='toolbar__balance-badge__type'>{is_virtual ? 'Demo' : 'Real'}</span>
            <span className='toolbar__balance-badge__amount'>
                {formatBalance(balance)} {currency}
            </span>
        </div>
    );
});

export default LiveBalance;
