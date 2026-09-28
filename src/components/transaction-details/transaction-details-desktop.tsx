// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import { observer } from 'mobx-react-lite';
import DraggableResizeWrapper from '@/components/draggable/draggable-resize-wrapper';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import DesktopTransactionTable from './desktop-transaction-table';
import { TColumn, TRunPanelStore, TTransactionStore } from './transaction-details.types';
import './transaction-details-desktop.scss';

const transaction_columns = (): TColumn[] => [
    { key: 'timestamp', label: localize('Timestamp'), extra_class: '--grow-big' },
    { key: 'reference', label: localize('Reference'), extra_class: '--grow-mid' },
    { key: 'market', label: localize('Market') },
    { key: 'contract_type', label: localize('Trade type') },
    { key: 'entry_spot', label: localize('Entry spot') },
    { key: 'exit_spot', label: localize('Exit spot') },
    { key: 'buy_price', label: localize('Buy price') },
    { key: 'profit', label: localize('Profit/Loss') },
];

/* TODO: Add back account & balance when we have support from transaction store */
const result_columns = (): TColumn[] => [
    { key: 'account', label: localize('Account'), extra_class: '--grow-mid' },
    { key: 'no_of_runs', label: localize('No. of runs') },
    { key: 'total_stake', label: localize('Total stake') },
    { key: 'total_payout', label: localize('Total payout') },
    { key: 'win', label: localize('Win') },
    { key: 'loss', label: localize('Loss') },
    { key: 'total_profit', label: localize('Total profit/loss') },
    { key: 'balance', label: localize('Balance') },
];

// This popup is the record of every contract a bot placed (first stake to
// last, e.g. a whole martingale stack), so it should open tall enough to show
// as many of them as possible in ONE screenshot rather than at a fixed 404px
// that needs scrolling after ~5 rows. Sized from the screen it's opened on,
// minus room for the app header above it and a margin below; it can never be
// smaller than the old 404px, and the resize handles still work as before.
const MIN_MODAL_HEIGHT = 404;
const VERTICAL_SPACE_RESERVED = 140;
const getModalHeight = () => Math.max(MIN_MODAL_HEIGHT, window.innerHeight - VERTICAL_SPACE_RESERVED);

const TransactionDetailsDesktop = observer(() => {
    const { client } = useStore();
    const { loginid, balance } = client;
    const { transactions } = useStore();
    const {
        toggleTransactionDetailsModal,
        is_transaction_details_modal_open,
        transactions: transaction_list,
    }: Partial<TTransactionStore> = transactions;
    const { statistics }: Partial<TRunPanelStore> = transactions;

    return (
        <React.Fragment>
            {is_transaction_details_modal_open && (
                <DraggableResizeWrapper
                    boundary='.main'
                    header={localize('Transactions detailed summary')}
                    onClose={() => toggleTransactionDetailsModal(false)}
                    modalWidth={882}
                    modalHeight={getModalHeight()}
                    minWidth={882}
                    minHeight={MIN_MODAL_HEIGHT}
                    enableResizing
                >
                    <DesktopTransactionTable
                        transaction_columns={transaction_columns()}
                        transactions={transaction_list}
                        result_columns={result_columns()}
                        result={statistics}
                        account={loginid ?? ''}
                        balance={balance ?? 0}
                    />
                </DraggableResizeWrapper>
            )}
        </React.Fragment>
    );
});

export default TransactionDetailsDesktop;
