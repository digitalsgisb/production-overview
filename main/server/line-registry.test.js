const test = require('node:test');
const assert = require('node:assert/strict');
const { createLineRegistry, validateLine, DEFAULT_LINES } = require('./line-registry.js');

test('new line details are validated before registration', () => {
    assert.deepEqual(validateLine({ lineId: 'abb8', name: 'Assembly 8', site: 'Port Klang', dashboardUrl: '' }), {
        lineId: 'ABB8', name: 'Assembly 8', site: 'Port Klang', dashboardUrl: '',
    });
    assert.throws(() => validateLine({ lineId: 'bad id', name: 'X', site: 'Port Klang' }), /Line ID/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Unknown' }), /Choose/);
    assert.throws(() => validateLine({ lineId: 'ABB8', name: 'X', site: 'Port Klang', dashboardUrl: 'javascript:alert(1)' }), /Dashboard URL/);
});

test('registered lines persist and become available for live data without a restart', async () => {
    const rows = DEFAULT_LINES.map((line) => ({ line_id: line.lineId, display_name: line.name, site: line.site, dashboard_url: '' }));
    const pool = {
        async query(sql, params) {
            if (sql.includes('CREATE TABLE')) return { rows: [] };
            if (sql.includes('INSERT INTO production_overview_lines') && sql.includes('ON CONFLICT')) return { rows: [] };
            if (sql.includes('SELECT line_id')) return { rows };
            if (sql.includes('INSERT INTO production_overview_lines')) {
                rows.push({ line_id: params[0], display_name: params[1], site: params[2], dashboard_url: params[3] });
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
});
