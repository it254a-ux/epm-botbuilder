import {
    StandaloneChevronDownRegularIcon,
    StandaloneChevronUpRegularIcon,
    StandaloneCircleInfoRegularIcon,
} from '@deriv/quill-icons';
import classNames from 'classnames';
import React from 'react';
import ReactDOM from 'react-dom';
import {
    TIndicatorItem,
    TNumberColorPickerParameter,
    TNumberParameter,
    TSelectParameter,
    TSettingsParameter,
} from 'src/types';
import { localize } from 'src/translations';

/**
 * The swatches offered by the colour dropdown, taken from the design's picker.
 *
 * Saved layouts may hold a colour outside this set - a value picked before the redesign, or
 * one a theme swap produced. Those still render on their trigger; the grid simply shows no
 * selection until the user chooses again.
 */
const SWATCHES = [
    '#53b9ff',
    '#f88f54',
    '#ff4d4d',
    '#a556dd',
    '#00822a',
    '#098d9c',
    '#5569f9',
    '#4dbc6b',
    '#54bdc8',
    '#ffbe4d',
    '#e18d00',
    '#787d88',
];

/** Bounds the catalogue leaves off a `number` parameter, matching the legacy Slider defaults. */
const numberBounds = (parameter: TNumberParameter) => ({
    min: parameter.min ?? 1,
    max: parameter.max ?? 100,
    step: parameter.step ?? 1,
});

/**
 * The portal this bubble belongs to, found from the anchor rather than by id: the anchor is
 * already inside its own chart's portal, so this stays correct on a page with several charts
 * without threading an id down. Falls back to the body if the anchor is somehow detached.
 */
const portalFor = (anchor: React.RefObject<HTMLElement>) =>
    anchor.current?.closest('.smartcharts-quill-portal') ?? document.body;
/** Breathing room kept between a popover and the dialog's edges. */
const EDGE = 8;
/** Gap between the trigger and its popover. */
const GAP = 4;

type TPopoverProps = {
    anchor: React.RefObject<HTMLElement>;
    open: boolean;
    onClose: () => void;
    className: string;
    /**
     * Size the surface to its trigger, the way a select's menu lines up with its field. The
     * swatch grid opts out: its width comes from the grid itself.
     */
    matchAnchorWidth?: boolean;
    children: React.ReactNode;
};

/**
 * A dropdown surface rendered outside the settings pane.
 *
 * The pane scrolls, so an absolutely positioned menu was clipped by it: a field low in the
 * form lost its menu behind the Reset/Apply footer. Portalling into the dialog's own container
 * and positioning from the trigger's rect lifts the menu above both, and measuring it first
 * lets it shift left when the trigger sits near the dialog's right edge.
 *
 * It always opens downwards. Flipping above a low field keeps the menu on screen, but it also
 * makes the same control behave differently depending on where it happens to sit, so a menu
 * that would run past the bottom is capped and scrolled instead.
 */
const Popover = ({ anchor, open, onClose, className, matchAnchorWidth, children }: TPopoverProps) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const [style, setStyle] = React.useState<React.CSSProperties>({
        left: 0,
        position: 'fixed',
        top: 0,
        visibility: 'hidden',
    });

    React.useLayoutEffect(() => {
        if (!open) return undefined;

        const place = () => {
            const trigger = anchor.current?.getBoundingClientRect();
            if (!trigger || !ref.current) return;

            // Apply the width before measuring, so the height read back is the height at the
            // width the surface will actually be drawn at.
            const width = matchAnchorWidth ? trigger.width : undefined;
            if (width !== undefined) ref.current.style.width = `${width}px`;
            const menu = ref.current.getBoundingClientRect();

            // Clamp horizontally to the dialog - that is the surface the user perceives as
            // the menu's container. Vertically the menu may overhang it, since the alternative
            // is flipping, and it only has to stay on screen.
            const bounds = anchor.current?.closest('.sc-quill-dialog')?.getBoundingClientRect();
            const minLeft = (bounds?.left ?? 0) + EDGE;
            const maxLeft = (bounds?.right ?? window.innerWidth) - EDGE - menu.width;

            const top = trigger.bottom + GAP;
            const room = window.innerHeight - EDGE - top;

            setStyle({
                left: Math.round(Math.max(minLeft, Math.min(trigger.left, maxLeft))),
                // Only constrain when the menu would actually run off screen, so the
                // stylesheet's own cap still applies in the ordinary case.
                maxHeight: menu.height > room ? Math.max(room, 0) : undefined,
                position: 'fixed',
                top: Math.round(top),
                width,
            });
        };

        place();
        window.addEventListener('resize', place);
        // Capture phase so the pane's own scrolling re-places the menu, not just the window's.
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, anchor, matchAnchorWidth]);

    React.useEffect(() => {
        if (!open) return undefined;
        const onDocumentDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onClose();
        };
        document.addEventListener('mousedown', onDocumentDown);
        return () => document.removeEventListener('mousedown', onDocumentDown);
    }, [open, anchor, onClose]);

    if (!open) return null;

    const host = portalFor(anchor);

    return ReactDOM.createPortal(
        <div
            ref={ref}
            className={className}
            style={style}
            // The popover lands outside the shell's wrapper, so it has to claim its own clicks;
            // `DialogStore` closes the dialog on any document click it does not see stamped.
            onClickCapture={e => {
                (e.nativeEvent as unknown as { isHandledByDialog?: boolean }).isHandledByDialog = true;
            }}
        >
            {children}
        </div>,
        host
    );
};

