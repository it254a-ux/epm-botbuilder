import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import '../loader/epm-splash.scss';

const BlocklyLoading = observer(() => {
    const { blockly_store } = useStore();
    const { is_loading } = blockly_store;

    return (
        <>
            {is_loading && (
                <div className='bot__loading' data-testid='blockly-loader'>
                    <div className='epm-splash__mark' aria-hidden='true'>
                        <span className='epm-splash__glow' />
                        <span className='epm-splash__ring' />
                        <span className='epm-splash__bars'>
                            <span className='epm-splash__bar' />
                            <span className='epm-splash__bar' />
                            <span className='epm-splash__bar' />
                            <span className='epm-splash__bar' />
                            <span className='epm-splash__bar' />
                        </span>
                    </div>
                    <div>Loading Blockly...</div>
                </div>
            )}
        </>
    );
});

export default BlocklyLoading;
