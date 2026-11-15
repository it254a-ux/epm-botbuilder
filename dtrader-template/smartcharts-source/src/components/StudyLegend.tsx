/* eslint-disable react/react-in-jsx-scope -- tsconfig uses jsx:"react-jsx";
   React is injected by webpack's ProvidePlugin, so importing it here would be unused. */
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { localize } from 'src/translations';
import DialogTrigger from './DialogTrigger';
import { ChartIndicatorsIcon } from './Icons';
import IndicatorsDialog from './IndicatorsDialog';
import NotificationBadge from './NotificationBadge';

type TStudyLegendProps = {
    /**
     * Accepted for backwards compatibility only. The dialog owns a themed portal of its own
     * (see DialogShell), so a host-supplied node is no longer consulted - but hosts still pass
     * one, and dropping it from the type would break their build.
     */
    // eslint-disable-next-line react/no-unused-prop-types
    portalNodeId?: string;
    /**
     * Tags the dialog's search field. Declared so hosts that mark the input type-check -
     * derivatives-trader passes a Hotjar whitelist class.
     */
    searchInputClassName?: string;
};

/** Indicators entry point: the toolbar trigger plus the dialog it opens. */
const StudyLegend = ({ searchInputClassName }: TStudyLegendProps) => {
    const { studies } = useStores();
    const { menuStore, activeItems } = studies;

    return (
        <>
            <DialogTrigger store={menuStore} className='sc-studies' tooltip={localize('Indicators')}>
                <div className={`sc-studies__menu${menuStore.open ? ' sc-studies__menu--active' : ''}`}>
                    <ChartIndicatorsIcon />
                    <NotificationBadge notificationCount={activeItems.length} />
                </div>
            </DialogTrigger>
            <IndicatorsDialog searchInputClassName={searchInputClassName} />
        </>
    );
};

export default observer(StudyLegend);