type TColorFieldProps = {
    label: string;
    color: string;
    onChange: (color: string) => void;
};

/**
 * Colour parameters render as a dropdown whose trigger shows the current colour, opening a
 * swatch grid. Built here rather than with quill's Dropdown because the trigger is a colour
 * dot plus a label and the menu is a grid, neither of which that component models.
 */
const ColorField = ({ label, color, onChange }: TColorFieldProps) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    const close = React.useCallback(() => setOpen(false), []);

    return (
        <div className='sc-indicators-dialog__field' ref={ref}>
            <button
                type='button'
                className={classNames('sc-indicators-dialog__field__control', {
                    'sc-indicators-dialog__field__control--open': open,
                })}
                onClick={() => setOpen(o => !o)}
            >
                <span className='sc-indicators-dialog__swatch' style={{ background: color }} />
                <span className='sc-indicators-dialog__field__label'>{label}</span>
                {open ? (
                    <StandaloneChevronUpRegularIcon iconSize='sm' />
                ) : (
                    <StandaloneChevronDownRegularIcon iconSize='sm' />
                )}
            </button>
            <Popover anchor={ref} open={open} onClose={close} className='sc-indicators-dialog__swatches'>
                {SWATCHES.map(swatch => (
                    <button
                        type='button'
                        key={swatch}
                        aria-label={swatch}
                        className={classNames('sc-indicators-dialog__swatches__item', {
                            'sc-indicators-dialog__swatches__item--selected':
                                swatch.toLowerCase() === (color || '').toLowerCase(),
                        })}
                        style={{ background: swatch }}
                        onClick={() => {
                            onChange(swatch);
                            setOpen(false);
                        }}
                    />
                ))}
            </Popover>
        </div>
    );
};

type TSelectFieldProps = {
    label: string;
    value: string;
    options: Record<string, string>;
    onChange: (value: string) => void;
};

/** `select` parameters (e.g. "Field: Close") reuse the colour field's dropdown shell. */
const SelectField = ({ label, value, options, onChange }: TSelectFieldProps) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    const close = React.useCallback(() => setOpen(false), []);

    return (
        <div className='sc-indicators-dialog__field' ref={ref}>
            <button
                type='button'
                className={classNames('sc-indicators-dialog__field__control', {
                    'sc-indicators-dialog__field__control--open': open,
                })}
                onClick={() => setOpen(o => !o)}
            >
                <span className='sc-indicators-dialog__field__label'>
                    {label}
                    <em>{options[value] ?? value}</em>
                </span>
                {open ? (
                    <StandaloneChevronUpRegularIcon iconSize='sm' />
                ) : (
                    <StandaloneChevronDownRegularIcon iconSize='sm' />
                )}
            </button>
            <Popover
                anchor={ref}
                open={open}
                onClose={close}
                className='sc-indicators-dialog__options'
                matchAnchorWidth
            >
                {Object.keys(options).map(key => (
                    <button
                        type='button'
                        key={key}
                        className={classNames('sc-indicators-dialog__options__item', {
                            'sc-indicators-dialog__options__item--selected': key === value,
                        })}
                        onClick={() => {
                            onChange(key);
                            setOpen(false);
                        }}
                    >
                        {options[key]}
                    </button>
                ))}
            </Popover>
        </div>
    );
};

type TSliderFieldProps = {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
};

/** `number` parameters render as the design's labelled slider with the value on the right. */
const SliderField = ({ label, value, min, max, step, onChange }: TSliderFieldProps) => (
    <div className='sc-indicators-dialog__slider'>
        <div className='sc-indicators-dialog__slider__head'>
            <span className='sc-indicators-dialog__slider__label'>{label}</span>
            <span className='sc-indicators-dialog__slider__value'>{value}</span>
        </div>
        <input
            type='range'
            className='sc-indicators-dialog__slider__input'
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={label}
            onChange={e => onChange(Number(e.target.value))}
            // Fills the travelled portion of the track; a plain range input cannot express this.
            style={{ '--sc-slider-progress': `${((value - min) / (max - min || 1)) * 100}%` } as React.CSSProperties}
        />
    </div>
);

type TIndicatorSettingsProps = {
    indicator: TIndicatorItem;
    parameters: TSettingsParameter[];
    /** Absent while adding - there is nothing to reset to yet beyond the defaults. */
    onChange: (parameters: TSettingsParameter[]) => void;
    onReset: () => void;
    onApply: () => void;
    isDirty: boolean;
    canApply: boolean;
};

