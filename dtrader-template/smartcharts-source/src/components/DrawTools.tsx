/* eslint-disable react/react-in-jsx-scope -- tsconfig uses jsx:"react-jsx";
   React is injected by webpack's ProvidePlugin, so importing it here would be unused. */
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { localize } from 'src/translations';
import DialogTrigger from './DialogTrigger';
import DrawToolsDialog from './DrawToolsDialog';
import { DrawingToolsIcon } from './Icons';
import NotificationBadge from './NotificationBadge';

type TDrawToolsProps = {
    /**
     * Retained for API compatibility. The redesigned dialogs manage their own themed portal,
     * so this is no longer used for placement.
     */
    portalNodeId?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DrawTools = (_props: TDrawToolsProps) => {
    const { drawTools } = useStores();
    const { menuStore, activeToolsNo } = drawTools;
    const menuOpen = menuStore.open;

    return (
        <>
            <DialogTrigger store={menuStore} className='sc-dtools' tooltip={localize('Drawing tools')}>
                <div className={classNames('sc-dtools__menu', { 'sc-dtools__menu--active': menuOpen })}>
                    <DrawingToolsIcon />
                    <NotificationBadge notificationCount={activeToolsNo} />
                </div>
            </DialogTrigger>
            <DrawToolsDialog />
        </>
    );
};

export default observer(DrawTools);
