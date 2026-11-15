import React from 'react';
import { observer } from 'mobx-react-lite';
import classNames from 'classnames';
import PriceLineStore from 'src/store/PriceLineStore';
import { DIRECTIONS } from '../utils';

type TPriceLineInlineProps = {
    store: PriceLineStore;
    lineStyle?: React.CSSProperties['borderStyle'];
    hideOffscreenBarrier?: boolean;
    hideOffscreenLine?: boolean;
    hideBarrierLine?: boolean;
    color?: string;
    opacityOnOverlap: number;
    title?: string;
};

const ChevronIcon = ({ direction, color }: { direction: keyof typeof DIRECTIONS; color?: string }) => (
    <svg
        className='price-line-inline__chevron'
        width='10'
        height='10'
        viewBox='0 0 10 10'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        style={{ transform: direction === DIRECTIONS.DOWN ? 'rotate(180deg)' : undefined }}
    >
        <path
            d='M2 4.5L5 1.5L8 4.5M2 8.5L5 5.5L8 8.5'
            stroke={color}
            strokeWidth='1.2'
            strokeLinecap='round'
            strokeLinejoin='round'
        />
    </svg>
);

const PriceLineInline = ({
    lineStyle,
    color,
    hideOffscreenBarrier,
    opacityOnOverlap,
    hideOffscreenLine,
    hideBarrierLine,
    store,
    title,
}: TPriceLineInlineProps) => {
    const { className, init, isOverlapping, offScreen, offScreenDirection, priceDisplay, setDragLine, visible } = store;
    const showBarrier = React.useMemo(() => !(hideOffscreenBarrier && offScreen), [hideOffscreenBarrier, offScreen]);
    const showLine = React.useMemo(
        () => !hideBarrierLine && (!hideOffscreenLine || !offScreen) && !isOverlapping,
        [hideBarrierLine, hideOffscreenLine, offScreen, isOverlapping]
    );
    const opacity = React.useMemo(() => (isOverlapping ? opacityOnOverlap : ''), [isOverlapping, opacityOnOverlap]);

    React.useEffect(() => {
        init();
    }, [init]);

    if (!showBarrier) return null;

    return (
        <div className='barrier-area' ref={setDragLine} hidden={!visible}>
            <div
                className={classNames('chart-line', 'chart-line--inline-label', 'horizontal', className || '')}
                style={{ color, opacity }}
            >
                {showLine && (
                    <div
                        className='price-line-inline__line'
                        style={{
                            borderTopColor: color,
                            borderTopStyle: lineStyle as React.CSSProperties['borderTopStyle'],
                        }}
                    />
                )}
                <div className='price-line-inline__label-row' style={{ color }}>
                    {offScreen && offScreenDirection && <ChevronIcon direction={offScreenDirection} color={color} />}
                    {title && <span className='price-line-inline__title'>{title}</span>}
                    <span
                        className='price-line-inline__pill'
                        style={{ borderColor: color, color }}
                    >
                        {priceDisplay}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default observer(PriceLineInline);
