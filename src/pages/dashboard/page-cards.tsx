import React from 'react';
import Text from '@/components/shared_ui/text';
import { localize } from '@deriv-com/translations';
import './page-cards.scss';

type TPageCards = {
    handleTabChange: (active_number: number) => void;
};

type TPageCard = {
    tab: number; // position of the page in the top tab bar
    icon: string;
    title: string;
    text: string;
    accent: string;
};

// One card for every page of the site. Clicking a card opens that page, exactly like clicking its tab.
const PageCards = ({ handleTabChange }: TPageCards) => {
    const pages: TPageCard[] = [
        { tab: 5, icon: '📈', title: 'Dtrader', text: localize('Trade Rise/Fall, Digits, Multipliers and more'), accent: '#2b7fff' },
        { tab: 1, icon: '🧩', title: localize('Bot Builder'), text: localize('Drag and drop blocks to build your own bot'), accent: '#8b5cf6' },
        { tab: 2, icon: '🤖', title: localize('EPM Trading bots'), text: localize('Ready-made bots, one click to run'), accent: '#00a79e' },
        { tab: 3, icon: '📊', title: localize('EPM Analysis Tool'), text: localize('Live digit statistics and Under/Over signals'), accent: '#f59e0b' },
        { tab: 4, icon: '📉', title: localize('Charts'), text: localize('Live candles with indicators and drawing tools'), accent: '#06b6d4' },
        { tab: 6, icon: '🖥️', title: 'TradingView', text: localize('Full TradingView charts inside the site'), accent: '#ef4444' },
        { tab: 8, icon: '⚡', title: localize('Forex Trader'), text: localize('AI-assisted forex chart analysis'), accent: '#eab308' },
        { tab: 9, icon: '🔴', title: localize('Forex Live'), text: localize('Live forex quotes and the Sweep Sniper'), accent: '#f43f5e' },
        { tab: 10, icon: '🔮', title: localize('Market Forecast'), text: localize('See where the markets may be heading'), accent: '#a855f7' },
        { tab: 7, icon: '🎓', title: localize('Tutorials'), text: localize('Short guides to get you trading faster'), accent: '#22c55e' },
    ];

    return (
        <section className='page-cards' aria-label={localize('Explore')}>
            <Text as='h3' className='page-cards__title' weight='bold' color='prominent' size='s'>
                {localize('Explore Executive Prime Markets')}
            </Text>
            <div className='page-cards__grid'>
                {pages.map(page => (
                    <button
                        type='button'
                        key={page.tab}
                        className='page-card'
                        style={{ ['--card-accent' as string]: page.accent }}
                        onClick={() => handleTabChange(page.tab)}
                    >
                        <span className='page-card__icon' aria-hidden='true'>
                            {page.icon}
                        </span>
                        <span className='page-card__body'>
                            <span className='page-card__name'>{page.title}</span>
                            <span className='page-card__text'>{page.text}</span>
                        </span>
                        <span className='page-card__arrow' aria-hidden='true'>
                            →
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
};

export default PageCards;
