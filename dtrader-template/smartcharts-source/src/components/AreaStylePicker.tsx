import { StandaloneChevronDownRegularIcon } from '@deriv/quill-icons';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import React from 'react';
import {
    AREA_CHART_TYPE_ID,
    AREA_COLORS,
    AREA_FILL,
    AREA_FILLS,
    AREA_GRADIENT_START_OPACITY,
    AREA_THICKNESSES,
} from 'src/constants/areaStyle';
import { useStores } from 'src/store';
import { localize } from 'src/translations';

/**
 * The sample series drawn in the fill previews - a plausible price line rather than a
 * decorative zig-zag, so the two tiles read as the chart they configure.
 *
 * Traced in the preview's own 96x48 viewBox, insets left for the stroke's own width at
 * the thickest setting.
 */
const PREVIEW_LINE = 'M2 35 L11 30 L20 33 L29 22 L38 27 L47 14 L56 20 L65 10 L74 15 L83 7 L94 12';
const PREVIEW_WIDTH = 96;
const PREVIEW_HEIGHT = 48;

/** The line path closed down to the baseline, which is what the gradient fills. */
const PREVIEW_AREA = `${PREVIEW_LINE} L${PREVIEW_WIDTH - 2} ${PREVIEW_HEIGHT} L2 ${PREVIEW_HEIGHT} Z`;

/**
 * A miniature of the chart as configured: the selected colour and thickness, with or
 * without the gradient beneath the line.
 *
 * `currentColor` throughout, so the whole preview follows the `color` the tile's CSS
 * resolves - the chosen swatch, or the theme's own area colour for "Default", which has
 * no hex of its own and differs between light and dark.
 */
const AreaPreview = ({ hasGradient, thickness }: { hasGradient: boolean; thickness: number }) => {
    // Namespaced per instance: several previews (and several charts) share a document,
    // and a duplicated gradient id would have them all painting the first one's fill.
    const gradientId = `sc-area-preview-${React.useId()}`;

    return (
        <svg
            className='sc-area-style__preview'
            viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
            preserveAspectRatio='none'
            aria-hidden='true'
            focusable='false'
        >
            {hasGradient && (
                <>
                    <defs>
                        <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                            <stop offset='0%' stopColor='currentColor' stopOpacity={AREA_GRADIENT_START_OPACITY} />
                            <stop offset='100%' stopColor='currentColor' stopOpacity='0' />
                        </linearGradient>
                    </defs>
                    <path d={PREVIEW_AREA} fill={`url(#${gradientId})`} />
                </>
            )}
            <path
                d={PREVIEW_LINE}
                fill='none'
                stroke='currentColor'
                strokeWidth={thickness}
                strokeLinejoin='round'
                strokeLinecap='round'
                // The preview is stretched to the tile (`preserveAspectRatio: none`), which
                // would scale the stroke unevenly with it. This keeps it at its nominal
                // width, so "Thin/Medium/Thick" read as the pixel weights they are.
                vectorEffect='non-scaling-stroke'
            />
        </svg>
    );
};

/** One selectable cell. `aria-pressed` matches the chart-type tiles above it. */
const Option = ({
    label,
    selected,
    onSelect,
    className,
    children,
}: {
    label: string;
    selected: boolean;
    onSelect: () => void;
    className: string;
    children: React.ReactNode;
}) => (
    <button
        type='button'
        className={classNames(className, { [`${className}--active`]: selected })}
        aria-pressed={selected}
        aria-label={label}
        onClick={onSelect}
    >
        {children}
    </button>
);

/**
 * A labelled set of mutually exclusive cells.
 *
 * `aria-label` rather than `aria-labelledby`: the visible label is a plain span, and
 * naming the group directly avoids threading a generated id through for a string that is
 * already to hand - which is also why the label is taken once and used for both.
 */
const Group = ({
    label,
    className,
    cellsClassName,
    children,
}: {
    label: string;
    className?: string;
    cellsClassName: string;
    children: React.ReactNode;
}) => (
    <div className={classNames('sc-area-style__group', className)}>
        <span className='sc-area-style__label'>{label}</span>
        <div className={cellsClassName} role='group' aria-label={label}>
            {children}
        </div>
    </div>
);

