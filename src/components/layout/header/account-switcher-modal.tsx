import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { standalone_routes } from '@/components/shared';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { isDemoAccount } from '@/utils/account-helpers';
import './account-switcher-modal.scss';

const AccountSwitcherModal = observer(() => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<'real' | 'demo'>('real');
    const [isResetting, setIsResetting] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const { accountList, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};

    const activeAccount = accountList?.find(a => a.loginid === activeLoginid);
    const activeIsVirtual = activeAccount ? isDemoAccount(activeAccount.loginid) : false;

    useEffect(() => {
        setActiveCategory(activeIsVirtual ? 'demo' : 'real');
    }, [activeIsVirtual, isOpen]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const handleSelect = useCallback(
        (loginid: string) => {
            if (loginid === activeLoginid) return;
            localStorage.setItem('active_loginid', loginid);
            client?.checkAndRegenerateWebSocket();
            setIsOpen(false);
        },
        [activeLoginid, client]
    );

    const handleResetBalance = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResetting(true);
        try {
            await api_base.api?.send({ topup_virtual: 1 });
            // The existing 'balance' subscription (set up in api-base.ts)
            // pushes the updated amount automatically — no manual refetch needed.
        } catch (err) {
            console.error('Failed to reset demo balance:', err);
        } finally {
            setIsResetting(false);
        }
    }, []);

    if (!activeAccount) return null;

    const categoryAccounts = (accountList || []).filter(
        a => isDemoAccount(a.loginid) === (activeCategory === 'demo')
    );

    return (
        <div className='account-switcher-modal' ref={wrapperRef}>
            <div
                className='account-switcher-modal__trigger'
                role='button'
                tabIndex={0}
                onClick={() => setIsOpen(prev => !prev)}
            >
                <CurrencyIcon currency={activeAccount.currency} isVirtual={activeIsVirtual} />
                <div className='account-switcher-modal__trigger-text'>
                    <span className='account-switcher-modal__trigger-label'>
                        {activeIsVirtual ? 'Demo' : 'Real'}
                        <svg
                            className={classNames('account-switcher-modal__chevron', {
                                'account-switcher-modal__chevron--open': isOpen,
                            })}
                            width='10'
                            height='10'
                            viewBox='0 0 12 12'
                            fill='none'
                        >
                            <path
                                d='M2 4L6 8L10 4'
                                stroke='currentColor'
                                strokeWidth='1.5'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            />
                        </svg>
                    </span>
                    <span className='account-switcher-modal__trigger-balance'>
                        {Number(activeAccount.balance ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}{' '}
                        {activeAccount.currency}
                    </span>
                </div>
            </div>

            {isOpen && (
                <div className='account-switcher-modal__panel'>
                    <div className='account-switcher-modal__tabs'>
                        <button
                            type='button'
                            className={classNames('account-switcher-modal__tab', {
                                'account-switcher-modal__tab--active': activeCategory === 'real',
                            })}
                            onClick={() => setActiveCategory('real')}
                        >
                            Real
                        </button>
                        <button
                            type='button'
                            className={classNames('account-switcher-modal__tab', {
                                'account-switcher-modal__tab--active': activeCategory === 'demo',
                            })}
                            onClick={() => setActiveCategory('demo')}
                        >
                            Demo
                        </button>
                    </div>

                    <div className='account-switcher-modal__section-header'>
                        <span>Deriv account</span>
                    </div>

                    <div className='account-switcher-modal__list'>
                        {categoryAccounts.length === 0 && (
                            <div className='account-switcher-modal__empty'>
                                No {activeCategory} account found.
                            </div>
                        )}
                        {categoryAccounts.map(account => (
                            <div
                                key={account.loginid}
                                className={classNames('account-switcher-modal__row', {
                                    'account-switcher-modal__row--active': account.loginid === activeLoginid,
                                })}
                                onClick={() => handleSelect(account.loginid)}
                            >
                                <div className='account-switcher-modal__row-left'>
                                    <CurrencyIcon
                                        currency={account.currency}
                                        isVirtual={isDemoAccount(account.loginid)}
                                    />
                                    <div>
                                        <div className='account-switcher-modal__row-title'>
                                            {isDemoAccount(account.loginid) ? 'Demo' : account.currency}
                                        </div>
                                        <div className='account-switcher-modal__row-id'>{account.loginid}</div>
                                    </div>
                                </div>
                                {activeCategory === 'demo' && account.loginid === activeLoginid ? (
                                    <button
                                        type='button'
                                        className='account-switcher-modal__reset-btn'
                                        disabled={isResetting}
                                        onClick={handleResetBalance}
                                    >
                                        {isResetting ? 'Resetting...' : 'Reset balance'}
                                    </button>
                                ) : (
                                    <div className='account-switcher-modal__row-balance'>
                                        {Number(account.balance ?? 0).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}{' '}
                                        {account.currency}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <a
                        href={standalone_routes.traders_hub}
                        className='account-switcher-modal__cfd-link'
                        onClick={() => setIsOpen(false)}
                    >
                        Looking for CFD accounts? Go to Trader's Hub
                    </a>

                    <div className='account-switcher-modal__footer'>
                        <a href={standalone_routes.traders_hub} className='account-switcher-modal__manage-btn'>
                            Manage accounts
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
});

export default AccountSwitcherModal;
