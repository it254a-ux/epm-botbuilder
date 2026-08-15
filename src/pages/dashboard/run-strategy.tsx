import TradeAnimation from '@/components/trade-animation';
import LiveBalance from '@/components/live-balance/live-balance';

const RunStrategy = () => (
    <div className='toolbar__section' data-testid='dt_run_strategy'>
        <LiveBalance />
        <TradeAnimation className='toolbar__animation' />
    </div>
);
export default RunStrategy;
