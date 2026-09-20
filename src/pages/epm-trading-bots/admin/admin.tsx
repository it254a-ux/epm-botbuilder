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

const MARKET_GROUPS: { label: string; options: string[] }[] = [
    {
        label: 'Continuous Indices',
        options: [
            'Volatility 100 (1s) Index',
            'Volatility 10 (1s) Index',
            'Volatility 15 (1s) Index',
            'Volatility 25 (1s) Index',
            'Volatility 30 (1s) Index',
            'Volatility 50 (1s) Index',
            'Volatility 75 (1s) Index',
            'Volatility 90 (1s) Index',
            'Volatility 10 Index',
            'Volatility 100 Index',
            'Volatility 25 Index',
            'Volatility 50 Index',
            'Volatility 75 Index',
        ],
    },
    {
        label: 'Crash/Boom Indices',
        options: [
            'Boom 1000 Index',
            'Boom 150 Index',
            'Boom 300 Index',
            'Boom 50 Index',
            'Boom 500 Index',
            'Boom 600 Index',
            'Boom 900 Index',
            'Crash 1000 Index',
            'Crash 150 Index',
            'Crash 300 Index',
            'Crash 50 Index',
            'Crash 500 Index',
            'Crash 600 Index',
            'Crash 900 Index',
        ],
    },
    {
        label: 'Daily Reset Indices',
        options: ['Bear Market Index', 'Bull Market Index'],
    },
    {
        label: 'Jump Indices',
        options: ['Jump 10 Index', 'Jump 100 Index', 'Jump 25 Index', 'Jump 50 Index', 'Jump 75 Index'],
    },
    {
        label: 'Range Indices',
        options: ['Range Break 100 Index', 'Range Break 200 Index'],
    },
    {
        label: 'Step Indices',
        options: ['Step Index 100', 'Step Index 200', 'Step Index 300', 'Step Index 400', 'Step Index 500'],
    },
    {
        label: 'Other',
        options: ['Other'],
    },
];
// Flattened once for the default/fallback value — MARKET_GROUPS[0].options[0]
// (first item of the first group) reads the same but this stays correct even
// if the groups above get reordered later.
const MARKET_OPTIONS = MARKET_GROUPS.flatMap(group => group.options);
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
    // Non-null while editing an existing bot instead of creating a new one —
    // drives both the form's submit behavior (PUT vs POST) and its labels.
    const [editingId, setEditingId] = useState<number | null>(null);

    const fetchBots = async () => {
        setIsLoadingList(true);
        try {
            const res = await fetch(`/api/bots?t=${Date.now()}`, { cache: 'no-store' });
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
        setEditingId(null);
    };

    // Populates the form from the bot's already-loaded list data (name,
    // market, risk_level, contract_type, description) — the list endpoint
    // doesn't include xml_content (kept out to keep that payload small), so
    // the strategy file field starts empty. Leaving it empty on submit is
    // fine: the PUT endpoint only replaces xml_content when a new file is
    // actually chosen, otherwise it keeps the bot's existing one untouched.
    const handleEdit = (bot: TBotSummary) => {
        setEditingId(bot.id);
        setName(bot.name);
        setDescription(bot.description);
        setMarket(bot.market);
        setRiskLevel(bot.risk_level);
        setContractType(bot.contract_type || CONTRACT_TYPE_OPTIONS[0]);
        setXmlContent('');
        setXmlFileName('');
        // So the admin immediately sees the form they're about to edit,
        // rather than needing to scroll up themselves.
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) {
            toast.error(localize('Enter the admin password first'));
            return;
        }
        const isEditing = editingId !== null;
        // Editing doesn't require re-selecting the XML file — only creating
        // a brand new bot does, since there's no existing file to fall back to.
        if (!name.trim() || !description.trim() || (!isEditing && !xmlContent)) {
            toast.error(
                isEditing
                    ? localize('Name and description are required')
                    : localize('Name, description, and an XML file are all required')
            );
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(isEditing ? `/api/bots?id=${editingId}` : '/api/bots', {
                method: isEditing ? 'PUT' : 'POST',
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
                    // Omitted entirely when empty on an edit, rather than sent
                    // as '', so the backend's "was a file actually chosen"
                    // check works the same way whether the key is absent or
                    // just falsy.
                    ...(xmlContent ? { xml_content: xmlContent } : {}),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || localize(isEditing ? 'Failed to update bot' : 'Failed to save bot'));

            toast.success(isEditing ? localize('Bot updated') : localize('Bot added'));
            resetForm();
            fetchBots();
        } catch (err: any) {
            toast.error(err?.message || localize(isEditing ? 'Failed to update bot' : 'Failed to save bot'));
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
            const res = await fetch(`/api/bots?id=${bot.id}`, {
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
                    <Localize i18n_default_text='Add a new bot below, edit an existing one, or remove one from the list.' />
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
                {editingId !== null && (
                    <div className='admin-bots__editing-banner'>
                        <Localize i18n_default_text='Editing an existing bot' />
                        <button type='button' className='admin-bots__cancel-edit-btn' onClick={resetForm}>
                            <Localize i18n_default_text='Cancel' />
                        </button>
                    </div>
                )}

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
                            {MARKET_GROUPS.map(group => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.options.map(option => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </optgroup>
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
                    {editingId !== null ? (
                        <Localize i18n_default_text='Bot XML file (leave empty to keep the current one)' />
                    ) : (
                        <Localize i18n_default_text='Bot XML file' />
                    )}
                    <input type='file' accept='application/xml, text/xml' onChange={handleXmlFile} />
                    {xmlFileName && <span className='admin-bots__file-name'>{xmlFileName}</span>}
                </label>

                <div className='admin-bots__form-actions'>
                    <button type='submit' className='admin-bots__submit-btn' disabled={isSubmitting}>
                        {isSubmitting ? (
                            <Localize i18n_default_text='Saving...' />
                        ) : editingId !== null ? (
                            <Localize i18n_default_text='Update bot' />
                        ) : (
                            <Localize i18n_default_text='Add bot' />
                        )}
                    </button>
                    {editingId !== null && (
                        <button
                            type='button'
                            className='admin-bots__cancel-btn'
                            onClick={resetForm}
                            disabled={isSubmitting}
                        >
                            <Localize i18n_default_text='Cancel' />
                        </button>
                    )}
                </div>
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
                        <div className='admin-bots__list-item-actions'>
                            <button
                                type='button'
                                className='admin-bots__edit-btn'
                                disabled={deletingId === bot.id}
                                onClick={() => handleEdit(bot)}
                            >
                                <Localize i18n_default_text='Edit' />
                            </button>
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
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminBots;
