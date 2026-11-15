import { CaptionText, Chip, Tooltip as QuillTooltip } from '@deriv-com/quill-ui';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import React from 'react';
import ReactDOM from 'react-dom';
import { Intervals, STATE } from 'src/Constant';
import { useStores } from 'src/store';
import { INTERVALS_PER_ROW, TIntervalOption } from 'src/store/TimeperiodStore';
import { ChartType, TGranularity } from 'src/types';
import { getTimeIntervalName } from 'src/utils';
import { localize } from 'src/translations';
import AreaStyleSection from './AreaStylePicker';
import DialogShell from './DialogShell';

type TChartTypeDialogProps = {
    onChartType?: (chartType?: string) => void;
    onGranularity?: (granularity?: TGranularity) => void;
};

const chunk = <T,>(items: T[], size: number): T[][] =>
    items.reduce<T[][]>((rows, item, i) => {
        if (i % size === 0) rows.push([]);
        rows[rows.length - 1].push(item);
        return rows;
    }, []);

/**
 * The portal this bubble belongs to, found from the anchor rather than by id: the anchor is
 * already inside its own chart's portal, so this stays correct on a page with several charts
 * without threading an id down. Falls back to the body if the anchor is somehow detached.
 */
const portalFor = (anchor: React.RefObject<HTMLElement>) =>
    anchor.current?.closest('.smartcharts-quill-portal') ?? document.body;
/** Breathing room kept between the bubble and the viewport edges. */
const EDGE = 8;
/** Gap between the cell and the bubble pointing at it. */
const GAP = 8;
/** Half-width of the arrow, matching the `arrowSize: 4` quill passes on desktop. */
const ARROW = 4;

/**
 * The tap-driven equivalent of quill's hover tooltip.
 *
 * Portalled and fixed rather than positioned inside the sheet: the sheet scrolls
 * (`overflow: auto`) and its tiles sit only a heading's height below its top edge, so a
 * bubble rendered in place would be clipped. Borrows quill's own `tooltip-content` classes
 * so it is the same bubble the desktop hover shows.
 */
const TapTooltip = ({
    anchor,
    content,
    onDismiss,
}: {
    anchor: React.RefObject<HTMLElement>;
    content: string;
    onDismiss: () => void;
}) => {
    const ref = React.useRef<HTMLDivElement>(null);
    // Which side the bubble ended up on, so the arrow can point back at the cell.
    const [flipped, setFlipped] = React.useState(false);
    const [style, setStyle] = React.useState<React.CSSProperties>({
        left: 0,
        position: 'fixed',
        top: 0,
        visibility: 'hidden',
    });

    React.useLayoutEffect(() => {
        const place = () => {
            const cell = anchor.current?.getBoundingClientRect();
            const bubble = ref.current?.getBoundingClientRect();
            if (!cell || !bubble) return;

            // Centred over the cell, nudged in when that would overhang the screen.
            const cellCentre = cell.left + cell.width / 2;
            const maxLeft = window.innerWidth - EDGE - bubble.width;
            const left = Math.max(EDGE, Math.min(cellCentre - bubble.width / 2, maxLeft));

            // The arrow tracks the cell, not the bubble - a bubble nudged off an edge is
            // no longer centred on what it describes, and an arrow left in the middle
            // would point at the wrong tile. Kept clear of the rounded corners.
            const arrow = Math.max(ARROW * 2, Math.min(cellCentre - left, bubble.width - ARROW * 2));

            // Above the cell by preference, below it when there isn't room - the sheet
            // scrolls, and a short viewport (or a scrolled sheet) can leave a top row with
            // less headroom than the bubble needs. Clamped either way so it stays on screen.
            const above = cell.top - GAP - bubble.height;
            const flip = above < EDGE;
            const top = flip
                ? Math.min(cell.bottom + GAP, window.innerHeight - EDGE - bubble.height)
                : above;

            setStyle({
                left: Math.round(left),
                position: 'fixed',
                top: Math.round(Math.max(EDGE, top)),
                ['--sc-tooltip-arrow-left' as string]: `${Math.round(arrow)}px`,
            });
            setFlipped(flip);
        };

        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [anchor]);

    // Any tap that is not on this bubble or the cell it belongs to dismisses it. Taps on
    // another disabled cell land here first, so only one bubble is ever up.
    React.useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onDismiss();
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [anchor, onDismiss]);

    return ReactDOM.createPortal(
        <div
            ref={ref}
            style={style}
            className={classNames(
                'tooltip-content tooltip-content__variant-base sc-chart-type-dialog__tap-tooltip',
                { 'sc-chart-type-dialog__tap-tooltip--below': flipped }
            )}
            role='tooltip'
            // The bubble lands outside the shell's wrapper, so it claims its own taps;
            // `DialogStore` closes the dialog on any document click it does not see stamped.
            onClickCapture={e => {
                (e.nativeEvent as unknown as { isHandledByDialog?: boolean }).isHandledByDialog = true;
            }}
        >
            {/* The exact element quill puts in its own bubble, so the two match. */}
            <CaptionText color='var(--component-textIcon-inverse-default)'>{content}</CaptionText>
        </div>,
        portalFor(anchor)
    );
};

