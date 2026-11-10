const PRODUCTION_TIME_ZONE = "Asia/Kuala_Lumpur";
const PRODUCTION_SITES = ["Port Klang", "Sendayan"];
const PERIODS = ["daily", "weekly", "monthly", "yearly"];
const dateFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRODUCTION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

function malaysiaDay(instant = new Date()) {
    return dateFormat.format(instant);
}

function isoDay(date) {
    return date.toISOString().slice(0, 10);
}

function parseDay(value) {
    if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && isoDay(date) === value ? date : null;
}

function periodStart(period, date) {
    const start = new Date(date);
    if (period === "weekly") start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    if (period === "monthly" || period === "yearly") start.setUTCDate(1);
    if (period === "yearly") start.setUTCMonth(0);
    return start;
}

function periodBounds(period, anchor) {
    const start = periodStart(period, anchor);
    const end = new Date(start);
    if (period === "daily") end.setUTCDate(end.getUTCDate() + 1);
    if (period === "weekly") end.setUTCDate(end.getUTCDate() + 7);
    if (period === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
    if (period === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    return { start: isoDay(start), end: isoDay(end) };
}

function resolvePeriod(period, { date, relative }, today) {
    if (!PERIODS.includes(period) || (date !== undefined && relative !== undefined)) return null;
    let anchor = date === undefined ? parseDay(today) : parseDay(date);
    if (!anchor || isoDay(anchor) > today) return null;
    if (relative === "previous") {
        anchor = periodStart(period, anchor);
        anchor.setUTCDate(anchor.getUTCDate() - 1);
    } else if (relative !== undefined && relative !== "current") {
        return null;
    } else if (date === undefined && relative === undefined) {
        return null;
    }
    const bounds = periodBounds(period, anchor);
    return { ...bounds, through: bounds.end > today ? today : bounds.end };
}

module.exports = { malaysiaDay, parseDay, resolvePeriod, PERIODS, PRODUCTION_SITES, PRODUCTION_TIME_ZONE };
