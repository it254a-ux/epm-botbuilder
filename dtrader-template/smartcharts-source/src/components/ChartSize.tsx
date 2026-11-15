import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { localize } from 'src/translations';
import '../../sass/components/_chart-size.scss';
import { ZoomInIcon, ZoomOutIcon } from './Icons';

const ChartSize = () => {
    const { chartSize } = useStores();
    const { zoomIn, zoomOut } = chartSize;

    return (
        <div className='ciq-menu sc-chart-size'>
            <div className='cq-menu-btn'>
                <ZoomOutIcon
                    className='ic-icon-with-sub cq-zoom-out'
                    tooltip-title={localize('Zoom out')}
                    onClick={zoomOut}
                />
            </div>
            <div className='cq-menu-btn'>
                <ZoomInIcon
                    className='ic-icon-with-sub cq-zoom-in'
                    tooltip-title={localize('Zoom in')}
                    onClick={zoomIn}
                />
            </div>
        </div>
    );
};

export default observer(ChartSize);
