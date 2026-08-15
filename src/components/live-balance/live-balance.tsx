import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';

const formatBalance = (balance: string, currency: string) => {
    const amount = Number(balance ?? 0);
    const formatted = amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${formatted} ${currency}`;
};

const LiveBalance = observer(() => {
    const { client } = useStore();
    const { balance, currency, is_logged_in } = client;

    if (!is_logged_in) return null;

    return (
        <div className='toolbar__balance' data-testid='dt_live_balance'>
            {formatBalance(balance, currency)}
        </div>
    );
});

export default LiveBalance;
