/* eslint-disable react/no-array-index-key */
import dayjs from '../../../src/utils/dayjs-config';
import { TCalendarViewProps } from '../calendar.props';
import { localize } from '../../../src/translations';

const getMonthHeaders = () => ({
    Jan: localize('Jan'),
    Feb: localize('Feb'),
    Mar: localize('Mar'),
    Apr: localize('Apr'),
    May: localize('May'),
    Jun: localize('Jun'),
    Jul: localize('Jul'),
    Aug: localize('Aug'),
    Sep: localize('Sep'),
    Oct: localize('Oct'),
    Nov: localize('Nov'),
    Dec: localize('Dec'),
});

export const CalendarMonths = ({ calendar_date, isPeriodDisabled, onClick, selected_date }: TCalendarViewProps) => {
    const moment_date = dayjs.utc(calendar_date);
    const selected_month = dayjs.utc(selected_date).month();
    const month_headers = getMonthHeaders();

    return (
        <div className='calendar-month-panel'>
            {Object.keys(month_headers).map((month, idx) => (
                <span
                    key={month}
                    className={`calendar-month ${idx === selected_month ? 'active' : ''} ${
                        isPeriodDisabled(moment_date.month(idx), 'month') ? 'disabled' : ''
                    } `}
                    onClick={onClick.month}
                    data-month={idx}
                >
                    {month_headers[month as keyof typeof month_headers]}
                </span>
            ))}
        </div>
    );
};
