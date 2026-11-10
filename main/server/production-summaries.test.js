const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const test = require("node:test");
const { Pool } = require("pg");
const { malaysiaDay, resolvePeriod } = require("./production-periods");
const { createProductionSummaries, parseShiftTarget, recordedOee } = require("./production-summaries");
const { backfill } = require("./backfill-production-summaries");

test("Malaysia midnight, Monday weeks, leap months and calendar years", () => {
    assert.equal(malaysiaDay(new Date("2024-02-29T15:59:59Z")), "2024-02-29");
    assert.equal(malaysiaDay(new Date("2024-02-29T16:00:00Z")), "2024-03-01");
    const today = "2024-03-01";
    assert.deepEqual(resolvePeriod("daily", { relative: "previous" }, today), {
        start: "2024-02-29", end: "2024-02-29", through: "2024-02-29",
    });
    assert.deepEqual(resolvePeriod("weekly", { relative: "current" }, today), {
        start: "2024-02-26", end: "2024-03-03", through: today,
    });
    assert.deepEqual(resolvePeriod("monthly", { relative: "previous" }, today), {
        start: "2024-02-01", end: "2024-02-29", through: "2024-02-29",
    });
    assert.deepEqual(resolvePeriod("yearly", { date: "2023-08-11" }, today), {
        start: "2023-01-01", end: "2023-12-31", through: "2023-12-31",
    });
    assert.equal(resolvePeriod("daily", { date: "2024-02-30" }, today), null);
    assert.equal(resolvePeriod("yearly", { date: "2025-01-01" }, today), null);
    assert.equal(resolvePeriod("daily", { date: today, relative: "current" }, today), null);
});

test("new shifts preserve the difference between missing and zero targets or OEE", () => {
    assert.equal(parseShiftTarget(undefined), null);
    assert.equal(parseShiftTarget("150"), 150);
    assert.equal(parseShiftTarget(0), 0);
    for (const value of ["", null, -1, 1.5, false, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => parseShiftTarget(value), /non-negative whole number/);
    }
    assert.equal(recordedOee({ oee_pct: 0 }), 0);
    assert.equal(recordedOee({ availability_pctm: 80, performance_pct: 50, quality_pct: 100 }), 40);
    assert.equal(recordedOee({ availability_pct: 0, product_count: 20 }), null);
    assert.equal(recordedOee({ oee: "missing" }), null);
});

const databaseUrl = process.env.PRODUCTION_TEST_DB_URL;
test("PostgreSQL builds saved periods, refreshes on closure, and imports only verified history", {
    skip: !databaseUrl && "Set PRODUCTION_TEST_DB_URL to a disposable PostgreSQL database.",
}, async () => {
    const schema = `production_analytics_test_${randomBytes(8).toString("hex")}`;
    const admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    let interval;
    try {
        await pool.query(`
            CREATE TABLE session (session_id integer PRIMARY KEY, line_id text, date text,
                                  end_time time, product_count integer, oee numeric);
            CREATE TABLE reject (session_id integer, product_reject integer);
            INSERT INTO session VALUES
                (1, 'PK-1', '29/02/2024', '01:00', 60, 80),
                (2, 'PK-1', '29/02/2024', '21:00', 40, 0),
                (3, 'SY-1', '2024-03-01', '21:00', 100, 70),
                (4, 'PK-1', '29/02/2024', '21:00', 500, 100),
                (5, 'PK-1', '29/02/2024', NULL, 80, 90),
                (6, 'LEGACY', '28/02/2024', '21:00', 20, 60),
                (7, 'UNKNOWN', '2024-02-29', '21:00', 500, 80),
                (8, 'LEGACY', '31/02/2024', '21:00', 500, 80);
            INSERT INTO reject VALUES (1, 5), (2, 0), (3, 8), (4, 50), (5, 9), (6, 2);
        `);
        const entries = [{ lineId: "LEGACY", site: "Sendayan", through: "2024-02-29" }];
        const summaries = createProductionSummaries({ pool });
        await summaries.ensureSchema();
        await pool.query(`
            UPDATE session SET analytics_day = '2024-02-29', analytics_site = 'Port Klang',
                               analytics_eligible = session_id <> 4
            WHERE session_id IN (1, 2, 4, 5);
            UPDATE session SET analytics_day = '2024-03-01', analytics_site = 'Sendayan', analytics_eligible = true
            WHERE session_id = 3;
            UPDATE session SET analytics_target_units = 100, analytics_oee_pct = 80 WHERE session_id = 1;
            UPDATE session SET analytics_oee_pct = 0 WHERE session_id = 2;
            UPDATE session SET analytics_target_units = 100, analytics_oee_pct = 70 WHERE session_id = 3;
            UPDATE session SET analytics_target_units = 100, analytics_oee_pct = 90 WHERE session_id = 5;
        `);
        const read = (period, start, site = "both") => summaries.getSummary({ period, start, site });
        const waitFor = async (check) => {
            for (let attempt = 0; attempt < 100; attempt++) {
                const result = await check();
                if (result) return result;
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            assert.fail("The refreshed snapshot was not published.");
        };
        assert.equal(await read("daily", "2024-02-29"), null);
        interval = summaries.start();
        const daily = await waitFor(() => read("daily", "2024-02-29", "Port Klang"));
        assert.deepEqual(daily.metrics, {
            shiftCount: 2, legacyShiftCount: 0, output: 100, outputShiftCount: 2, rejects: 5, rejectShiftCount: 2,
            target: 100, targetShiftCount: 1, oee: 40, oeeShiftCount: 2, attainment: null,
        });
        assert.equal((await read("weekly", "2024-02-26")).metrics.output, 200);
        assert.equal((await read("monthly", "2024-03-01", "Sendayan")).metrics.attainment, 100);
        assert.equal((await read("yearly", "2024-01-01")).metrics.oee, 50);
        assert.equal((await read("daily", "2024-02-01")).metrics, null);

        await pool.query("UPDATE session SET end_time = '01:00' WHERE session_id = 5");
        assert.equal((await read("daily", "2024-02-29")).metrics.output, 100);
        summaries.requestRefresh();
        summaries.requestRefresh();
        await waitFor(async () => (await read("daily", "2024-02-29")).metrics.output === 180);
        await summaries.refresh();
        assert.equal((await read("daily", "2024-02-29")).metrics.output, 180);

        assert.deepEqual(await backfill({ pool, entries, apply: false }), {
            candidates: 1, updated: 0, skipped: { invalidDate: 1, unmapped: 1 },
        });
        assert.equal((await backfill({ pool, entries, apply: true })).updated, 1);
        assert.equal((await backfill({ pool, entries, apply: true })).updated, 0);
        await waitFor(async () => {
            await summaries.refresh();
            return (await read("yearly", "2024-01-01")).metrics.legacyShiftCount === 1;
        });
        assert.equal((await read("yearly", "2024-01-01")).metrics.output, 300);
    } finally {
        clearInterval(interval);
        await pool.end();
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
    }
});
