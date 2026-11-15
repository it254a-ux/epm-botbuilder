// Indicator icons extracted to separate chunk for lazy loading
// These icons are only needed when the Studies/Indicators panel is opened
import React from 'react';
import { TIconProps } from 'src/types';
import '../../sass/components/_icons.scss';

// Indicator category icons
import IndicatorCatMomentum from '../../sass/icons/indicators/ic-momentum.svg';
import IndicatorCatTrendLight from '../../sass/icons/indicators/ic-trend-light.svg';
import IndicatorCatTrendDark from '../../sass/icons/indicators/ic-trend-dark.svg';
import IndicatorCatVolatility from '../../sass/icons/indicators/ic-volatility.svg';
import IndicatorCatAverages from '../../sass/icons/indicators/ic-cat-averages.svg';
import IndicatorCatOther from '../../sass/icons/indicators/ic-other.svg';

// Individual indicator icons
import IndicatorAwesomeOscillator from '../../sass/icons/indicators/ic-awesome-oscillator.svg';
import IndicatorDTrended from '../../sass/icons/indicators/ic-dtrended.svg';
import IndicatorGator from '../../sass/icons/indicators/ic-gator.svg';
import IndicatorMacd from '../../sass/icons/indicators/ic-macd.svg';
import IndicatorRateChange from '../../sass/icons/indicators/ic-rate-of-change.svg';
import IndicatorRSI from '../../sass/icons/indicators/ic-rsi.svg';
import IndicatorStochasticOscillator from '../../sass/icons/indicators/ic-stochastic-oscillator.svg';
import IndicatorStochasticMomentum from '../../sass/icons/indicators/ic-stochastic-momentum.svg';
import IndicatorWilliamPercent from '../../sass/icons/indicators/ic-william-percent.svg';
import IndicatorAroon from '../../sass/icons/indicators/ic-aroon.svg';
import IndicatorAdx from '../../sass/icons/indicators/ic-adx.svg';
import IndicatorCommodityChannelIndex from '../../sass/icons/indicators/ic-commodity-channel-index.svg';
import IndicatorIchimoku from '../../sass/icons/indicators/ic-ichimoku.svg';
import IndicatorParabolic from '../../sass/icons/indicators/ic-parabolic.svg';
import IndicatorZigZag from '../../sass/icons/indicators/ic-zig-zag.svg';
import IndicatorBollinger from '../../sass/icons/indicators/ic-bollinger.svg';
import IndicatorDonchian from '../../sass/icons/indicators/ic-donchian.svg';
import IndicatorAverages from '../../sass/icons/indicators/ic-averages.svg';
import IndicatorEnvelope from '../../sass/icons/indicators/ic-envelope.svg';
import IndicatorAlligator from '../../sass/icons/indicators/ic-alligator.svg';
import IndicatorFractalChaos from '../../sass/icons/indicators/ic-fractal-chaos.svg';
import IndicatorRainbow from '../../sass/icons/indicators/ic-rainbow.svg';

// Wrapper function for SVG icons
const Wrapper = (SvgLogo: React.SVGAttributes<SVGElement>) => {
    const InnerWrapper = (props: TIconProps) => {
        let { className, 'tooltip-title': tooltip, ...p } = props;
        className = `ic-icon ${className || ''}`;
        const vb = SvgLogo.viewBox?.split(' ').slice(2) || [];

        return (
            <span className={className} tooltip-title={tooltip} {...p}>
                <svg width={vb[0]} height={vb[1]}>
                    <use xlinkHref={__webpack_public_path__ + (SvgLogo as any).url} />
                </svg>
                {tooltip && (
                    <>
                        <br />
                        <span className='ic-subtitle'>{tooltip}</span>
                    </>
                )}
            </span>
        );
    };
    return InnerWrapper;
};

// Indicator category icons
export const IndicatorCatMomentumIcon = Wrapper(IndicatorCatMomentum);
export const IndicatorCatTrendLightIcon = Wrapper(IndicatorCatTrendLight);
export const IndicatorCatTrendDarkIcon = Wrapper(IndicatorCatTrendDark);
export const IndicatorCatVolatilityIcon = Wrapper(IndicatorCatVolatility);
export const IndicatorCatAveragesIcon = Wrapper(IndicatorCatAverages);
export const IndicatorCatOtherIcon = Wrapper(IndicatorCatOther);

// Individual indicator icons
export const IndicatorAwesomeOscillatorIcon = Wrapper(IndicatorAwesomeOscillator);
export const IndicatorDTrendedIcon = Wrapper(IndicatorDTrended);
export const IndicatorGatorIcon = Wrapper(IndicatorGator);
export const IndicatorMacdIcon = Wrapper(IndicatorMacd);
export const IndicatorRateChangeIcon = Wrapper(IndicatorRateChange);
export const IndicatorRSIIcon = Wrapper(IndicatorRSI);
export const IndicatorStochasticOscillatorIcon = Wrapper(IndicatorStochasticOscillator);
export const IndicatorStochasticMomentumIcon = Wrapper(IndicatorStochasticMomentum);
export const IndicatorWilliamPercentIcon = Wrapper(IndicatorWilliamPercent);
export const IndicatorAroonIcon = Wrapper(IndicatorAroon);
export const IndicatorAdxIcon = Wrapper(IndicatorAdx);
export const IndicatorCommodityChannelIndexIcon = Wrapper(IndicatorCommodityChannelIndex);
export const IndicatorIchimokuIcon = Wrapper(IndicatorIchimoku);
export const IndicatorParabolicIcon = Wrapper(IndicatorParabolic);
export const IndicatorZigZagIcon = Wrapper(IndicatorZigZag);
export const IndicatorBollingerIcon = Wrapper(IndicatorBollinger);
export const IndicatorDonchianIcon = Wrapper(IndicatorDonchian);
export const IndicatorAveragesIcon = Wrapper(IndicatorAverages);
export const IndicatorEnvelopeIcon = Wrapper(IndicatorEnvelope);
export const IndicatorAlligatorIcon = Wrapper(IndicatorAlligator);
export const IndicatorFractalChaosIcon = Wrapper(IndicatorFractalChaos);
export const IndicatorRainbowIcon = Wrapper(IndicatorRainbow);