/**
 * The disabled reason, for assistive tech.
 *
 * Both visible affordances are pointer-driven - hover on desktop, tap on mobile - so a
 * screen-reader user has no way to trigger either. Rendering the text off-screen puts it in
 * the reading order next to the cell it explains. Plain hidden text rather than
 * `aria-description`, whose support is still uneven, or `aria-describedby`, which would
 * dangle whenever the bubble is closed.
 */
const ScreenReaderReason = ({ reason }: { reason: string }) => (
    <span className='sc-visually-hidden'>{reason}</span>
);

/**
 * One grid cell. Disabled cells explain *why* they are disabled; enabled ones are plain.
 * Both branches render a wrapper carrying the same `className`, so swapping a tooltip in
 * never changes the flex layout - without that, tooltip-wrapped cells collapse while their
 * unwrapped siblings stretch.
 *
 * Desktop reveals the reason on hover, via quill's tooltip. Touch has no hover and quill
 * keeps its tooltip's open state private, so mobile taps the cell to reveal the same text
 * and taps anywhere else to dismiss it.
 */
const Slot = observer(
    ({
        reason,
        show,
        className,
        children,
    }: {
        reason?: string;
        show: boolean;
        className: string;
        children: React.ReactNode;
    }) => {
        const { chart } = useStores();
        const { isMobile } = chart;
        const anchor = React.useRef<HTMLDivElement>(null);
        const [tapped, setTapped] = React.useState(false);
        const dismiss = React.useCallback(() => setTapped(false), []);

        // A cell that stops being disabled while its bubble is up should not keep it.
        React.useEffect(() => {
            if (!show || !reason) setTapped(false);
        }, [show, reason]);

        if (!show || !reason) return <div className={className}>{children}</div>;

        if (isMobile) {
            return (
                // Deliberately not a `role='button'`: the cell it wraps already carries
                // that role, and nesting one inside another misreports the control to a
                // screen reader.
                <div ref={anchor} className={className} onClick={() => setTapped(open => !open)}>
                    {children}
                    <ScreenReaderReason reason={reason} />
                    {tapped && <TapTooltip anchor={anchor} content={reason} onDismiss={dismiss} />}
                </div>
            );
        }

        return (
            <QuillTooltip as='div' className={className} tooltipContent={reason} tooltipPosition='top' hasArrow>
                {children}
                <ScreenReaderReason reason={reason} />
            </QuillTooltip>
        );
    }
);

const ChartTypeTile = observer(
    ({
        chartType,
        onSelect,
    }: {
        chartType: ChartType & { active?: boolean; disabled?: boolean };
        onSelect: (t: ChartType) => void;
    }) => {
        const Icon = chartType.icon;
        return (
            <div
                className={classNames('sc-chart-type-dialog__tile', {
                    'sc-chart-type-dialog__tile--active': chartType.active,
                    'sc-chart-type-dialog__tile--disabled': chartType.disabled,
                })}
                role='button'
                tabIndex={chartType.disabled ? -1 : 0}
                aria-disabled={chartType.disabled}
                aria-pressed={chartType.active}
                onClick={() => !chartType.disabled && onSelect(chartType)}
                onKeyDown={e => {
                    if (chartType.disabled) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(chartType);
                    }
                }}
            >
                {Icon && <Icon />}
                <span className='sc-chart-type-dialog__tile__label'>{localize(chartType.text)}</span>
            </div>
        );
    }
);

/**
 * Everything that reacts to a selection lives here, deliberately *below* `DialogShell`.
 *
 * quill's Modal declares its content component inside its own render body and mounts it as
 * `jsx(q, {})`, so `q` gets a fresh identity on every Modal render and React tears down the
 * whole subtree - the icons visibly flash. Keeping the observable reads in this inner
 * component means picking a chart type never re-renders the shell, so the Modal is left
 * alone and only this content updates.
 */