/**
 * The staged settings page. Nothing here touches the chart: the parent owns the working copy
 * of the parameters and only commits it when Apply is pressed.
 */
const IndicatorSettings = ({
    indicator,
    parameters,
    onChange,
    onReset,
    onApply,
    isDirty,
    canApply,
}: TIndicatorSettingsProps) => {
    const setValue = (index: number, value: unknown) => {
        const next = parameters.map((parameter, i) => (i === index ? { ...parameter, value } : parameter));
        onChange(next as TSettingsParameter[]);
    };

    // The catalogue prefixes grouped parameters with their group name ("OverBought Value");
    // the design shows just the parameter, so the redundant prefix is trimmed.
    const labelFor = (parameter: TSettingsParameter) =>
        parameter.subtitle ? `${parameter.title} ${parameter.subtitle}`.trim() : parameter.title;

    const colorFields: React.ReactElement[] = [];
    const rest: React.ReactElement[] = [];

    parameters.forEach((parameter, index) => {
        const key = `${parameter.type}-${parameter.path ?? parameter.title}-${index}`;

        switch (parameter.type) {
            case 'colorpicker':
                colorFields.push(
                    <ColorField
                        key={key}
                        label={labelFor(parameter)}
                        color={(parameter.value as string) ?? ''}
                        onChange={value => setValue(index, value)}
                    />
                );
                break;
            case 'select':
                colorFields.push(
                    <SelectField
                        key={key}
                        label={labelFor(parameter)}
                        value={(parameter.value as string) ?? ''}
                        options={(parameter as TSelectParameter).options ?? {}}
                        onChange={value => setValue(index, value)}
                    />
                );
                break;
            case 'number': {
                const { min, max, step } = numberBounds(parameter as TNumberParameter);
                rest.push(
                    <SliderField
                        key={key}
                        label={labelFor(parameter)}
                        value={Number(parameter.value ?? min)}
                        min={min}
                        max={max}
                        step={step}
                        onChange={value => setValue(index, value)}
                    />
                );
                break;
            }
            case 'switch':
                rest.push(
                    <div className='sc-indicators-dialog__toggle' key={key}>
                        <span className='sc-indicators-dialog__toggle__label'>{labelFor(parameter)}</span>
                        <button
                            type='button'
                            role='switch'
                            aria-checked={!!parameter.value}
                            aria-label={labelFor(parameter)}
                            className={classNames('sc-indicators-dialog__toggle__control', {
                                'sc-indicators-dialog__toggle__control--on': !!parameter.value,
                            })}
                            onClick={() => setValue(index, !parameter.value)}
                        />
                    </div>
                );
                break;
            case 'numbercolorpicker': {
                // A paired value + colour (e.g. RSI's OverBought level and its line colour).
                const paired = (parameter as TNumberColorPickerParameter).value ?? { value: 0, color: '' };
                rest.push(
                    <div className='sc-indicators-dialog__paired' key={key}>
                        <span className='sc-indicators-dialog__paired__label'>{labelFor(parameter)}</span>
                        <input
                            type='number'
                            className='sc-indicators-dialog__paired__value'
                            value={paired.value}
                            aria-label={labelFor(parameter)}
                            onChange={e => setValue(index, { ...paired, value: Number(e.target.value) })}
                        />
                        <ColorField
                            label=''
                            color={paired.color}
                            onChange={color => setValue(index, { ...paired, color })}
                        />
                    </div>
                );
                break;
            }
            default:
                break;
        }
    });

    return (
        <div className='sc-indicators-dialog__settings'>
            <div className='sc-indicators-dialog__settings__scroll'>
                {colorFields.length > 0 && (
                    <div className='sc-indicators-dialog__settings__grid'>{colorFields}</div>
                )}
                {rest.length > 0 && <div className='sc-indicators-dialog__settings__stack'>{rest}</div>}

                {indicator.description && (
                    <div className='sc-indicators-dialog__note'>
                        <StandaloneCircleInfoRegularIcon iconSize='sm' className='sc-indicators-dialog__note__icon' />
                        <div className='sc-indicators-dialog__note__body'>
                            <p className='sc-indicators-dialog__note__title'>
                                {localize('What is {{name}}?', { name: indicator.short_name })}
                            </p>
                            <p className='sc-indicators-dialog__note__text'>{indicator.description}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className='sc-indicators-dialog__settings__actions'>
                <button
                    type='button'
                    className='sc-indicators-dialog__btn sc-indicators-dialog__btn--secondary'
                    disabled={!isDirty}
                    onClick={onReset}
                >
                    {localize('Reset')}
                </button>
                <button
                    type='button'
                    className='sc-indicators-dialog__btn sc-indicators-dialog__btn--primary'
                    disabled={!canApply}
                    onClick={onApply}
                >
                    {localize('Apply')}
                </button>
            </div>
        </div>
    );
};

export { SWATCHES };
export default IndicatorSettings;
