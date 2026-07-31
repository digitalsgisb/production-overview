const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSites, toPublicUser, validatePassword } = require("./auth.js");

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
