import { localize } from 'src/translations';
/**
 * The user-configurable appearance of the Area chart: its line colour, the line's
 * thickness, and whether the gradient below the line is filled in.
 *
 * Only the Area chart (`ChartTypes` id `line`) is affected - candle, hollow and OHLC take
 * their colours from the theme's `candleStyle` and have nothing to configure here.
 */

/** The `ChartTypes` id of the Area chart - the only type with a configurable style. */
export const AREA_CHART_TYPE_ID = 'line';

/** Whether the area below the line is filled with a gradient. */
export const AREA_FILL = {
    GRADIENT: 'gradient',
    LINE: 'line',
} as const;

export type TAreaFill = (typeof AREA_FILL)[keyof typeof AREA_FILL];

/**
 * The fills as offered, in order - the same shape as the colour and thickness lists.
 *
 * Every label below is wrapped in `localize` here as well as at the point of use, the
 * way `ChartTypes` does it. The wrapper at this end is what puts the string literal where
 * the translations extractor finds it - it only sees literals, so a label reached through
 * a variable would never be translated. The call at the point of use is what makes it
 * react to a language change.
 */
export const AREA_FILLS: readonly { id: TAreaFill; label: string }[] = [
    { id: AREA_FILL.GRADIENT, label: localize('Gradient') },
    { id: AREA_FILL.LINE, label: localize('Line only') },
];

export type TAreaColorId = 'default' | 'blue' | 'emerald' | 'coral' | 'grape' | 'orange';

export type TAreaColorOption = {
    id: TAreaColorId;
    label: string;
    /**
     * Absent for `default`, deliberately: the engine then falls back to the chart theme's
     * own area colour, which is near-black on light and near-white on dark. Pinning a
     * single hex here would make one of the two themes unreadable.
     */
    color?: string;
};

/**
 * The colour seeds offered for the Area chart.
 *
 * Quill core solid tokens, each picked at a shade that reads against both the light
 * (#ffffff) and dark (#181c25) chart surfaces. Written out as literal hex because they
 * are sent to the engine, which has no access to CSS custom properties.
 */
export const AREA_COLORS: readonly TAreaColorOption[] = [
    { id: 'default', label: localize('Default') },
    { id: 'blue', label: localize('Blue'), color: '#2C9AFF' }, // --core-color-solid-blue-700
    { id: 'emerald', label: localize('Green'), color: '#00C390' }, // --core-color-solid-emerald-700
    { id: 'coral', label: localize('Red'), color: '#FF444F' }, // --core-color-solid-coral-700
    { id: 'grape', label: localize('Purple'), color: '#9231D6' }, // --core-color-solid-grape-600
    { id: 'orange', label: localize('Orange'), color: '#F7772F' }, // --core-color-solid-orange-600
];

export type TAreaThicknessId = 'thin' | 'medium' | 'thick';

export type TAreaThicknessOption = {
    id: TAreaThicknessId;
    label: string;
    /** In logical pixels - the unit the engine's `LineStyle.thickness` is measured in. */
    thickness: number;
};

export const AREA_THICKNESSES: readonly TAreaThicknessOption[] = [
    { id: 'thin', label: localize('Thin'), thickness: 1 },
    { id: 'medium', label: localize('Medium'), thickness: 2 },
    { id: 'thick', label: localize('Thick'), thickness: 3 },
];

/** Medium, not the engine's own 1px default: the redesign asks for the heavier line. */
export const DEFAULT_AREA_THICKNESS_ID: TAreaThicknessId = 'medium';
export const DEFAULT_AREA_COLOR_ID: TAreaColorId = 'default';
export const DEFAULT_AREA_FILL: TAreaFill = AREA_FILL.GRADIENT;

/** Opacity of the gradient's top stop, matching the chart theme's own area gradient. */
export const AREA_GRADIENT_START_OPACITY = 0.16;

/** Falls back to the default entry, so an id dropped in a later release still resolves. */
export const getAreaColor = (id: TAreaColorId): TAreaColorOption =>
    AREA_COLORS.find(c => c.id === id) ?? AREA_COLORS[0];

export const getAreaThickness = (id: TAreaThicknessId): TAreaThicknessOption =>
    AREA_THICKNESSES.find(t => t.id === id) ?? AREA_THICKNESSES[1];
