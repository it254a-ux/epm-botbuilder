import React, { useEffect, useRef, useState } from 'react';
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
    const [showPassword, setShowPassword] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

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
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    const riskSlug = (r: string) => (/low/i.test(r) ? 'low' : /medium/i.test(r) ? 'medium' : /high/i.test(r) ? 'high' : 'neutral');
    const isEditing = editingId !== null;

    return (
        <div className='admin-bots'>
            <header className='admin-bots__top'>
                <div>
                    <h1 className='admin-bots__title'>
                        <Localize i18n_default_text='Manage Free Bots' />
                    </h1>
                    <p className='admin-bots__subtitle'>
                        <Localize i18n_default_text='Add a new bot, edit an existing one, or remove one from the list.' />
                    </p>
                </div>
                <div className='admin-bots__password-field'>
                    <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                        <rect x='4' y='10' width='16' height='10' rx='2.5' />
                        <path d='M8 10V7a4 4 0 018 0v3' />
                    </svg>
                    <input
                        id='admin-password'
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder={localize('Admin password')}
                        aria-label={localize('Admin password')}
                        autoComplete='off'
                    />
                    <button
                        type='button'
                        className='admin-bots__eye'
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? localize('Hide password') : localize('Show password')}
                    >
                        {showPassword ? localize('Hide') : localize('Show')}
                    </button>
                </div>
            </header>

            <div className='admin-bots__layout'>
                <form ref={formRef} className={`admin-bots__card admin-bots__form${isEditing ? ' is-editing' : ''}`} onSubmit={handleSubmit}>
                    <div className='admin-bots__card-head'>
                        <h2>{isEditing ? <Localize i18n_default_text='Edit bot' /> : <Localize i18n_default_text='Add a new bot' />}</h2>
                        {isEditing && (
                            <span className='admin-bots__editing-pill'>
                                <Localize i18n_default_text='Editing' />
                            </span>
                        )}
                    </div>

                    <div className='admin-bots__grid'>
                        <label className='admin-bots__field admin-bots__field--wide'>
                            <span><Localize i18n_default_text='Bot name' /></span>
                            <input type='text' value={name} onChange={e => setName(e.target.value)} maxLength={200} required />
                        </label>

                        <label className='admin-bots__field'>
                            <span><Localize i18n_default_text='Contract type' /></span>
                            <select value={contractType} onChange={e => setContractType(e.target.value)}>
                                {CONTRACT_TYPE_OPTIONS.map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </label>

                        <label className='admin-bots__field admin-bots__field--wide'>
                            <span><Localize i18n_default_text='Market' /></span>
                            <select value={market} onChange={e => setMarket(e.target.value)}>
                                {MARKET_GROUPS.map(group => (
                                    <optgroup key={group.label} label={group.label}>
                                        {group.options.map(option => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </label>

                        <div className='admin-bots__field'>
                            <span><Localize i18n_default_text='Risk level' /></span>
                            <div className='admin-bots__segment' role='radiogroup'>
                                {RISK_OPTIONS.map(option => (
                                    <button
                                        key={option}
                                        type='button'
                                        role='radio'
                                        aria-checked={riskLevel === option}
                                        className={`admin-bots__seg admin-bots__seg--${riskSlug(option)}${riskLevel === option ? ' is-on' : ''}`}
                                        onClick={() => setRiskLevel(option)}
                                    >
                                        {option.replace(' risk', '')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className='admin-bots__field admin-bots__field--wide admin-bots__field--tall'>
                            <span><Localize i18n_default_text='Description' /></span>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} maxLength={5000} required />
                        </label>

                        <label className={`admin-bots__drop${xmlFileName ? ' has-file' : ''}`}>
                            <input type='file' accept='application/xml, text/xml' onChange={handleXmlFile} />
                            <svg viewBox='0 0 24 24' width='26' height='26' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                                <path d='M12 16V5M7.5 9.5L12 5l4.5 4.5' />
                                <path d='M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16' />
                            </svg>
                            <strong>{xmlFileName || (isEditing ? localize('Choose a new XML file') : localize('Choose the bot XML file'))}</strong>
                            <em>{isEditing ? localize('Leave empty to keep the current file') : localize('Required for a new bot')}</em>
                        </label>
                    </div>

                    <div className='admin-bots__actions'>
                        <button type='submit' className='admin-bots__submit-btn' disabled={isSubmitting}>
                            {isSubmitting ? <Localize i18n_default_text='Saving...' /> : isEditing ? <Localize i18n_default_text='Update bot' /> : <Localize i18n_default_text='Add bot' />}
                        </button>
                        {(isEditing || name || description || xmlFileName) && (
                            <button type='button' className='admin-bots__cancel-btn' onClick={resetForm} disabled={isSubmitting}>
                                {isEditing ? <Localize i18n_default_text='Cancel' /> : <Localize i18n_default_text='Clear' />}
                            </button>
                        )}
                    </div>
                </form>

                <section className='admin-bots__card admin-bots__list'>
                    <div className='admin-bots__card-head'>
                        <h2><Localize i18n_default_text='Existing bots' /></h2>
                        <span className='admin-bots__count'>{bots.length}</span>
                    </div>
                    <div className='admin-bots__list-scroll'>
                        {isLoadingList && (
                            <>
                                <div className='admin-bots__skeleton' />
                                <div className='admin-bots__skeleton' />
                            </>
                        )}
                        {!isLoadingList && bots.length === 0 && (
                            <p className='admin-bots__empty'><Localize i18n_default_text='No bots yet. Add the first one on the left.' /></p>
                        )}
                        {bots.map(bot => (
                            <div key={bot.id} className={`admin-bots__item${editingId === bot.id ? ' is-active' : ''}`}>
                                <span className={`admin-bots__dot admin-bots__dot--${riskSlug(bot.risk_level)}`} aria-hidden='true' />
                                <div className='admin-bots__item-main'>
                                    <strong>{bot.name}</strong>
                                    <span>
                                        {bot.contract_type ? `${bot.contract_type} · ` : ''}
                                        {bot.market} · {bot.risk_level}
                                    </span>
                                </div>
                                <div className='admin-bots__item-actions'>
                                    <button type='button' className='admin-bots__icon-btn admin-bots__icon-btn--edit' disabled={deletingId === bot.id} onClick={() => handleEdit(bot)} title={localize('Edit')} aria-label={localize('Edit')}>
                                        <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                                            <path d='M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3z' />
                                        </svg>
                                    </button>
                                    <button type='button' className='admin-bots__icon-btn admin-bots__icon-btn--delete' disabled={deletingId === bot.id} onClick={() => handleDelete(bot)} title={localize('Delete')} aria-label={localize('Delete')}>
                                        {deletingId === bot.id ? (
                                            <span className='admin-bots__spin' aria-hidden='true' />
                                        ) : (
                                            <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                                                <path d='M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12' />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AdminBots;
