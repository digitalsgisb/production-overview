const { PRODUCTION_SITES } = require("./production-periods");

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REFRESH_LOCK = 78312495;
const SCHEMA = `
    ALTER TABLE session
        ADD COLUMN IF NOT EXISTS analytics_day date,
        ADD COLUMN IF NOT EXISTS analytics_site text,
        ADD COLUMN IF NOT EXISTS analytics_eligible boolean,
        ADD COLUMN IF NOT EXISTS analytics_target_units bigint,
        ADD COLUMN IF NOT EXISTS analytics_oee_pct numeric;

    CREATE TABLE IF NOT EXISTS production_analytics_summary (
        period text NOT NULL,
        period_start date NOT NULL,
        site text NOT NULL,
        metrics jsonb NOT NULL,
        PRIMARY KEY (period, period_start, site)
    );

    CREATE TABLE IF NOT EXISTS production_analytics_refresh (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
        as_of timestamptz NOT NULL
    );
`;

const BUILD_SUMMARIES = `
    WITH shifts AS (
        SELECT s.session_id, s.analytics_day, s.analytics_site,
               s.analytics_eligible IS NULL AS legacy,
               CASE WHEN s.product_count >= 0 THEN s.product_count END AS output,
               s.analytics_target_units AS target,
               CASE WHEN s.analytics_eligible IS NULL THEN
                   CASE WHEN s.oee > 0 AND s.oee <= 100 THEN s.oee END
               ELSE s.analytics_oee_pct END AS oee
        FROM session s
        WHERE s.end_time IS NOT NULL
          AND s.analytics_day <= (transaction_timestamp() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
          AND s.analytics_site = ANY($1::text[])
          AND s.analytics_eligible IS DISTINCT FROM false
    ), reject_totals AS (
        SELECT r.session_id, CASE WHEN count(*) = 1 AND max(r.product_reject) >= 0
                                  THEN max(r.product_reject) END AS rejects
        FROM reject r
        JOIN shifts s ON s.session_id = r.session_id
        GROUP BY r.session_id
    ), grouped AS (
        SELECT period.kind, period.start_day, scope.site,
               count(*) AS shifts, count(*) FILTER (WHERE s.legacy) AS legacy_shifts,
               sum(s.output) AS output, count(s.output) AS output_shifts,
               sum(r.rejects) AS rejects, count(r.rejects) AS reject_shifts,
               sum(s.target) AS target, count(s.target) AS target_shifts,
               round(avg(s.oee::numeric), 1) AS oee, count(s.oee) AS oee_shifts
        FROM shifts s
        LEFT JOIN reject_totals r USING (session_id)
        CROSS JOIN LATERAL (VALUES
            ('daily', s.analytics_day),
            ('weekly', date_trunc('week', s.analytics_day::timestamp)::date),
            ('monthly', date_trunc('month', s.analytics_day::timestamp)::date),
            ('yearly', date_trunc('year', s.analytics_day::timestamp)::date)
        ) AS period(kind, start_day)
        CROSS JOIN LATERAL (VALUES (s.analytics_site), ('both')) AS scope(site)
        GROUP BY period.kind, period.start_day, scope.site
    )
    INSERT INTO production_analytics_summary (period, period_start, site, metrics)
    SELECT kind, start_day, site, jsonb_build_object(
        'shiftCount', shifts, 'legacyShiftCount', legacy_shifts,
        'output', output, 'outputShiftCount', output_shifts,
        'rejects', rejects, 'rejectShiftCount', reject_shifts,
        'target', target, 'targetShiftCount', target_shifts,
        'oee', oee, 'oeeShiftCount', oee_shifts,
        'attainment', CASE WHEN target_shifts = shifts AND output_shifts = shifts AND target > 0
                           THEN round(output::numeric * 100 / target, 1) END
    ) FROM grouped
`;

function parseShiftTarget(value) {
    if (value === undefined) return null;
    if ((typeof value !== "number" && typeof value !== "string")
        || (typeof value === "string" && !/^\d+$/.test(value.trim()))) {
        throw new Error("shift_target_units must be a non-negative whole number.");
    }
    const target = Number(value);
    if (!Number.isSafeInteger(target) || target < 0) {
        throw new Error("shift_target_units must be a non-negative whole number.");
    }
    return target;
}

function validPercent(value) {
    if ((typeof value !== "number" && typeof value !== "string")
        || (typeof value === "string" && value.trim() === "")) return null;
    const percent = Number(value);
    return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
}

function recordedOee(data) {
    const explicit = validPercent(data.oee ?? data.oee_pct);
    if (explicit !== null) return explicit;
    const availability = validPercent(data.availability_pct ?? data.availability_pctm);
    const performance = validPercent(data.performance_pct);
    const quality = validPercent(data.quality_pct);
    return [availability, performance, quality].includes(null) ? null : availability * performance * quality / 10000;
}

function createProductionSummaries({ pool, log = console }) {
    let schemaReady;
    let pending = false;
    let running = false;

    function ensureSchema() {
        schemaReady ??= pool.query(SCHEMA).catch((error) => {
            schemaReady = undefined;
            throw error;
        });
        return schemaReady;
    }

    async function refresh() {
        await ensureSchema();
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const { rows: [lock] } = await client.query(
                "SELECT pg_try_advisory_xact_lock($1) AS acquired", [REFRESH_LOCK],
            );
            if (lock.acquired) {
                await client.query("DELETE FROM production_analytics_summary");
                await client.query(BUILD_SUMMARIES, [PRODUCTION_SITES]);
                await client.query(`
                    INSERT INTO production_analytics_refresh (singleton, as_of) VALUES (true, transaction_timestamp())
                    ON CONFLICT (singleton) DO UPDATE SET as_of = EXCLUDED.as_of
                `);
            }
            await client.query("COMMIT");
            return lock.acquired;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async function drainRefreshes() {
        running = true;
        try {
            while (pending) {
                pending = false;
                try {
                    await refresh();
                } catch (error) {
                    log.error("Production summary refresh failed:", error.message);
                }
            }
        } finally {
            running = false;
        }
    }

    function requestRefresh() {
        pending = true;
        if (!running) void drainRefreshes();
    }

    function start() {
        requestRefresh();
        return setInterval(requestRefresh, REFRESH_INTERVAL_MS).unref();
    }

    async function getSummary({ period, start, site }) {
        const { rows: [row] } = await pool.query(`
            SELECT state.as_of AS "asOf", summary.metrics
            FROM production_analytics_refresh state
            LEFT JOIN production_analytics_summary summary
              ON summary.period = $1 AND summary.period_start = $2::date AND summary.site = $3
            WHERE state.singleton
        `, [period, start, site]);
        return row ?? null;
    }

    return { ensureSchema, refresh, requestRefresh, start, getSummary };
}

module.exports = { createProductionSummaries, parseShiftTarget, recordedOee };
