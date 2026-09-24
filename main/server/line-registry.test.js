const test = require('node:test');
const assert = require('node:assert/strict');
const { createLineRegistry, validateLine, DEFAULT_LINES } = require('./line-registry.js');

test('new line details are validated before registration', () => {
    assert.deepEqual(validateLine({ lineId: 'abb8', name: 'Assembly 8', site: 'Port Klang', dashboardUrl: '' }), {
        lineId: 'ABB8', name: 'Assembly 8', site: 'Port Klang', dashboardUrl: '', cardSize: 'standard', operationalState: 'active', stateNote: '',
    });
    assert.throws(() => validateLine({ lineId: 'bad id', name: 'X', site: 'Port Klang' }), /Line ID/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Unknown' }), /Choose/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Port Klang', dashboardUrl: 'javascript:alert(1)' }), /Dashboard URL/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Port Klang', cardSize: 'giant' }), /card size/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Port Klang', operationalState: 'broken' }), /line state/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Port Klang', stateNote: 'x'.repeat(241) }), /state note/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Port Klang', operationalState: 'maintenance' }), /reason/);
    assert.equal(validateLine({ lineId: 'ABB8', name: 'X', site: 'Port Klang', operationalState: 'commissioning', stateNote: 'Trial run' }).operationalState, 'out_of_commission');
});

test('admin line state persists across a registry reload', async () => {
    let stateColumnLimit = 16;
    const rows = new Map(DEFAULT_LINES.map((line, index) => [line.lineId, {
        line_id: line.lineId, display_name: line.name, site: line.site, dashboard_url: line.dashboardUrl || '',
        card_size: 'standard', operational_state: ['ABB4', 'ABB7'].includes(line.lineId) ? 'commissioning' : 'active', state_note: line.lineId === 'ABB4' ? 'Trial run' : '', sort_order: index, deleted: false,
    }]));
    const pool = {
        async query(sql, params = []) {
            if (sql.includes('ALTER COLUMN operational_state TYPE VARCHAR(24)')) {
                stateColumnLimit = 24;
                return { rows: [] };
            }
            if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE')) return { rows: [] };
            if (sql.includes("SET operational_state = 'out_of_commission'")) {
                if ('out_of_commission'.length > stateColumnLimit) throw new Error('value too long for type character varying(16)');
                for (const row of rows.values()) if (row.operational_state === 'commissioning') row.operational_state = 'out_of_commission';
                return { rows: [] };
            }
            if (sql.includes('ON CONFLICT (line_id) DO NOTHING')) return { rows: [] };
            if (sql.includes('SELECT line_id')) return { rows: [...rows.values()].filter((row) => !row.deleted) };
            if (sql.includes('SET display_name =')) {
                const row = rows.get(params[7]);
                row.card_size = params[3];
                row.operational_state = params[5];
                row.state_note = params[6];
                return { rows: [] };
            }
            throw new Error(`Unexpected query: ${sql}`);
        },
    };
    const first = createLineRegistry({ pool, hasDatabaseConfig: true });
    await first.update('ABB2', { operationalState: 'maintenance', stateNote: 'Sensor calibration' });
    await first.update('ABB7', { cardSize: 'compact' });
    const restarted = createLineRegistry({ pool, hasDatabaseConfig: true });
    await restarted.ensureLoaded();
    assert.equal(restarted.list().find((line) => line.lineId === 'ABB2').operationalState, 'maintenance');
    assert.equal(restarted.list().find((line) => line.lineId === 'ABB2').stateNote, 'Sensor calibration');
    assert.equal(restarted.list().find((line) => line.lineId === 'ABB4').operationalState, 'out_of_commission');
    assert.equal(restarted.list().find((line) => line.lineId === 'ABB4').stateNote, 'Trial run');
    assert.equal(restarted.list().find((line) => line.lineId === 'ABB7').cardSize, 'compact');
    assert.equal(restarted.list().find((line) => line.lineId === 'ABB7').operationalState, 'out_of_commission');
});

