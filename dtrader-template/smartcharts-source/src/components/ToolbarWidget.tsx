/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { EllipsisVerticalIcon } from './Icons';
import '../../sass/components/_toolbar-widget.scss';

type TToolbarWidgetProps = {
    position?: string;
    children?: React.ReactNode;
};

const ToolbarWidget = ({ position = 'top', children }: TToolbarWidgetProps) => {
    const { chart, toolbarWidget, timeperiod } = useStores();
    const { context, isMobile } = chart;
    const { onMouseEnter, onMouseLeave, isExpanded, toggleExpanded, collapse } = toolbarWidget;
    const { display: displayInterval } = timeperiod;

    if (!context) return null;

    // Mobile: collapse the tools behind a single vertical-ellipsis button that
    // expands upward to reveal its children (chart settings, drawing tools) with
    // a size + fade animation. Tapping a revealed item collapses the stack first
    // (onClickCapture, before the item opens its own menu), matching the app.
    if (isMobile) {
        return (
            <div
                className={classNames('sc-toolbar-widget', 'sc-toolbar-widget--mobile', {
                    'sc-toolbar-widget--expanded': isExpanded,
                })}
            >
                <div className='sc-toolbar-widget__items'>
                    <div className='sc-toolbar-widget__items-inner' onClickCapture={collapse}>
                        {children}
                    </div>
                </div>
                <div className='sc-toolbar-widget__more' onClick={toggleExpanded}>
                    <EllipsisVerticalIcon />
                </div>
                {/* Single interval badge pinned to the stack's top edge; it glides
                    from the ellipsis (collapsed) to the top button (expanded). */}
                {displayInterval && <span className='sc-toolbar-widget__interval'>{displayInterval}</span>}
            </div>
        );
    }

    return (
        <div
            className={classNames('sc-toolbar-widget', {
                [`sc-toolbar-widget--${position}`]: !!position,
            })}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {children}
        </div>
    );
};

export default observer(ToolbarWidget);
