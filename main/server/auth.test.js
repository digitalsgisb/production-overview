const test = require("node:test");
const assert = require("node:assert/strict");
const { createUserId, normalizeSites, toPublicUser, validatePassword } = require("./auth.js");

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
