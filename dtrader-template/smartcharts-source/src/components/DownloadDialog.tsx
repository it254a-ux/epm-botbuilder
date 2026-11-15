import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from 'src/store';
import { TIcon } from 'src/types';
import { localize } from 'src/translations';
import DialogShell from './DialogShell';
import { CsvIcon, PngIcon } from './Icons';
import { InlineLoader } from './Loader';

type TDownloadTileProps = {
    Icon: TIcon;
    label: string;
    onClick: () => void;
    /** Shows the inline dot loader over the tile while the export is being prepared. */
    loading?: boolean;
};

/**
 * One export option. The icon sits above its label, matching the chart type tiles - both are
 * a small set of equally weighted choices, so they read as the same kind of control.
 */
const DownloadTile = ({ Icon, label, onClick, loading = false }: TDownloadTileProps) => (
    <InlineLoader className='sc-download-dialog__tile' onClick={onClick} enabled={loading}>
        <Icon />
        <span className='sc-download-dialog__tile__label'>{label}</span>
    </InlineLoader>
);

/**
 * Split from the shell below so that starting a PNG export - which flips `isLoadingPNG` -
 * re-renders only this content. Quill's Modal rebuilds its whole subtree whenever it
 * re-renders, which makes the icons flash; see `ChartTypeDialog` for the full explanation.
 */
const DownloadDialogBody = observer(() => {
    const { chart, share } = useStores();
    const { isMobile } = chart;
    const { downloadCSV, downloadPNG, isLoadingPNG } = share;

    return (
        <div className='sc-download-dialog__content'>
            {/* On mobile the sheet header already carries the title. */}
            {!isMobile && <h2 className='sc-download-dialog__title'>{localize('Download')}</h2>}

            <p className='sc-download-dialog__description'>
                {localize(
                    'Download your current chart view as a PNG or export the historical data for analysis as a CSV.'
                )}
            </p>

            <div className='sc-download-dialog__tiles'>
                <DownloadTile Icon={PngIcon} label={localize('PNG')} onClick={downloadPNG} loading={isLoadingPNG} />
                <DownloadTile Icon={CsvIcon} label={localize('CSV')} onClick={downloadCSV} />
            </div>
        </div>
    );
});

/**
 * The redesigned "Download" dialog: a short explanation over the PNG and CSV export options.
 * Renders as a centred modal on desktop and a bottom sheet on mobile.
 *
 * This shell observes only `menuStore.open`, so it re-renders on open/close and nowhere else.
 */
const DownloadDialog = () => {
    const { share } = useStores();
    const { menuStore } = share;
    const close = React.useCallback(() => menuStore.setOpen(false), [menuStore]);

    return (
        <DialogShell
            open={menuStore.open}
            onClose={close}
            mobileTitle={localize('Download')}
            className='sc-download-dialog'
        >
            <DownloadDialogBody />
        </DialogShell>
    );
};

export default observer(DownloadDialog);
