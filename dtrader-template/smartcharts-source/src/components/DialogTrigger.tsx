import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from 'src/store';
import MenuStore from 'src/store/MenuStore';
import Tooltip from './Tooltip';

type TDialogTriggerProps = {
    store: MenuStore;
    className?: string;
    tooltip?: string;
    enabled?: boolean;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    children?: React.ReactNode;
};

/**
 * The toolbar button that opens a dialog.
 *
 * This reproduces the trigger `Menu` renders in `modalMode` (tooltip + `.cq-menu-btn`), so the
 * toolbar keeps its existing look and hit area. The dialog body is no longer `Menu`'s concern:
 * the redesigned dialogs render themselves through `DialogShell`, driven by the same `MenuStore`.
 * Keeping `MenuStore` in the loop preserves route sync, analytics, the one-dialog-at-a-time rule
 * and `ToolbarWidgetStore`'s auto-collapse reaction.
 */
const DialogTrigger = ({
    store,
    className,
    tooltip,
    enabled = true,
    onMouseEnter,
    onMouseLeave,
    children,
}: TDialogTriggerProps) => {
    const { chart } = useStores();
    const { context: ready } = chart;
    const { open, onTitleClick } = store;

    if (!ready) return null;

    return (
        <Tooltip
            className={classNames('ciq-menu', className || '', {
                stxMenuActive: enabled && open,
                'ciq-enabled': enabled,
                'ciq-disabled': !enabled,
            })}
            content={tooltip}
            enabled={!!tooltip}
            position='right'
        >
            <div
                className='cq-menu-btn'
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onClick={enabled ? onTitleClick : () => null}
            >
                {children}
            </div>
        </Tooltip>
    );
};

export default observer(DialogTrigger);
