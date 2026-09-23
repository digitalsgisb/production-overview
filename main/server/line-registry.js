const { ProductionLine } = require('./class.js');

const SITES = ['Port Klang', 'Sendayan'];
const DEFAULT_LINES = [
    { lineId: 'ABB2', name: 'ABB2', site: 'Port Klang', dashboardUrl: 'https://abb2pkgrafana.sugidigital.org/d/adfnddq/abb2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
    { lineId: 'ABB4', name: 'ABB4', site: 'Port Klang', dashboardUrl: 'https://abb4grafana.sugidigital.org/d/fe9tzft54x1xcf/abb4-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
    { lineId: 'ABB7', name: 'ABB7', site: 'Port Klang', dashboardUrl: 'https://abb7grafana.sugidigital.org/' },
    { lineId: 'ABB1', name: 'ABB1', site: 'Port Klang' },
    { lineId: 'SDY1', name: 'SDY1', site: 'Sendayan', dashboardUrl: 'https://l1sdygrafana.sugidigital.org/d/adqr5dg/line-1-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
    { lineId: 'SDY2', name: 'SDY2', site: 'Sendayan', dashboardUrl: 'https://l2sdygrafana.sugidigital.org/d/ad6zlmx/line-2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
];

function validateLine(input) {
    const lineId = String(input?.lineId || '').trim().toUpperCase();
    const name = String(input?.name || '').trim();
    const site = String(input?.site || '').trim();
    const dashboardUrl = String(input?.dashboardUrl || '').trim();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(lineId)) throw new Error('Line ID must be 2–24 letters, numbers, dashes or underscores.');
    if (!name || name.length > 80) throw new Error('Line name is required and must be 80 characters or fewer.');
    if (!SITES.includes(site)) throw new Error('Choose Port Klang or Sendayan.');
    if (dashboardUrl) {
        let parsed;
        try { parsed = new URL(dashboardUrl); } catch { throw new Error('Enter a valid dashboard URL.'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Dashboard URL must start with http:// or https://.');
    }
    return { lineId, name, site, dashboardUrl };
}

function fromRow(row) {
    return { lineId: row.line_id, name: row.display_name, site: row.site, dashboardUrl: row.dashboard_url || '' };
}

function createLineRegistry({ pool, hasDatabaseConfig }) {
    const configs = new Map(DEFAULT_LINES.map((line) => [line.lineId, { ...line, dashboardUrl: line.dashboardUrl || '' }]));
    const productionLines = new Map(DEFAULT_LINES.map((line) => [line.lineId, new ProductionLine(line.lineId)]));
    let loadPromise;

    function ensureLoaded() {
        if (!hasDatabaseConfig) return Promise.resolve();
        if (!loadPromise) {
            loadPromise = (async () => {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS production_overview_lines (
                        line_id VARCHAR(24) PRIMARY KEY,
                        display_name VARCHAR(80) NOT NULL,
                        site VARCHAR(40) NOT NULL,
                        dashboard_url TEXT NOT NULL DEFAULT ''
                    )
                `);
                for (const line of DEFAULT_LINES) {
                    await pool.query(`
                        INSERT INTO production_overview_lines (line_id, display_name, site, dashboard_url)
                        VALUES ($1, $2, $3, $4) ON CONFLICT (line_id) DO NOTHING
                    `, [line.lineId, line.name, line.site, line.dashboardUrl || '']);
                }
                const result = await pool.query('SELECT line_id, display_name, site, dashboard_url FROM production_overview_lines ORDER BY site, line_id');
                configs.clear();
                for (const row of result.rows) {
                    const config = fromRow(row);
                    configs.set(config.lineId, config);
                    if (!productionLines.has(config.lineId)) productionLines.set(config.lineId, new ProductionLine(config.lineId));
                }
            })().catch((error) => { loadPromise = undefined; throw error; });
        }
        return loadPromise;
    }

    function list(sites = SITES) {
        return [...configs.values()].filter((line) => sites.includes(line.site));
    }

    async function create(input) {
        if (!hasDatabaseConfig) throw new Error('Database configuration is required to add lines.');
        await ensureLoaded();
        const line = validateLine(input);
        if (configs.has(line.lineId)) throw new Error('This line ID already exists.');
        await pool.query(`
            INSERT INTO production_overview_lines (line_id, display_name, site, dashboard_url)
            VALUES ($1, $2, $3, $4)
        `, [line.lineId, line.name, line.site, line.dashboardUrl]);
        configs.set(line.lineId, line);
        productionLines.set(line.lineId, new ProductionLine(line.lineId));
        return line;
    }

    async function update(lineId, input) {
        if (!hasDatabaseConfig) throw new Error('Database configuration is required to edit lines.');
        await ensureLoaded();
        const previous = configs.get(lineId);
        if (!previous) throw new Error('Unknown line ID.');
        const line = validateLine({ ...previous, ...input, lineId });
        await pool.query(`
            UPDATE production_overview_lines SET display_name = $1, site = $2, dashboard_url = $3
            WHERE line_id = $4
        `, [line.name, line.site, line.dashboardUrl, lineId]);
        configs.set(lineId, line);
        return line;
    }

    return { ensureLoaded, list, create, update, configs, productionLines };
}

module.exports = { createLineRegistry, validateLine, DEFAULT_LINES, SITES };
