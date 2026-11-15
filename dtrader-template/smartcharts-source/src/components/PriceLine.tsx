import React from 'react';
import { observer } from 'mobx-react-lite';
import classNames from 'classnames';
import PriceLineStore from 'src/store/PriceLineStore';
import PriceLineArrow from './PriceLineArrow';
import PriceLineInline from './PriceLineInline';
import PriceLineTitle from './PriceLineTitle';
import HamburgerDragIcon from './HamburgerDragIcon';

type TPriceLineProps = {
    store: PriceLineStore;
    lineStyle?: React.CSSProperties['borderStyle'];
    hideOffscreenBarrier?: boolean;
    hideOffscreenLine?: boolean;
    hideBarrierLine?: boolean;
    backgroundColor?: string;
    foregroundColor: string;
    color?: string;
    opacityOnOverlap: number;
    title?: string;
    useInlineLabel?: boolean;
};

const PriceLine = ({
    lineStyle,
    backgroundColor,
    color,
    foregroundColor,
    hideOffscreenBarrier,
    opacityOnOverlap,
    hideOffscreenLine,
    hideBarrierLine,
    store,
    title,
    useInlineLabel,
}: TPriceLineProps) => {
    if (useInlineLabel) {
        return (
            <PriceLineInline
                store={store}
                lineStyle={lineStyle}
                color={color}
                hideOffscreenBarrier={hideOffscreenBarrier}
                hideOffscreenLine={hideOffscreenLine}
                hideBarrierLine={hideBarrierLine}
                opacityOnOverlap={opacityOnOverlap}
                title={title}
            />
        );
    }

    const {
        className,
        draggable,
        init,
        isDragging,
        isMobile,
        isOverlapping,
        isOverlappingWithPriceLine,
        offScreen,
        offScreenDirection,
        overlappedBarrierWidth,
        priceDisplay,
        priceLineWidth,
        setDragLine,
        visible,
    } = store;
    const showBarrier = React.useMemo(() => !(hideOffscreenBarrier && offScreen), [hideOffscreenBarrier, offScreen]);
    const showBarrierDragLine = React.useMemo(
        () => !hideBarrierLine && (!hideOffscreenLine || !offScreen) && !isOverlapping,
        [hideBarrierLine, hideOffscreenLine, offScreen, isOverlapping]
    );
    const opacity = React.useMemo(() => (isOverlapping ? opacityOnOverlap : ''), [isOverlapping, opacityOnOverlap]);

    React.useEffect(() => {
        init();
    }, [init]);

    if (!showBarrier) return null;

    const width = priceLineWidth + 18;
    const price_right_offset = isMobile ? 20 : 3;

    return (
        <div
            className={classNames('barrier-area', { 'barrier-area--zero': isOverlappingWithPriceLine })}
            ref={setDragLine}
            hidden={!visible}
        >
            <div
                className={classNames('chart-line', 'horizontal', className || '', {
                    draggable,
                    dragging: isDragging,
                })}
                style={{
                    color: foregroundColor,
                }}
            >
                {showBarrierDragLine && (
                    <div
                        className={classNames('drag-line', { 'drag-line--zero': isOverlappingWithPriceLine })}
                        style={{
                            borderTopColor: color,
                            borderTopStyle: lineStyle as React.CSSProperties['borderTopStyle'],
                            width: `calc(100% - ${width}px + ${isMobile ? 0 : overlappedBarrierWidth - 4}px)`,
                        }}
                    />
                )}
                <div className='draggable-area' />
                <div className='draggable-area-wrapper'>
                    <div
                        className={classNames('drag-price', { 'drag-price--narrow': isOverlappingWithPriceLine })}
                        style={{
                            backgroundColor: isOverlappingWithPriceLine ? undefined : backgroundColor,
                            color: isOverlappingWithPriceLine ? color : foregroundColor,
                            borderColor: color,
                            width: draggable && isOverlappingWithPriceLine ? width + 8 : width - 6,
                            opacity,
                            right: price_right_offset,
                        }}
                    >
                        <HamburgerDragIcon isOverlapping={isOverlappingWithPriceLine} />
                        <div
                            className={classNames('price', { 'price--zero': isOverlappingWithPriceLine })}
                            style={{
                                color: isOverlappingWithPriceLine ? color : '',
                                right: isOverlappingWithPriceLine
                                    ? overlappedBarrierWidth + 6 + priceDisplay.length * 8 + (draggable ? 26 : 0)
                                    : 0,
                            }}
                        >
                            {priceDisplay}
                        </div>
                        <div />
                        {offScreen && offScreenDirection && (
                            <PriceLineArrow offScreenDirection={offScreenDirection} color={color} />
                        )}
                    </div>
                </div>
                {title && (
                    <PriceLineTitle
                        color={color}
                        title={title}
                        yAxiswidth={width + price_right_offset}
                        opacity={opacity}
                    />
                )}
            </div>
        </div>
    );
};

export default observer(PriceLine);