/** The controls themselves - see `AreaStyleSection` for the disclosure around them. */
const AreaStyleControls = observer(() => {
    const { areaStyle } = useStores();
    const { fill, color, colorId, thicknessId, thickness, setFill, setColor, setThickness } = areaStyle;

    return (
        <div className='sc-area-style'>
            <Group label={localize('Fill')} cellsClassName='sc-area-style__fills'>
                {AREA_FILLS.map(option => (
                    <Option
                        key={option.id}
                        className='sc-area-style__fill'
                        label={localize(option.label)}
                        selected={fill === option.id}
                        onSelect={() => setFill(option.id)}
                    >
                        <span
                            className='sc-area-style__fill__canvas'
                            // The preview shows the colour that is actually selected, so
                            // the two tiles differ only in the fill they name.
                            style={{ color }}
                        >
                            <AreaPreview hasGradient={option.id === AREA_FILL.GRADIENT} thickness={thickness} />
                        </span>
                        <span className='sc-area-style__fill__label'>{localize(option.label)}</span>
                    </Option>
                ))}
            </Group>

            {/* Colour and thickness share a row where there is width for both - stacking
                all three groups pushed the time intervals out of the desktop modal. The
                row wraps when there isn't, which is the mobile sheet's case. */}
            <div className='sc-area-style__row'>
                {/* "Color", not "Colour": the key already exists in every locale,
                    translated for the indicator settings. */}
                <Group
                    label={localize('Color')}
                    className='sc-area-style__group--colour'
                    cellsClassName='sc-area-style__colours'
                >
                    {AREA_COLORS.map(option => (
                        <Option
                            key={option.id}
                            className='sc-area-style__colour'
                            label={localize(option.label)}
                            selected={colorId === option.id}
                            onSelect={() => setColor(option.id)}
                        >
                            {/* "Default" has no hex of its own: it leaves the engine on
                                the theme's area colour, so the swatch falls through to
                                the CSS value of that same token. */}
                            <span className='sc-area-style__colour__swatch' style={{ background: option.color }} />
                        </Option>
                    ))}
                </Group>

                <Group
                    label={localize('Line thickness')}
                    className='sc-area-style__group--thickness'
                    cellsClassName='sc-area-style__thicknesses'
                >
                    {AREA_THICKNESSES.map(option => (
                        <Option
                            key={option.id}
                            className='sc-area-style__thickness'
                            label={localize(option.label)}
                            selected={thicknessId === option.id}
                            onSelect={() => setThickness(option.id)}
                        >
                            <span
                                className='sc-area-style__thickness__line'
                                style={{ blockSize: option.thickness, color }}
                            />
                            <span className='sc-area-style__thickness__label'>{localize(option.label)}</span>
                        </Option>
                    ))}
                </Group>
            </div>
        </div>
    );
});

/**
 * The Area chart's appearance - gradient fill, line colour and line thickness.
 *
 * On desktop the modal has room for the controls, so they are simply always there and the
 * heading is an ordinary one, matching the two headings around it. Only the sheet is tight
 * enough to need a disclosure, so the toggle - and its chevron - exist on mobile alone.
 *
 * Two things change this section's height, and both animate through the *same* clipped
 * box so they cannot fight each other:
 *
 *   - the disclosure, between the heading row alone and the heading plus the controls;
 *   - the chart type, between that and nothing at all, because the candle types are
 *     painted from the theme's `candleStyle` and have nothing here to configure.
 *
 * Desktop only ever sees the second of those, but shares the same machinery.
 *
 * A second nested box for the chart-type half would have to re-measure a target that is
 * itself mid-transition, so instead the box's height is computed from two measurements -
 * the whole content, and the controls on their own - and the difference is the height of
 * the heading row. That does mean the controls stay mounted on the candle types; they are
 * clipped to zero height and `visibility: hidden`, so they are neither painted nor in the
 * tab order or the accessibility tree.
 *
 * `max-block-size` rather than `grid-template-rows: 0fr/1fr`, which is newer than this
 * library's browser floor. Measured with a `ResizeObserver` rather than read once, because
 * the controls reflow from two rows to three when the container is too narrow for colour
 * and thickness side by side - a height captured on mount would clip after that reflow.
 *
 * Nothing is measured until after the first paint, and no transition is armed until the
 * first measurement lands. Both matter:
 *
 *   - a layout read in `useLayoutEffect` forces a synchronous style flush while the dialog
 *     is still mounting, which painted the whole action sheet at its resting position for
 *     one frame before quill's own enter transition had begun - a visible flash of an
 *     already-open sheet;
 *   - and a height going from its unmeasured default to a measured one would animate,
 *     so the section slid open every single time the dialog was opened.
 *
 * Until that first measurement the heights come from CSS alone, which gets the same
 * geometry without anyone having to measure anything: the box is left to size itself, and
 * a collapsed panel is clipped to zero by a class. Switching to the measured numbers is
 * therefore invisible - the box is already exactly that tall.
 */
