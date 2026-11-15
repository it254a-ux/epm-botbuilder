import { SearchField, Tooltip } from '@deriv-com/quill-ui';
import {
    StandaloneChevronLeftRegularIcon,
    StandaloneChevronRightRegularIcon,
    StandaloneGearRegularIcon,
    StandaloneTrashRegularIcon,
    StandaloneXmarkRegularIcon,
} from '@deriv/quill-icons';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { TooltipsContent } from 'src/Constant';
import { useStores } from 'src/store';
import { TActiveItem, TIndicatorItem, TSettingsParameter } from 'src/types';
import { clone } from 'src/utils';
import { localize } from 'src/translations';
import '../../sass/components/_quill-dialogs.scss';
import DialogShell from './DialogShell';
import EmptyStateImage from './EmptyStateImage';
import IndicatorSettings from './IndicatorSettings';

const NAV_ACTIVE = 'active';
const NAV_GUIDE = 'guide';

/** What the right pane is showing. The settings view overlays whichever nav item is selected. */
type TEditing =
    | { mode: 'add'; indicator: TIndicatorItem }
    | {
          mode: 'edit';
          indicator: TIndicatorItem;
          activeItemId: string;
          /**
           * True when the chart's own gear (or a double-click on the series) opened this,
           * rather than the user browsing here. Those entries are a round trip out of the
           * chart, so applying returns them to it instead of to the Active list.
           */
          fromChart?: boolean;
      };

type TNavItemProps = {
    label: string;
    selected: boolean;
    onSelect: () => void;
};

const NavItem = ({ label, selected, onSelect }: TNavItemProps) => (
    <button
        type='button'
        className={classNames('sc-indicators-dialog__nav__item', {
            'sc-indicators-dialog__nav__item--selected': selected,
        })}
        onClick={onSelect}
    >
        <span>{label}</span>
        {selected && <span className='sc-indicators-dialog__nav__item__bar' />}
    </button>
);