test('registered lines persist and become available for live data without a restart', async () => {
    const rows = DEFAULT_LINES.map((line, index) => ({ line_id: line.lineId, display_name: line.name, site: line.site, dashboard_url: '', card_size: 'standard', sort_order: index, deleted: false }));
    const pool = {
        async query(sql, params) {
            if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE')) return { rows: [] };
            if (sql.includes("SET operational_state = 'out_of_commission'")) return { rows: [] };
            if (sql.includes('INSERT INTO production_overview_lines') && sql.includes('ON CONFLICT')) return { rows: [] };
            if (sql.includes('SELECT line_id')) return { rows: rows.filter((row) => !row.deleted) };
            if (sql.includes('INSERT INTO production_overview_lines')) {
                rows.push({ line_id: params[0], display_name: params[1], site: params[2], dashboard_url: params[3], card_size: params[4], sort_order: params[5], deleted: false });
                return { rows: [] };
            }
            if (sql.includes('UPDATE production_overview_lines')) return { rows: [] };
            throw new Error(`Unexpected query: ${sql}`);
        },
    };
    const registry = createLineRegistry({ pool, hasDatabaseConfig: true });
    const line = await registry.create({ lineId: 'ABB8', name: 'Assembly 8', site: 'Port Klang' });

    assert.equal(line.lineId, 'ABB8');
    assert.equal(registry.productionLines.get('ABB8').line_id, 'ABB8');
    assert.equal(registry.list(['Sendayan']).some((item) => item.lineId === 'ABB8'), false);
    assert.equal(registry.list(['Port Klang']).some((item) => item.lineId === 'ABB8'), true);
    await assert.rejects(registry.create({ lineId: 'ABB8', name: 'Duplicate', site: 'Port Klang' }), /already exists/);
    await registry.update('ABB8', { name: 'Assembly 8 moved', site: 'Sendayan' });
    assert.equal(registry.list(['Port Klang']).some((item) => item.lineId === 'ABB8'), false);
    assert.equal(registry.list(['Sendayan']).some((item) => item.lineId === 'ABB8'), true);
    await registry.remove('ABB8');
    assert.equal(registry.list().some((item) => item.lineId === 'ABB8'), false);
    assert.equal(registry.productionLines.has('ABB8'), false);
    await assert.rejects(registry.remove('ABB8'), /Unknown line ID/);
});

test('removed built-in lines stay hidden after reload and can be registered again', async () => {
    const rows = new Map();
    const pool = {
        async query(sql, params = []) {
            if (sql.includes('CREATE TABLE') || sql.includes('ALTER TABLE')) return { rows: [] };
            if (sql.includes("SET operational_state = 'out_of_commission'")) return { rows: [] };
            if (sql.includes('INSERT INTO production_overview_lines') && sql.includes('ON CONFLICT (line_id) DO NOTHING')) {
                if (!rows.has(params[0])) rows.set(params[0], { line_id: params[0], display_name: params[1], site: params[2], dashboard_url: params[3], card_size: 'standard', sort_order: params[4], deleted: false });
                return { rows: [] };
            }
            if (sql.includes('SELECT line_id')) return { rows: [...rows.values()].filter((row) => !row.deleted) };
            if (sql.includes('SET deleted = TRUE')) { rows.get(params[0]).deleted = true; return { rows: [] }; }
            if (sql.includes('INSERT INTO production_overview_lines')) {
                rows.set(params[0], { line_id: params[0], display_name: params[1], site: params[2], dashboard_url: params[3], card_size: params[4], sort_order: params[5], deleted: false });
                return { rows: [] };
            }
            if (sql.includes('jsonb_to_recordset')) {
                for (const item of JSON.parse(params[0])) rows.get(item.line_id).sort_order = item.position;
                return { rows: [] };
            }
            throw new Error(`Unexpected query: ${sql}`);
        },
    };
    const first = createLineRegistry({ pool, hasDatabaseConfig: true });
    await first.remove('ABB2');
    assert.equal(first.list().some((line) => line.lineId === 'ABB2'), false);

    const restarted = createLineRegistry({ pool, hasDatabaseConfig: true });
    await restarted.ensureLoaded();
    assert.equal(restarted.list().some((line) => line.lineId === 'ABB2'), false);
    await restarted.create({ lineId: 'ABB2', name: 'Reopened line', site: 'Port Klang', cardSize: 'wide' });
    assert.equal(restarted.list().find((line) => line.lineId === 'ABB2').cardSize, 'wide');

    const reversed = restarted.list(['Port Klang']).map((line) => line.lineId).reverse();
    await restarted.reorder('Port Klang', reversed);
    assert.deepEqual(restarted.list(['Port Klang']).map((line) => line.lineId), reversed);
    await assert.rejects(restarted.reorder('Port Klang', ['ABB2']), /every line/);
});