const AreaStyleSection = observer(() => {
    const { areaStyle, chart, chartType } = useStores();
    const { isMobile } = chart;
    const { isExpanded, toggleExpanded } = areaStyle;
    const isAreaChart = chartType.type?.id === AREA_CHART_TYPE_ID;

    // Desktop has no toggle, so the controls are unconditionally shown there. Everything
    // below keys off this rather than `isExpanded`, which only means anything on mobile.
    const isOpen = !isMobile || isExpanded;

    const contentRef = React.useRef<HTMLDivElement>(null);
    const controlsRef = React.useRef<HTMLDivElement>(null);
    const [measured, setMeasured] = React.useState<{ content: number; controls: number } | null>(null);

    const revealRef = React.useRef<HTMLDivElement>(null);
    const isPinned = React.useRef(false);

    /**
     * The mobile sheet's scroll region, or null on desktop, where the dialog is a Modal
     * and `DialogShell` renders no sheet at all - which is what makes everything below a
     * no-op there. `sc-quill-sheet` is `DialogShell`'s own marker for that element rather
     * than quill's undocumented internal class.
     */
    const getSheet = React.useCallback(() => {
        const sheet = contentRef.current?.closest('.sc-quill-sheet');
        return sheet instanceof HTMLElement ? sheet : null;
    }, []);

    /**
     * Holds the mobile sheet at the height it has with the section closed, for as long as
     * it is open.
     *
     * The sheet is anchored to the bottom of the screen and hugs its content, so growing
     * it would drag the handle - and the chart behind it - upwards. Held, the handle stays
     * put and the disclosure pushes the time intervals down into the sheet's own scroll
     * region instead.
     *
     * A ceiling rather than a fixed height, which matters on the way back: the sheet is
     * free to be *shorter* than the hold, so once the closing section has shrunk the
     * content below it the sheet simply follows it down. That is what carries the sheet
     * smoothly to the shorter height a candle type needs, instead of snapping to it.
     *
     * The same element this file caps at 60vh.
     */
    const holdSheet = React.useCallback(
        (height: number | null) => {
            const sheet = getSheet();
            if (!sheet) return;
            sheet.style.maxBlockSize = height === null ? '' : `${height}px`;
            isPinned.current = height !== null;
        },
        [getSheet]
    );

    const onToggle = () => {
        // Taken before the state changes: once the reveal box starts animating, the
        // sheet's own height is a moving target and would be held at a half-open value.
        // Nothing is released here - see the effect below for why.
        const sheet = getSheet();
        if (!isExpanded && sheet) holdSheet(sheet.getBoundingClientRect().height);
        toggleExpanded();
    };
    // Stable across re-renders and unique per instance, so several charts on one page do
    // not point their triggers at each other's panel.
    const panelId = `sc-area-style-panel-${React.useId()}`;

    React.useEffect(() => {
        const contentEl = contentRef.current;
        const controlsEl = controlsRef.current;
        if (!contentEl || !controlsEl) return;

        // `getBoundingClientRect` rather than `scrollHeight`, which is rounded to whole
        // pixels: the two values are subtracted from each other, so a rounding error in
        // either would show up as a clipped row or a visible sliver.
        const measure = () =>
            setMeasured({
                content: contentEl.getBoundingClientRect().height,
                controls: controlsEl.getBoundingClientRect().height,
            });

        let resizeObserver: ResizeObserver | undefined;
        // One frame past mount, so the read cannot land inside the sheet's own entrance.
        // The observer is created here too rather than above: it delivers an initial
        // callback of its own, which would otherwise measure at exactly the wrong moment.
        const frame = requestAnimationFrame(() => {
            measure();
            resizeObserver = new ResizeObserver(measure);
            resizeObserver.observe(contentEl);
            resizeObserver.observe(controlsEl);
        });

        return () => {
            cancelAnimationFrame(frame);
            resizeObserver?.disconnect();
        };
    }, []);

    React.useEffect(() => {
        if (isOpen) {
            // The dialog opened with the section already disclosed, so the heading row was
            // never clicked. Nothing has animated yet either, which makes the sheet's full
            // scroll extent less the controls exactly the height it would have had closed.
            if (isPinned.current || !measured) return;
            const sheet = getSheet();
            if (sheet) holdSheet(sheet.scrollHeight - measured.controls);
            return;
        }

        if (!isPinned.current) return;

        // Released only once the section has finished closing - by the heading row, or by
        // the chart type leaving Area, which closes it for us. Releasing at the moment the
        // collapse *starts* would let the sheet briefly hug content that is still fully
        // open, which is a jump up to the 60vh cap and straight back down again.
        const reveal = revealRef.current;
        const release = () => holdSheet(null);
        if (!reveal) {
            release();
            return;
        }

        // Any of the reveal's own transitions ending will do: they share a duration, so
        // whichever arrives first marks the end of the collapse.
        const onEnd = (e: TransitionEvent) => {
            if (e.target === reveal) release();
        };
        reveal.addEventListener('transitionend', onEnd);
        // `prefers-reduced-motion` strips the transition, so no event would ever arrive.
        const fallback = window.setTimeout(release, 400);

        return () => {
            reveal.removeEventListener('transitionend', onEnd);
            window.clearTimeout(fallback);
        };
    }, [isOpen, measured, getSheet, holdSheet]);

    // `undefined` leaves the element to size itself, which is the right answer for every
    // state that CSS can reach on its own - see the note above.
    let maxBlockSize: number | undefined;
    if (!isAreaChart) {
        maxBlockSize = 0;
    } else if (measured) {
        maxBlockSize = isOpen ? measured.content : measured.content - measured.controls;
    }

    return (
        <div
            ref={revealRef}
            className={classNames('sc-area-settings-reveal', {
                'sc-area-settings-reveal--hidden': !isAreaChart,
                'sc-area-settings-reveal--animated': !!measured,
            })}
            style={{
                maxBlockSize,
                // Discrete, so it flips at the far end of a collapse and the start of an
                // expand - which keeps the whole section out of the tab order while it is
                // away, without cutting the animation short.
                visibility: isAreaChart ? 'visible' : 'hidden',
            }}
        >
            {/* Measured at its natural height: the clipping is the parent's job. */}
            <div className='sc-area-settings-reveal__content' ref={contentRef}>
                {/* Inside the animated box, so it leaves with the section instead of
                    stranding a rule above the time intervals. */}
                <div className='sc-quill-dialog__divider' />

                <section className='sc-chart-type-dialog__section sc-area-settings'>
                    {isMobile ? (
                        // The button inside the heading, not the other way round: a heading
                        // is flow content and cannot legally sit inside a button, and this
                        // is the shape assistive tech expects of a disclosure.
                        <h2 className='sc-quill-dialog__heading sc-area-settings__heading'>
                            <button
                                type='button'
                                className='sc-area-settings__trigger'
                                aria-expanded={isExpanded}
                                aria-controls={panelId}
                                onClick={onToggle}
                            >
                                <span>{localize('Area settings')}</span>
                                <StandaloneChevronDownRegularIcon
                                    className='sc-area-settings__chevron'
                                    iconSize='sm'
                                    // The icon's own colour, so it tracks the heading
                                    // rather than quill's default fill.
                                    fill='currentColor'
                                />
                            </button>
                        </h2>
                    ) : (
                        // Nothing to toggle, so nothing to announce - a plain heading, the
                        // same as "Chart type" and "Time interval" on either side of it.
                        <h2 className='sc-quill-dialog__heading'>{localize('Area settings')}</h2>
                    )}

                    {/* Clipped by the class only until the first measurement, after
                        which the reveal box above does all the clipping. */}
                    <div
                        ref={controlsRef}
                        id={panelId}
                        className={classNames('sc-area-settings__panel', {
                            'sc-area-settings__panel--clipped': !measured && !isOpen,
                        })}
                        style={{ visibility: isOpen ? 'visible' : 'hidden' }}
                    >
                        <AreaStyleControls />
                    </div>
                </section>
            </div>
        </div>
    );
});

export default AreaStyleSection;