const ChartTypeDialogBody = observer(({ onChartType, onGranularity }: TChartTypeDialogProps) => {
    const { chartType, timeperiod, state, loader } = useStores();
    const { isActive: isLoading } = loader;
    const { types, type, setChartType, updateProps: updateChartTypeProps } = chartType;
    const { intervals, changeGranularity, setGranularity, updateProps: updateIntervalProps } = timeperiod;

    const onChartTypeChange = onChartType || setChartType;
    const onGranularityChange = onGranularity || setGranularity;

    React.useEffect(() => {
        updateChartTypeProps(onChartTypeChange);
        updateIntervalProps(onGranularityChange);
    });

    // Selecting does NOT dismiss the dialog: chart type and interval are commonly changed
    // together, and each choice is reflected live behind the overlay. The user closes it
    // when they're done, via the close button, the overlay, Escape or a swipe down.
    const onSelectChartType = (selected: ChartType) => {
        if (isLoading || selected.disabled || type?.id === selected.id) return;
        if (selected.id) {
            state.stateChange(STATE.CHART_TYPE_CHANGE, {
                chart_type_name: selected.text.toLowerCase(),
                time_interval_name: getTimeIntervalName(state.granularity, Intervals),
            });
        }
        onChartTypeChange(selected.id);
    };

    const onSelectInterval = (option: TIntervalOption) => {
        if (isLoading || option.disabled || option.active) return;
        changeGranularity(option.interval);
    };

    // Tooltips explain disabled options on both platforms - hover on desktop, tap on
    // mobile (see `Slot`). A spinner already communicates "busy", so they are suppressed
    // only while loading.
    const showTooltips = !isLoading;

    return (
        <div className='sc-chart-type-dialog__content'>
            <section className='sc-chart-type-dialog__section'>
                <h2 className='sc-quill-dialog__heading'>{localize('Chart type')}</h2>
                <div className='sc-chart-type-dialog__types'>
                    {types.map(item => (
                        <Slot
                            key={item.id}
                            className='sc-chart-type-dialog__tile-slot'
                            reason={item.disabledReason}
                            show={showTooltips && !!item.disabled}
                        >
                            <ChartTypeTile chartType={item} onSelect={onSelectChartType} />
                        </Slot>
                    ))}
                </div>
            </section>

            {/* Shown for the Area chart only, but rendered unconditionally: the section
                owns its own divider and animates itself in and out, so switching chart
                type eases rather than jumps. See `AreaStyleSection`. */}
            <AreaStyleSection />

            <div className='sc-quill-dialog__divider' />

            <section className='sc-chart-type-dialog__section'>
                <h2 className='sc-quill-dialog__heading'>{localize('Time interval')}</h2>
                <div className='sc-chart-type-dialog__intervals'>
                    {chunk(intervals, INTERVALS_PER_ROW).map(row => (
                        <div className='sc-chart-type-dialog__interval-row' key={`row-${row[0].interval}`}>
                            {row.map(option => (
                                <Slot
                                    key={option.interval}
                                    className='sc-chart-type-dialog__interval'
                                    reason={option.disabledReason}
                                    show={showTooltips && option.disabled}
                                >
                                    <Chip.Selectable
                                        label={option.label}
                                        selected={option.active}
                                        disabled={option.disabled || isLoading}
                                        size='md'
                                        onChipSelect={() => onSelectInterval(option)}
                                    />
                                </Slot>
                            ))}
                            {/* The last row is short; empty cells keep every column the
                                    same width across rows, as the design's grid does. */}
                            {Array.from({ length: INTERVALS_PER_ROW - row.length }).map((_, i) => (
                                <div
                                    // eslint-disable-next-line react/no-array-index-key
                                    key={`spacer-${i}`}
                                    className='sc-chart-type-dialog__interval sc-chart-type-dialog__interval--spacer'
                                    aria-hidden='true'
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
});

/**
 * The redesigned "Chart type" dialog: chart type and time interval in one surface.
 * Renders as a centred modal on desktop and a bottom sheet on mobile.
 *
 * This shell observes only `menuStore.open`, so it re-renders when the dialog opens or
 * closes and at no other time - see `ChartTypeDialogBody` for why that matters.
 */
const ChartTypeDialog = ({ onChartType, onGranularity }: TChartTypeDialogProps) => {
    const { chartMode } = useStores();
    const { menuStore } = chartMode;
    const close = React.useCallback(() => menuStore.setOpen(false), [menuStore]);

    return (
        <DialogShell open={menuStore.open} onClose={close} className='sc-chart-type-dialog'>
            <ChartTypeDialogBody onChartType={onChartType} onGranularity={onGranularity} />
        </DialogShell>
    );
};

export default observer(ChartTypeDialog);
