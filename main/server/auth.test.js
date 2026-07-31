const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuthRouter, createUserId, normalizeSites, toPublicUser, validatePassword } = require("./auth.js");

process.env.JWT_SECRET ||= "test-only-jwt-secret-for-auth-tests";

function createResponse() {
    return {
        body: null,
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test("new database user IDs fit the existing varchar(30) column", () => {
    const userId = createUserId();

    assert.equal(userId.length, 30);
    assert.match(userId, /^usr_[0-9a-f]{26}$/);
});

test("admins always receive access to every site", () => {
    assert.deepEqual(normalizeSites(["Port Klang"], "Admin"), ["Port Klang", "Sendayan"]);
});

test("non-admin site access is filtered and de-duplicated", () => {
    assert.deepEqual(
        normalizeSites(["Sendayan", "Unknown", "Sendayan"], "Viewer"),
        ["Sendayan"],
    );
});

test("passwords must be at least eight characters", () => {
    assert.throws(() => validatePassword("short"), /at least 8 characters/);
    assert.equal(validatePassword("safe-pass-123"), "safe-pass-123");
});

test("public users never expose a password", () => {
    const user = toPublicUser({
        id: 7,
        email: "admin@example.com",
        name: "Admin",
        password: "secret",
        role: "Admin",
        status: "Active",
        sites: ["Port Klang"],
        last_seen: null,
    });

    assert.equal(user.id, "7");
    assert.equal(user.password, undefined);
    assert.deepEqual(user.sites, ["Port Klang", "Sendayan"]);
});

test("disabled guest access refuses to create a guest session", async () => {
    const pool = {
        async query(sql) {
            if (sql.includes("CREATE TABLE")) return { rows: [] };
            if (sql.includes("SELECT setting_value")) {
                return { rows: [{ setting_value: "false" }] };
            }
            throw new Error(`Unexpected query: ${sql}`);
        },
    };
    const auth = createAuthRouter({
        pool,
        hasDatabaseConfig: true,
        localAdmin: { enabled: false },
    });
    const response = createResponse();

    await auth.createGuestSession({}, response);

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, "Guest access is currently disabled.");
});

test("admin guest toggle persists the setting and triggers revocation", async () => {
    const queries = [];
    let changedTo;
    const pool = {
        async query(sql, params) {
            queries.push({ sql, params });
            return { rows: [] };
        },
    };
    const auth = createAuthRouter({
        pool,
        hasDatabaseConfig: true,
        localAdmin: { enabled: false },
        onGuestAccessChanged: (enabled) => {
            changedTo = enabled;
        },
    });
    const response = createResponse();

    await auth.updateGuestAccess({ body: { enabled: false } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.guestAccessEnabled, false);
    assert.equal(changedTo, false);
    assert.equal(queries.at(-1).params[1], "false");
});
