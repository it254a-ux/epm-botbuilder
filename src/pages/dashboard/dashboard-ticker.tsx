import React from 'react';
import classNames from 'classnames';

type TDashboardTicker = {
    label: string;
    items: string[];
    variant?: 'welcome' | 'markets';
};

// A slow, calm news-style strip. The list is rendered twice so the loop is seamless.
const DashboardTicker = ({ label, items, variant = 'welcome' }: TDashboardTicker) => (
    <div className={classNames('db-ticker', `db-ticker--${variant}`)} role='marquee' aria-label={label}>
        <span className='db-ticker__label'>{label}</span>
        <div className='db-ticker__viewport'>
            <div className='db-ticker__track'>
                {[0, 1].map(copy => (
                    <ul className='db-ticker__list' key={copy} aria-hidden={copy === 1}>
                        {items.map(item => (
                            <li className='db-ticker__item' key={`${copy}-${item}`}>
                                {item}
                            </li>
                        ))}
                    </ul>
                ))}
            </div>
        </div>
    </div>
);

export default DashboardTicker;
