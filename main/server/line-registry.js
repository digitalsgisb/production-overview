const { ProductionLine } = require('./class.js');

const SITES = ['Port Klang', 'Sendayan'];
const LINE_STATES = ['active', 'out_of_commission', 'maintenance'];
const DEFAULT_LINES = [
    { lineId: 'ABB2', name: 'ABB2', site: 'Port Klang', dashboardUrl: 'https://abb2pkgrafana.sugidigital.org/d/adfnddq/abb2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
    { lineId: 'ABB4', name: 'ABB4', site: 'Port Klang', dashboardUrl: 'https://abb4grafana.sugidigital.org/d/fe9tzft54x1xcf/abb4-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
    { lineId: 'ABB7', name: 'ABB7', site: 'Port Klang', dashboardUrl: 'https://abb7grafana.sugidigital.org/' },
    { lineId: 'ABB1', name: 'ABB1', site: 'Port Klang' },
    { lineId: 'SDY1', name: 'SDY1', site: 'Sendayan', dashboardUrl: 'https://l1sdygrafana.sugidigital.org/d/adqr5dg/line-1-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
    { lineId: 'SDY2', name: 'SDY2', site: 'Sendayan', dashboardUrl: 'https://l2sdygrafana.sugidigital.org/d/ad6zlmx/line-2-smart-dashboard?orgId=1&from=now-5m&to=now&timezone=browser&refresh=5s' },
];

function validateLine(input, { allowMissingReason = false } = {}) {
    const lineId = String(input?.lineId || '').trim().toUpperCase();
    const name = String(input?.name || '').trim();
    const site = String(input?.site || '').trim();
    const dashboardUrl = String(input?.dashboardUrl || '').trim();
    const cardSize = String(input?.cardSize || 'standard').trim();
    const requestedState = String(input?.operationalState || 'active').trim().toLowerCase();
    const operationalState = requestedState === 'commissioning' ? 'out_of_commission' : requestedState;
    const stateNote = String(input?.stateNote || '').trim();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(lineId)) throw new Error('Line ID must be 2–24 letters, numbers, dashes or underscores.');
    if (!name || name.length > 80) throw new Error('Line name is required and must be 80 characters or fewer.');
    if (!SITES.includes(site)) throw new Error('Choose Port Klang or Sendayan.');
    if (!['compact', 'standard', 'wide'].includes(cardSize)) throw new Error('Choose a valid card size.');
    if (!LINE_STATES.includes(operationalState)) throw new Error('Choose a valid line state.');
    if (stateNote.length > 240) throw new Error('Line state note must be 240 characters or fewer.');
    if (operationalState !== 'active' && !stateNote && !allowMissingReason) throw new Error('Enter a reason for this line state.');
    if (dashboardUrl) {
        let parsed;
        try { parsed = new URL(dashboardUrl); } catch { throw new Error('Enter a valid dashboard URL.'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Dashboard URL must start with http:// or https://.');
    }
    return { lineId, name, site, dashboardUrl, cardSize, operationalState, stateNote };
}

function fromRow(row) {
    return { lineId: row.line_id, name: row.display_name, site: row.site, dashboardUrl: row.dashboard_url || '', cardSize: row.card_size || 'standard', operationalState: row.operational_state === 'commissioning' ? 'out_of_commission' : LINE_STATES.includes(row.operational_state) ? row.operational_state : 'active', stateNote: row.state_note || '', sortOrder: Number(row.sort_order) || 0 };
}

function createLineRegistry({ pool, hasDatabaseConfig }) {
    const configs = new Map(DEFAULT_LINES.map((line, index) => [line.lineId, { ...line, dashboardUrl: line.dashboardUrl || '', cardSize: 'standard', operationalState: 'active', stateNote: '', sortOrder: index }]));
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
                        dashboard_url TEXT NOT NULL DEFAULT '',
                        deleted BOOLEAN NOT NULL DEFAULT FALSE,
                        card_size VARCHAR(12) NOT NULL DEFAULT 'standard',
                        sort_order INTEGER NOT NULL DEFAULT 0,
                        operational_state VARCHAR(16) NOT NULL DEFAULT 'active',
                        state_note VARCHAR(240) NOT NULL DEFAULT ''
                    )
                `);
                await pool.query('ALTER TABLE production_overview_lines ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE');
                await pool.query("ALTER TABLE production_overview_lines ADD COLUMN IF NOT EXISTS card_size VARCHAR(12) NOT NULL DEFAULT 'standard'");
                await pool.query('ALTER TABLE production_overview_lines ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0');
                await pool.query("ALTER TABLE production_overview_lines ADD COLUMN IF NOT EXISTS operational_state VARCHAR(16) NOT NULL DEFAULT 'active'");
                await pool.query("ALTER TABLE production_overview_lines ADD COLUMN IF NOT EXISTS state_note VARCHAR(240) NOT NULL DEFAULT ''");
                await pool.query("UPDATE production_overview_lines SET operational_state = 'out_of_commission' WHERE operational_state = 'commissioning'");
                for (const [index, line] of DEFAULT_LINES.entries()) {
                    await pool.query(`
                        INSERT INTO production_overview_lines (line_id, display_name, site, dashboard_url, sort_order)
                        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (line_id) DO NOTHING
                    `, [line.lineId, line.name, line.site, line.dashboardUrl || '', index]);
                }
                const result = await pool.query('SELECT line_id, display_name, site, dashboard_url, card_size, operational_state, state_note, sort_order FROM production_overview_lines WHERE deleted = FALSE ORDER BY site, sort_order, line_id');
                configs.clear();
                productionLines.clear();
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
        return [...configs.values()].filter((line) => sites.includes(line.site)).sort((a, b) => a.site.localeCompare(b.site) || a.sortOrder - b.sortOrder || a.lineId.localeCompare(b.lineId));
    }

    async function create(input) {
        if (!hasDatabaseConfig) throw new Error('Database configuration is required to add lines.');
        await ensureLoaded();
        const line = validateLine(input);
        if (configs.has(line.lineId)) throw new Error('This line ID already exists.');
        line.sortOrder = Math.max(-1, ...list([line.site]).map((item) => item.sortOrder)) + 1;
        await pool.query(`
            INSERT INTO production_overview_lines (line_id, display_name, site, dashboard_url, card_size, sort_order, operational_state, state_note, deleted)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
            ON CONFLICT (line_id) DO UPDATE SET
              display_name = EXCLUDED.display_name,
              site = EXCLUDED.site,
              dashboard_url = EXCLUDED.dashboard_url,
              card_size = EXCLUDED.card_size,
              sort_order = EXCLUDED.sort_order,
              operational_state = EXCLUDED.operational_state,
              state_note = EXCLUDED.state_note,
              deleted = FALSE
        `, [line.lineId, line.name, line.site, line.dashboardUrl, line.cardSize, line.sortOrder, line.operationalState, line.stateNote]);
        configs.set(line.lineId, line);
        productionLines.set(line.lineId, new ProductionLine(line.lineId));
        return line;
    }

    async function update(lineId, input) {
        if (!hasDatabaseConfig) throw new Error('Database configuration is required to edit lines.');
        await ensureLoaded();
        const previous = configs.get(lineId);
        if (!previous) throw new Error('Unknown line ID.');
        const allowMissingReason = previous.operationalState !== 'active' && !previous.stateNote && input.operationalState === undefined && input.stateNote === undefined;
        const line = { ...validateLine({ ...previous, ...input, lineId }, { allowMissingReason }), sortOrder: previous.sortOrder };
        if (line.site !== previous.site) line.sortOrder = Math.max(-1, ...list([line.site]).map((item) => item.sortOrder)) + 1;
        await pool.query(`
            UPDATE production_overview_lines SET display_name = $1, site = $2, dashboard_url = $3, card_size = $4, sort_order = $5, operational_state = $6, state_note = $7
            WHERE line_id = $8
        `, [line.name, line.site, line.dashboardUrl, line.cardSize, line.sortOrder, line.operationalState, line.stateNote, lineId]);
        configs.set(lineId, line);
        return line;
    }

    async function remove(lineId) {
        if (!hasDatabaseConfig) throw new Error('Database configuration is required to remove lines.');
        await ensureLoaded();
        if (!configs.has(lineId)) throw new Error('Unknown line ID.');
        await pool.query('UPDATE production_overview_lines SET deleted = TRUE WHERE line_id = $1', [lineId]);
        configs.delete(lineId);
        productionLines.delete(lineId);
    }

    async function reorder(site, lineIds) {
        if (!hasDatabaseConfig) throw new Error('Database configuration is required to reorder lines.');
        await ensureLoaded();
        if (!SITES.includes(site)) throw new Error('Choose Port Klang or Sendayan.');
        const currentIds = list([site]).map((line) => line.lineId);
        if (!Array.isArray(lineIds) || lineIds.length !== currentIds.length || new Set(lineIds).size !== currentIds.length || lineIds.some((id) => !currentIds.includes(id))) {
            throw new Error('Order must contain every line at this site exactly once.');
        }
        const order = lineIds.map((lineId, position) => ({ line_id: lineId, position }));
        await pool.query(`
            UPDATE production_overview_lines AS line SET sort_order = ordered.position
            FROM jsonb_to_recordset($1::jsonb) AS ordered(line_id TEXT, position INTEGER)
            WHERE line.line_id = ordered.line_id AND line.site = $2 AND line.deleted = FALSE
        `, [JSON.stringify(order), site]);
        lineIds.forEach((lineId, position) => configs.set(lineId, { ...configs.get(lineId), sortOrder: position }));
        return list([site]);
    }

    return { ensureLoaded, list, create, update, remove, reorder, configs, productionLines };
}

module.exports = { createLineRegistry, validateLine, DEFAULT_LINES, SITES, LINE_STATES };