const IndicatorsDialogBody = observer(({ searchInputClassName }: { searchInputClassName?: string }) => {
    const { studies, timeperiod } = useStores();
    const {
        items,
        activeItems,
        maxAllowedItem,
        menuStore,
        deleteStudyById,
        addIndicator,
        applyIndicatorSettings,
        getDefaultParameters,
        setFilterText,
        pendingEditId,
        clearPendingEdit,
    } = studies;
    const { isTick } = timeperiod;

    const categories = items;
    const [nav, setNav] = React.useState<string>(() => categories[0]?.category ?? NAV_ACTIVE);
    const [search, setSearch] = React.useState('');
    const [editing, setEditing] = React.useState<TEditing | null>(null);
    const [staged, setStaged] = React.useState<TSettingsParameter[]>([]);

    // Reopening should always land on the design's default view rather than resuming
    // wherever the last visit left off - unless the chart asked for a specific indicator's
    // settings, which the effect below honours.
    React.useEffect(() => {
        if (!menuStore.open) return;
        setNav(categories[0]?.category ?? NAV_ACTIVE);
        setSearch('');
        if (!pendingEditId) setEditing(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menuStore.open]);

    // The chart's own gear button and a double-click on an indicator series both route here,
    // naming the active item to edit. Runs on open and on any later request, so asking for a
    // second indicator while the dialog is already open switches to it.
    React.useEffect(() => {
        if (!pendingEditId) return;
        const item = activeItems.find(i => i.id === pendingEditId);
        if (item) {
            setStaged(clone(item.parameters));
            setEditing({ mode: 'edit', indicator: item, activeItemId: item.id, fromChart: true });
        }
        clearPendingEdit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingEditId]);

    const close = React.useCallback(() => menuStore.setOpen(false), [menuStore]);

    const allIndicators = React.useMemo(
        () => categories.flatMap(category => category.items),
        [categories]
    );

    const atCapacity = activeItems.length >= maxAllowedItem;

    const openSettings = (indicator: TIndicatorItem, existing?: TActiveItem) => {
        if (existing) {
            setStaged(clone(existing.parameters));
            setEditing({ mode: 'edit', indicator, activeItemId: existing.id });
        } else {
            setStaged(getDefaultParameters(indicator.flutter_chart_id));
            setEditing({ mode: 'add', indicator });
        }
    };

    const onApply = () => {
        if (!editing) return;
        if (editing.mode === 'add') {
            addIndicator(editing.indicator.flutter_chart_id, staged);
        } else {
            applyIndicatorSettings(editing.activeItemId, staged);
        }
        setEditing(null);

        // Arriving from the chart means the dialog was only ever a detour to change one
        // setting, so applying hands the user straight back to it.
        if (editing.mode === 'edit' && editing.fromChart) close();
        else setNav(NAV_ACTIVE);
    };

    const onReset = () => {
        if (!editing) return;
        setStaged(getDefaultParameters(editing.indicator.flutter_chart_id));
    };

    // Reset only means something once a value differs from the catalogue default.
    const isDirty = React.useMemo(
        () => staged.some(parameter => JSON.stringify(parameter.value) !== JSON.stringify(parameter.defaultValue)),
        [staged]
    );

    const onSearchChange = (value: string) => {
        setSearch(value);
        setFilterText(value);
        // Typing is a request to browse, so it takes precedence over a half-finished edit.
        if (value) setEditing(null);
    };

    /** Why an indicator cannot be added right now, or undefined when it can. */
    const blockedReason = (indicator: TIndicatorItem) => {
        if (indicator.isPrediction && isTick) return TooltipsContent.predictionIndicator;
        if (atCapacity) {
            return localize('You can add up to {{count}} indicators.', { count: maxAllowedItem });
        }
        return undefined;
    };

    const renderCatalogue = (list: TIndicatorItem[]) => (
        <div className='sc-indicators-dialog__list'>
            {list.map(indicator => {
                const blocked = blockedReason(indicator);
                const Icon = indicator.icon;
                const row = (
                    <button
                        type='button'
                        aria-disabled={!!blocked}
                        className={classNames('sc-indicators-dialog__row', {
                            'sc-indicators-dialog__row--disabled': !!blocked,
                        })}
                        onClick={() => !blocked && openSettings(indicator)}
                    >
                        {Icon && <Icon />}
                        <span className='sc-indicators-dialog__row__label'>{indicator.name}</span>
                        <StandaloneChevronRightRegularIcon
                            iconSize='sm'
                            className='sc-indicators-dialog__row__chevron'
                        />
                    </button>
                );

                // Only unavailable rows explain themselves, and they do it through quill rather
                // than the browser's own `title` bubble, which ignores the design entirely.
                return blocked ? (
                    <Tooltip
                        key={indicator.flutter_chart_id}
                        as='div'
                        className='sc-indicators-dialog__row-tip'
                        // The marker class is what the stylesheet keys off to move the arrow;
                        // it keeps that override off every other quill tooltip on the page.
                        tooltipContent={<span className='sc-indicators-dialog__tip'>{blocked}</span>}
                        tooltipPosition='top'
                        popoverAlign='start'
                    >
                        {row}
                    </Tooltip>
                ) : (
                    <React.Fragment key={indicator.flutter_chart_id}>{row}</React.Fragment>
                );
            })}
        </div>
    );

    const renderActive = () => {
        if (!activeItems.length) {
            return (
                <div className='sc-indicators-dialog__empty'>
                    <EmptyStateImage className='sc-indicators-dialog__empty__image' />
                    <div className='sc-indicators-dialog__empty__text'>
                        <p className='sc-indicators-dialog__empty__title'>{localize('No indicator added yet')}</p>
                        <p className='sc-indicators-dialog__empty__subtitle'>
                            {localize('You can add up to {{count}} indicators.', { count: maxAllowedItem })}
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className='sc-indicators-dialog__list sc-indicators-dialog__list--active'>
                {activeItems.map(item => {
                    const Icon = item.icon;
                    return (
                        <div className='sc-indicators-dialog__row' key={item.id}>
                            {Icon && <Icon />}
                            <span className='sc-indicators-dialog__row__label'>{item.short_name_and_index}</span>
                            <button
                                type='button'
                                className='sc-indicators-dialog__row__action'
                                aria-label={localize('Settings')}
                                onClick={() => openSettings(item, item)}
                            >
                                <StandaloneGearRegularIcon iconSize='sm' />
                            </button>
                            <button
                                type='button'
                                className='sc-indicators-dialog__row__action'
                                aria-label={localize('Delete')}
                                onClick={() => deleteStudyById(item.id)}
                            >
                                <StandaloneTrashRegularIcon iconSize='sm' />
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderGuide = () => (
        <div className='sc-indicators-dialog__guide'>
            {allIndicators.map(indicator => {
                const Icon = indicator.icon;
                return (
                    <div className='sc-indicators-dialog__guide__item' key={indicator.flutter_chart_id}>
                        <p className='sc-indicators-dialog__guide__title'>
                            {indicator.name}
                            {Icon && <Icon />}
                        </p>
                        <p className='sc-indicators-dialog__guide__text'>{indicator.description}</p>
                    </div>
                );
            })}
        </div>
    );

    const renderContent = () => {
        if (editing) {
            return (
                <IndicatorSettings
                    indicator={editing.indicator}
                    parameters={staged}
                    onChange={setStaged}
                    onReset={onReset}
                    onApply={onApply}
                    isDirty={isDirty}
                    canApply={editing.mode === 'edit' || !atCapacity}
                />
            );
        }

        if (search) {
            const query = search.toLowerCase().trim();
            const matches = allIndicators.filter(i => i.name.toLowerCase().includes(query));
            return matches.length ? (
                renderCatalogue(matches)
            ) : (
                <div className='sc-indicators-dialog__empty'>
                    <EmptyStateImage className='sc-indicators-dialog__empty__image' />
                    <div className='sc-indicators-dialog__empty__text'>
                        <p className='sc-indicators-dialog__empty__title'>
                            {localize('No results for "{{text}}"', { text: search })}
                        </p>
                        <p className='sc-indicators-dialog__empty__subtitle'>
                            {localize('Try checking your spelling or use a different term')}
                        </p>
                    </div>
                </div>
            );
        }

        if (nav === NAV_ACTIVE) return renderActive();
        if (nav === NAV_GUIDE) return renderGuide();
        return renderCatalogue(categories.find(c => c.category === nav)?.items ?? []);
    };

    const activeLabel = activeItems.length
        ? `${localize('Active')} (${activeItems.length})`
        : localize('Active');

    return (
        <div className='sc-indicators-dialog__content'>
            <nav className='sc-indicators-dialog__nav'>
                <p className='sc-indicators-dialog__nav__title'>{localize('Indicators')}</p>
                <div className='sc-indicators-dialog__nav__group'>
                    <NavItem
                        label={activeLabel}
                        selected={!search && !editing && nav === NAV_ACTIVE}
                        onSelect={() => {
                            setNav(NAV_ACTIVE);
                            onSearchChange('');
                            setEditing(null);
                        }}
                    />
                    <div className='sc-indicators-dialog__nav__divider' />
                    <div className='sc-indicators-dialog__nav__list'>
                        {categories.map(category => (
                            <NavItem
                                key={category.category}
                                label={category.name}
                                selected={!search && nav === category.category}
                                onSelect={() => {
                                    setNav(category.category);
                                    onSearchChange('');
                                    setEditing(null);
                                }}
                            />
                        ))}
                    </div>
                    <div className='sc-indicators-dialog__nav__divider' />
                    <NavItem
                        label={localize('Guide')}
                        selected={!search && !editing && nav === NAV_GUIDE}
                        onSelect={() => {
                            setNav(NAV_GUIDE);
                            onSearchChange('');
                            setEditing(null);
                        }}
                    />
                </div>
            </nav>

            <section className='sc-indicators-dialog__pane'>
                <header className='sc-indicators-dialog__header'>
                    {editing && (
                        <button
                            type='button'
                            className='sc-indicators-dialog__icon-btn'
                            aria-label={localize('Back')}
                            onClick={() => setEditing(null)}
                        >
                            <StandaloneChevronLeftRegularIcon iconSize='sm' />
                        </button>
                    )}
                    {/* The settings page is about one indicator, so searching the catalogue
                        from it would only navigate away; the back arrow is the way out. */}
                    {!editing && (
                        <div className='sc-indicators-dialog__search'>
                            {/* quill's SearchField carries the magnifier and the clear control,
                                and reports a clear as an ordinary change to an empty value. */}
                            <SearchField
                                inputSize='sm'
                                variant='fill'
                                value={search}
                                placeholder={localize('Search')}
                                aria-label={localize('Search')}
                                className={searchInputClassName}
                                onChange={e => onSearchChange(e.target.value)}
                            />
                        </div>
                    )}
                    <button
                        type='button'
                        className='sc-indicators-dialog__icon-btn'
                        aria-label={localize('Close')}
                        onClick={close}
                    >
                        <StandaloneXmarkRegularIcon iconSize='sm' />
                    </button>
                </header>

                {editing && <p className='sc-indicators-dialog__title'>{editing.indicator.short_name}</p>}

                <div className='sc-indicators-dialog__slot'>{renderContent()}</div>
            </section>
        </div>
    );
});

type TIndicatorsDialogProps = {
    searchInputClassName?: string;
};

/**
 * The redesigned indicators dialog.
 *
 * Only the open flag is read here: quill's Modal rebuilds its whole subtree on every render,
 * so keeping the reactive reads in `IndicatorsDialogBody` stops a selection tearing the pane
 * down and back up.
 */
const IndicatorsDialog = ({ searchInputClassName }: TIndicatorsDialogProps) => {
    const { studies } = useStores();
    const { menuStore } = studies;
    const close = React.useCallback(() => menuStore.setOpen(false), [menuStore]);

    return (
        <DialogShell open={menuStore.open} onClose={close} showCloseButton={false} className='sc-indicators-dialog'>
            <IndicatorsDialogBody searchInputClassName={searchInputClassName} />
        </DialogShell>
    );
};

export default observer(IndicatorsDialog);
