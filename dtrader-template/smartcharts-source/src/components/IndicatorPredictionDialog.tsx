/* eslint-disable react/react-in-jsx-scope -- tsconfig uses jsx:"react-jsx";
   React is injected by webpack's ProvidePlugin, so importing it here would be unused. */
import { observer } from 'mobx-react-lite';
import { useStores } from 'src/store';
import { localize } from 'src/translations';
import '../../sass/components/_quill-dialogs.scss';
import DialogShell from './DialogShell';

/**
 * Asks before dropping indicators that a 1-tick interval cannot support.
 *
 * Built on the shared dialog shell rather than the legacy `Menu`: that one portalled into
 * `#smartcharts_modal` inside the chart, so its overlay was absolutely positioned over the
 * chart alone - a black panel beside an undimmed trade panel. Quill's modal dims the viewport
 * the way the rest of the dialogs do.
 */
const IndicatorPredictionDialog = () => {
    const { timeperiod } = useStores();
    const { open, handleCancel: onCancel, handleContinue: onContinue } = timeperiod.predictionIndicator;

    return (
        <DialogShell open={open} onClose={onCancel} showCloseButton={false} className='sc-confirm-dialog'>
            <div className='sc-confirm-dialog__content'>
                <p className='sc-confirm-dialog__title'>{localize('Are you sure?')}</p>
                <p className='sc-confirm-dialog__text'>
                    {localize(
                        'Some of your active indicators don’t support 1-tick intervals. If you change to a 1-tick interval, these indicators will be removed from your chart.'
                    )}
                </p>
                <div className='sc-confirm-dialog__actions'>
                    <button
                        type='button'
                        className='sc-confirm-dialog__btn sc-confirm-dialog__btn--secondary'
                        onClick={onCancel}
                    >
                        {localize('Cancel')}
                    </button>
                    <button
                        type='button'
                        className='sc-confirm-dialog__btn sc-confirm-dialog__btn--primary'
                        onClick={onContinue}
                    >
                        {localize('Continue')}
                    </button>
                </div>
            </div>
        </DialogShell>
    );
};

export default observer(IndicatorPredictionDialog);
