import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Localize, localize } from '@deriv-com/translations';
import './admin.scss';

type TBotSummary = {
    id: number;
    name: string;
    description: string;
    market: string;
    risk_level: string;
    contract_type: string;
    created_at: string;
};

const MARKET_OPTIONS = [
    'Volatility 10',
    'Volatility 25',
    'Volatility 50',
    'Volatility 75',
    'Volatility 100',
    'Other',
];
const RISK_OPTIONS = ['Low risk', 'Medium risk', 'High risk'];
const CONTRACT_TYPE_OPTIONS = [
    'Accumulators',
    'Rise/Fall',
    'Matches/Differs',
    'Over/Under',
    'Even/Odd',
    'Multiplier',
    'Other',
];

const AdminBots = () => {
    const [password, setPassword] = useState('');
    const [bots, setBots] = useState<TBotSummary[]>([]);
    const [isLoadingList, setIsLoadingList] = useState(true);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [market, setMarket] = useState(MARKET_OPTIONS[0]);
    const [riskLevel, setRiskLevel] = useState(RISK_OPTIONS[0]);
    const [contractType, setContractType] = useState(CONTRACT_TYPE_OPTIONS[0]);
    const [xmlContent, setXmlContent] = useState('');
    const [xmlFileName, setXmlFileName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const fetchBots = async () => {
        setIsLoadingList(true);
        try {
            const res = await fetch('/api/bots');
            const data = await res.json();
            if (res.ok) setBots(data.bots || []);
        } catch {
            // The list here is a convenience view for the admin, not critical to surface errors for.
        } finally {
            setIsLoadingList(false);
        }
    };

    useEffect(() => {
        fetchBots();
    }, []);

    const handleXmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setXmlFileName(file.name);
        const reader = new FileReader();
        reader.onload = ev => {
            setXmlContent(String(ev.target?.result || ''));
        };
        reader.readAsText(file);
    };

    const resetForm = () => {
        setName('');
        setDescription('');
        setMarket(MARKET_OPTIONS[0]);
        setRiskLevel(RISK_OPTIONS[0]);
        setContractType(CONTRACT_TYPE_OPTIONS[0]);
        setXmlContent('');
        setXmlFileName('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) {
            toast.error(localize('Enter the admin password first'));
            return;
        }
        if (!name.trim() || !description.trim() || !xmlContent) {
            toast.error(localize('Name, description, and an XML file are all required'));
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/bots', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': password,
                },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    market,
                    risk_level: riskLevel,
                    contract_type: contractType,
                    xml_content: xmlContent,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || localize('Failed to save bot'));

            toast.success(localize('Bot added'));
            resetForm();
            fetchBots();
        } catch (err: any) {
            toast.error(err?.message || localize('Failed to save bot'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (bot: TBotSummary) => {
        if (!password) {
            toast.error(localize('Enter the admin password first'));
            return;
        }
        // eslint-disable-next-line no-alert
        if (!window.confirm(`${localize('Delete this bot?')} "${bot.name}"`)) return;

        setDeletingId(bot.id);
        try {
            const res = await fetch(`/api/bots/${bot.id}`, {
                method: 'DELETE',
                headers: { 'x-admin-password': password },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || localize('Failed to delete bot'));

            toast.success(localize('Bot deleted'));
            fetchBots();
        } catch (err: any) {
            toast.error(err?.message || localize('Failed to delete bot'));
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className='admin-bots'>
            <div className='admin-bots__header'>
                <h1 className='admin-bots__title'>
                    <Localize i18n_default_text='Manage Free Bots' />
                </h1>
                <p className='admin-bots__subtitle'>
                    <Localize i18n_default_text='Add a new bot below, or remove one from the list.' />
                </p>
            </div>

            <div className='admin-bots__password-field'>
                <label htmlFor='admin-password'>
                    <Localize i18n_default_text='Admin password' />
                </label>
                <input
                    id='admin-password'
                    type='password'
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={localize('Required to add or delete bots')}
                />
            </div>

            <form className='admin-bots__form' onSubmit={handleSubmit}>
                <label>
                    <Localize i18n_default_text='Bot name' />
                    <input
                        type='text'
                        value={name}
                        onChange={e => setName(e.target.value)}
                        maxLength={200}
                        required
                    />
                </label>

                <label>
                    <Localize i18n_default_text='Description' />
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={4}
                        maxLength={5000}
                        required
                    />
                </label>

                <div className='admin-bots__form-row'>
                    <label>
                        <Localize i18n_default_text='Market' />
                        <select value={market} onChange={e => setMarket(e.target.value)}>
                            {MARKET_OPTIONS.map(option => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <Localize i18n_default_text='Risk level' />
                        <select value={riskLevel} onChange={e => setRiskLevel(e.target.value)}>
                            {RISK_OPTIONS.map(option => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <label>
                    <Localize i18n_default_text='Contract type' />
                    <select value={contractType} onChange={e => setContractType(e.target.value)}>
                        {CONTRACT_TYPE_OPTIONS.map(option => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    <Localize i18n_default_text='Bot XML file' />
                    <input type='file' accept='application/xml, text/xml' onChange={handleXmlFile} />
                    {xmlFileName && <span className='admin-bots__file-name'>{xmlFileName}</span>}
                </label>

                <button type='submit' className='admin-bots__submit-btn' disabled={isSubmitting}>
                    {isSubmitting ? (
                        <Localize i18n_default_text='Saving...' />
                    ) : (
                        <Localize i18n_default_text='Add bot' />
                    )}
                </button>
            </form>

            <div className='admin-bots__list'>
                <h2>
                    <Localize i18n_default_text='Existing bots' />
                </h2>
                {isLoadingList && (
                    <p>
                        <Localize i18n_default_text='Loading...' />
                    </p>
                )}
                {!isLoadingList && bots.length === 0 && (
                    <p>
                        <Localize i18n_default_text='No bots yet.' />
                    </p>
                )}
                {bots.map(bot => (
                    <div key={bot.id} className='admin-bots__list-item'>
                        <div>
                            <strong>{bot.name}</strong>
                            <span className='admin-bots__list-tags'>
                                {bot.contract_type ? `${bot.contract_type} · ` : ''}
                                {bot.market} · {bot.risk_level}
                            </span>
                        </div>
                        <button
                            type='button'
                            className='admin-bots__delete-btn'
                            disabled={deletingId === bot.id}
                            onClick={() => handleDelete(bot)}
                        >
                            {deletingId === bot.id ? (
                                <Localize i18n_default_text='Deleting...' />
                            ) : (
                                <Localize i18n_default_text='Delete' />
                            )}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminBots;
