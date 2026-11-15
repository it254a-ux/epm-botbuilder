import { SegmentedControlSingleChoice } from '@deriv-com/quill-ui';
import { StandaloneTrashRegularIcon } from '@deriv/quill-icons';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from 'src/store';
import { TIcon } from 'src/types';
import { localize } from 'src/translations';
import DialogShell from './DialogShell';
import EmptyStateImage from './EmptyStateImage';

const TAB_ACTIVE = 0;
const TAB_ALL = 1;

type TDrawToolRowProps = {
    Icon?: TIcon;
    label: string;
    onClick?: () => void;
    onDelete?: () => void;
};

const RowBody = ({ Icon, label }: Pick<TDrawToolRowProps, 'Icon' | 'label'>) => (
    <>
        {Icon && <Icon />}
        <span className='sc-draw-tools-dialog__item__label'>{label}</span>
    </>
);

/**
 * A row is a real `<button>` when the whole row is the action ("All drawings" → start
 * drawing), and a plain element when only the trailing delete icon is actionable
 * ("Active" → remove one drawing). That keeps the tab order honest in both tabs.
 */
const DrawToolRow = ({ Icon, label, onClick, onDelete }: TDrawToolRowProps) => {
    if (onClick) {
        return (
            <button
                type='button'
                className='sc-draw-tools-dialog__item sc-draw-tools-dialog__item--action'
                onClick={onClick}
            >
                <RowBody Icon={Icon} label={label} />
            </button>
        );
    }

    return (
        <div className='sc-draw-tools-dialog__item'>
            <RowBody Icon={Icon} label={label} />
            {onDelete && (
                <button
                    type='button'
                    className='sc-draw-tools-dialog__item__delete'
                    aria-label={localize('Delete')}
                    onClick={onDelete}
                >
                    {/* Design calls for quill's `trash-sm` standalone icon. */}
                    <StandaloneTrashRegularIcon iconSize='sm' fill='var(--component-textIcon-normal-default)' />
                </button>
            )}
        </div>
    );
};

/**
 * Everything that reacts to a tab switch or a drawing change lives here, deliberately
 * *below* `DialogShell` - see the matching note in ChartTypeDialog: quill's Modal rebuilds
 * its entire subtree on every render, so keeping the observable reads and local state out
 * of the shell is what stops the tool icons flashing.
 */
const DrawToolsDialogBody = observer(() => {
    const { drawTools, chart } = useStores();
    const { isMobile } = chart;
    const { menuStore, clearAll, startAddingNewTool, getDrawToolsItems, activeToolsNo, activeToolsGroup, onDeleted } =
        drawTools;

    const [tab, setTab] = React.useState(TAB_ALL);

    // The design opens on "All drawings" every time - picking a tool is the common action,
    // and managing existing ones is one tap away. Reset on open so a previous visit to the
    // Active tab doesn't leak into the next.
    React.useEffect(() => {
        if (menuStore.open) setTab(TAB_ALL);
    }, [menuStore.open]);

    // The store groups repeated tools (Horizontal line 1, 2, ...); the design shows one flat
    // list, so flatten while keeping the store's per-group numbering for disambiguation.
    const activeItems = React.useMemo(
        () => activeToolsGroup.flatMap(group => group.items.map(item => ({ ...item, groupId: group.id }))),
        [activeToolsGroup]
    );

    const options = [
        { label: activeToolsNo ? `${localize('Active')} (${activeToolsNo})` : localize('Active') },
        { label: localize('All drawings') },
    ];

    return (
        <div className='sc-draw-tools-dialog__content'>
            {/* On mobile the sheet header already carries the title. */}
            {!isMobile && <h2 className='sc-draw-tools-dialog__title'>{localize('Drawing tools')}</h2>}

            {/* The design separates the title from the switch+list group by 32px, while the
                    group itself is spaced at 16px - hence the extra wrapper. */}
            <div className='sc-draw-tools-dialog__body'>
                <SegmentedControlSingleChoice
                    className='sc-draw-tools-dialog__tabs'
                    hasContainerWidth
                    options={options}
                    selectedItemIndex={tab}
                    onChange={setTab}
                    // `sm` is 40px tall with 32px segments - the design's proportions.
                    // `md` would be 56/40 and reads far too heavy in the dialog.
                    size='sm'
                />

                {/* One fixed-height box for both tabs, so switching does not resize the dialog. */}
                <div className='sc-draw-tools-dialog__tab-content'>
                    {/* Outside the scroll area on purpose: "Clear all" acts on the whole list,
                        so it stays pinned while the list beneath it scrolls. */}
                    {tab === TAB_ACTIVE && activeItems.length > 0 && (
                        <div className='sc-draw-tools-dialog__actions'>
                            <button type='button' className='sc-draw-tools-dialog__clear-all' onClick={clearAll}>
                                {localize('Clear all')}
                            </button>
                        </div>
                    )}

                    <div className='sc-draw-tools-dialog__scroll'>
                        {tab === TAB_ALL && (
                            <div className='sc-draw-tools-dialog__list'>
                                {getDrawToolsItems().map(item => (
                                    <DrawToolRow
                                        key={item.id}
                                        Icon={item.icon}
                                        label={localize(item.text, { num: ' ' }).trim()}
                                        onClick={() => startAddingNewTool(item.id)}
                                    />
                                ))}
                            </div>
                        )}

                        {tab === TAB_ACTIVE && activeItems.length > 0 && (
                            <div
                                className={classNames(
                                    'sc-draw-tools-dialog__list',
                                    'sc-draw-tools-dialog__list--active'
                                )}
                            >
                                {activeItems.map((item, i) => (
                                    <React.Fragment key={item.index}>
                                        {i > 0 && <div className='sc-draw-tools-dialog__separator' />}
                                        <DrawToolRow
                                            Icon={item.icon}
                                            label={localize(item.text, { num: item.num || ' ' }).trim()}
                                            onDelete={() => onDeleted(item.index)}
                                        />
                                    </React.Fragment>
                                ))}
                            </div>
                        )}

                        {tab === TAB_ACTIVE && activeItems.length === 0 && (
                            <div className='sc-draw-tools-dialog__empty'>
                                <EmptyStateImage className='sc-draw-tools-dialog__empty__image' />
                                <div className='sc-draw-tools-dialog__empty__text'>
                                    <p className='sc-draw-tools-dialog__empty__title'>
                                        {localize('No drawing tool added yet')}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

/**
 * The redesigned "Drawing tools" dialog: an Active / All drawings switch over a single list.
 * Renders as a centred modal on desktop and a bottom sheet on mobile.
 *
 * This shell observes only `menuStore.open`, so it re-renders on open/close and nowhere else.
 */
const DrawToolsDialog = () => {
    const { drawTools } = useStores();
    const { menuStore } = drawTools;
    const close = React.useCallback(() => menuStore.setOpen(false), [menuStore]);

    return (
        <DialogShell
            open={menuStore.open}
            onClose={close}
            mobileTitle={localize('Drawing tools')}
            className='sc-draw-tools-dialog'
        >
            <DrawToolsDialogBody />
        </DialogShell>
    );
};

export default observer(DrawToolsDialog);
