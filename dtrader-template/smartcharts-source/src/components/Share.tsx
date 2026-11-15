/* eslint-disable react/react-in-jsx-scope -- tsconfig uses jsx:"react-jsx";
   React is injected by webpack's ProvidePlugin, so importing it here would be unused. */
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { localize } from 'src/translations';
import DialogTrigger from './DialogTrigger';
import DownloadDialog from './DownloadDialog';
import { ChartDownloadIcon } from './Icons';

type TShareProps = {
    /**
     * Retained for API compatibility. The redesigned dialogs manage their own themed portal,
     * so this is no longer used for placement.
     */
    portalNodeId?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Share = (_props: TShareProps) => {
    const { share } = useStores();
    const { menuStore } = share;
    const menuOpen = menuStore.open;

    return (
        <>
            <DialogTrigger store={menuStore} className='sc-download-menu' tooltip={localize('Download')}>
                <div className={classNames('sc-download__menu', { 'sc-download__menu--active': menuOpen })}>
                    <ChartDownloadIcon />
                </div>
            </DialogTrigger>
            <DownloadDialog />
        </>
    );
};

export default observer(Share);
