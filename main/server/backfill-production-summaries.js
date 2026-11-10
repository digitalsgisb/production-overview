const fs = require("node:fs/promises");
const { malaysiaDay, parseDay, PRODUCTION_SITES } = require("./production-periods");
const { createProductionSummaries } = require("./production-summaries");

function verifyMapping(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error("Supply a nonempty array of verified historical line mappings.");
    }
    const byLine = new Map();
    for (const entry of entries) {
        if (!entry || typeof entry.lineId !== "string" || !entry.lineId.trim() || !PRODUCTION_SITES.includes(entry.site)
            || (entry.from !== undefined && !parseDay(entry.from))
            || (entry.through !== undefined && !parseDay(entry.through))
            || (entry.from && entry.through && entry.from > entry.through)) {
            throw new Error("Each mapping requires a lineId, a valid site, and optional inclusive ISO from/through dates.");
        }
        const range = { site: entry.site, from: entry.from ?? "1000-01-01", through: entry.through ?? "9999-12-31" };
        const existing = byLine.get(entry.lineId) ?? [];
        if (existing.some(({ from, through }) => from <= range.through && through >= range.from)) {
            throw new Error(`Historical mapping ranges overlap for ${entry.lineId}.`);
        }
        byLine.set(entry.lineId, [...existing, range]);
    }
    return byLine;
}

function historicalDay(value, today) {
    const day = /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? value.split("/").reverse().join("-") : value;
    return parseDay(day) && day <= today ? day : null;
}

async function backfill({ pool, entries, apply, today = malaysiaDay() }) {
    const byLine = verifyMapping(entries);
    const summaries = createProductionSummaries({ pool });
    if (apply) await summaries.ensureSchema();
    const client = await pool.connect();
    try {
        await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
        await client.query("SET LOCAL DateStyle TO 'ISO, DMY'");
        const { rows: [schema] } = await client.query(`
            SELECT EXISTS (
                SELECT 1 FROM pg_attribute
                WHERE attrelid = 'session'::regclass AND attname = 'analytics_day' AND NOT attisdropped
            ) AS initialized
        `);
        const { rows } = await client.query(`
            SELECT session_id::text AS id, line_id AS line, date::text AS day
            FROM session
            WHERE end_time IS NOT NULL ${schema.initialized ? "AND analytics_day IS NULL" : ""}
        `);
        // Verify the numeric expressions and reject/session key compatibility before importing.
        await client.query(`
            SELECT s.product_count >= 0, s.oee > 0, r.product_reject >= 0
            FROM session s JOIN reject r ON r.session_id = s.session_id LIMIT 0
        `);
        const candidates = [];
        const skipped = { invalidDate: 0, unmapped: 0 };
        for (const row of rows) {
            const day = historicalDay(row.day, today);
            if (!day) {
                skipped.invalidDate++;
                continue;
            }
            const mapping = byLine.get(row.line)?.find(({ from, through }) => from <= day && day <= through);
            if (!mapping) {
                skipped.unmapped++;
                continue;
            }
            candidates.push({ id: row.id, day, site: mapping.site });
        }
        let updated = 0;
        if (apply && candidates.length) {
            const result = await client.query(`
                UPDATE session s
                SET analytics_day = candidate.day, analytics_site = candidate.site
                FROM jsonb_to_recordset($1::jsonb) AS candidate(id text, day date, site text)
                WHERE s.session_id::text = candidate.id AND s.analytics_day IS NULL AND s.end_time IS NOT NULL
            `, [JSON.stringify(candidates)]);
            updated = result.rowCount;
        }
        await client.query("COMMIT");
        return { candidates: candidates.length, updated, skipped };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    const [filename, mode, ...extra] = process.argv.slice(2);
    if (!filename || ![undefined, "--apply"].includes(mode) || extra.length) {
        throw new Error("Usage: node backfill-production-summaries.js <verified-mapping.json> [--apply]");
    }
    require("dotenv").config();
    const { Pool } = require("pg");
    if (!["DB_HOST", "DB_PORT", "DB_USER", "DB_PASS", "DB_DB"].every((key) => process.env[key])) {
        throw new Error("Set the Production Overview DB_* settings before running the backfill.");
    }
    const pool = new Pool({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
        password: process.env.DB_PASS, database: process.env.DB_DB,
    });
    try {
        const entries = JSON.parse(await fs.readFile(filename, "utf8"));
        const result = await backfill({ pool, entries, apply: mode === "--apply" });
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { backfill };
