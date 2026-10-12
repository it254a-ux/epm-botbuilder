import './epm-splash.scss';

export default function ChunkLoader({ message }: { message: string }) {
    return (
        <div className='app-root app-root--splash'>
            <div className='epm-splash' role='status' aria-live='polite'>
                <div className='epm-splash__mark' aria-hidden='true'>
                    <span className='epm-splash__glow' />
                    <span className='epm-splash__ring' />
                    <span className='epm-splash__bar' />
                    <span className='epm-splash__bar' />
                    <span className='epm-splash__bar' />
                    <span className='epm-splash__bar' />
                </div>
                <div className='epm-splash__brand'>Executive Prime Markets</div>
                <div className='epm-splash__msg'>{message}</div>
                <div className='epm-splash__track' aria-hidden='true' />
            </div>
        </div>
    );
}
