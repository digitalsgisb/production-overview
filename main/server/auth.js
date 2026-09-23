const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const ROLES = ["Admin", "Supervisor", "Line Leader", "Operator", "Viewer"];
const STATUSES = ["Active", "Paused"];
const SITES = ["Port Klang", "Sendayan"];
const BCRYPT_ROUNDS = 12;
const GUEST_SETTING_KEY = "guest_access_enabled";

function normalizeSites(sites, role) {
    if (role === "Admin") return [...SITES];

    const values = Array.isArray(sites) ? sites : [];
    const filtered = values.filter((site) => SITES.includes(site));
    return filtered.length > 0 ? [...new Set(filtered)] : [SITES[0]];
}

function toPublicUser(user) {
    return {
        id: String(user.id),
        username: user.username,
        name: user.name,
        role: ROLES.includes(user.role) ? user.role : "Viewer",
        status: user.status === "Paused" ? "Paused" : "Active",
        sites: normalizeSites(user.sites, user.role),
        lastSeen: user.last_seen || null,
    };
}

function validateUsername(value) {
    const username = String(value || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
        throw new Error("Enter a username of 3–32 letters, numbers, dots, dashes or underscores.");
    }
    return username;
}

function validatePassword(value) {
    const password = String(value || "");
    if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
        throw new Error("Password must be 72 bytes or fewer.");
    }
    return password;
}

function createUserId() {
    return `usr_${crypto.randomBytes(13).toString("hex")}`;
}

function createAuthRouter({ pool, hasDatabaseConfig, localAdmin, onGuestAccessChanged = () => {}, onUserChanged = () => {} }) {
    const configuredSecret = String(process.env.JWT_SECRET || "").trim();
    const jwtSecret = configuredSecret || crypto.randomBytes(64).toString("hex");
    let schemaPromise;
    let settingsSchemaPromise;

    if (!configuredSecret) {
        console.warn("JWT_SECRET is not configured; login sessions will be invalidated when the backend restarts.");
    }

    function ensureDatabase(request, response) {
        if (hasDatabaseConfig) return true;
        response.status(503).json({ message: "The user database is not configured on this backend." });
        return false;
    }

    function ensureUserSchema() {
        if (!schemaPromise) {
            schemaPromise = (async () => {
              await pool.query(`
                ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Viewer',
                    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active',
                    ADD COLUMN IF NOT EXISTS sites TEXT[] NOT NULL DEFAULT ARRAY['Port Klang']::TEXT[],
                    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS username TEXT;
                ALTER TABLE users ALTER COLUMN password TYPE TEXT;
              `);
              const result = await pool.query("SELECT id, email, username FROM users ORDER BY id::TEXT");
              const used = new Set(result.rows.filter((row) => row.username).map((row) => row.username.toLowerCase()));
              for (const row of result.rows) {
                  if (row.username) continue;
                  let base = String(row.email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[^a-z0-9]+/, "").slice(0, 32);
                  if (base.length < 3) base = `user-${String(row.id).toLowerCase().replace(/[^a-z0-9]/g, "").slice(-12)}`;
                  let candidate = base;
                  for (let suffix = 2; used.has(candidate); suffix += 1) {
                      const ending = `-${suffix}`;
                      candidate = `${base.slice(0, 32 - ending.length)}${ending}`;
                  }
                  await pool.query("UPDATE users SET username = $1 WHERE id::TEXT = $2 AND username IS NULL", [candidate, String(row.id)]);
                  used.add(candidate);
              }
              await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS production_overview_username_unique ON users (LOWER(username))");
            })().catch((error) => {
                schemaPromise = undefined;
                throw error;
            });
        }
        return schemaPromise;
    }

    function ensureSettingsSchema() {
        if (!settingsSchemaPromise) {
            settingsSchemaPromise = pool.query(`
                CREATE TABLE IF NOT EXISTS production_overview_settings (
                    setting_key VARCHAR(50) PRIMARY KEY,
                    setting_value VARCHAR(20) NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                INSERT INTO production_overview_settings (setting_key, setting_value)
                VALUES ('${GUEST_SETTING_KEY}', 'true')
                ON CONFLICT (setting_key) DO NOTHING;
            `).catch((error) => {
                settingsSchemaPromise = undefined;
                throw error;
            });
        }
        return settingsSchemaPromise;
    }

    async function isGuestAccessEnabled() {
        await ensureSettingsSchema();
        const result = await pool.query(
            "SELECT setting_value FROM production_overview_settings WHERE setting_key = $1",
            [GUEST_SETTING_KEY],
        );
        return result.rows[0]?.setting_value === "true";
    }

    function signToken(user) {
        return jwt.sign(
            { role: user.role },
            jwtSecret,
            { subject: String(user.id), expiresIn: "8h" },
        );
    }

    async function verifySessionToken(token) {
        const claims = jwt.verify(token, jwtSecret);

        if (claims.sub === "guest" && claims.role === "Guest") {
            if (!hasDatabaseConfig || !await isGuestAccessEnabled()) {
                throw new Error("Guest access is disabled.");
            }
            return { id: "guest", role: "Guest", sites: [...SITES] };
        }

        if (claims.sub === "local-admin" && claims.role === "Admin" && localAdmin.enabled) {
            return { id: "local-admin", role: "Admin", sites: [...SITES] };
        }

        if (!hasDatabaseConfig) {
            throw new Error("The user database is not configured.");
        }

        await ensureUserSchema();
        const result = await pool.query(
            "SELECT id, role, status, sites FROM users WHERE id = $1",
            [claims.sub],
        );
        const user = result.rows[0];

        if (!user || user.status !== "Active") {
            throw new Error("Your login is no longer active.");
        }

        return { id: String(user.id), role: user.role, sites: normalizeSites(user.sites, user.role) };
    }

    async function login(request, response) {
        try {
            const username = validateUsername(request.body?.username);
            const password = String(request.body?.password || "");

            if (
                localAdmin.enabled &&
                username === localAdmin.username.toLowerCase() &&
                password === localAdmin.password
            ) {
                const user = {
                    id: "local-admin",
                    username: localAdmin.username,
                    name: localAdmin.name,
                    role: "Admin",
                    status: "Active",
                    sites: [...SITES],
                    last_seen: new Date().toISOString(),
                };
                return response.json({
                    message: "Successful Login",
                    token: signToken(user),
                    user: toPublicUser(user),
                });
            }

            if (!ensureDatabase(request, response)) return;
            await ensureUserSchema();

            const result = await pool.query(`
                SELECT id, username, email, name, password, role, status, sites, last_seen
                FROM users
                WHERE LOWER(username) = $1
            `, [username]);

            if (result.rows.length === 0) {
                return response.status(401).json({ message: "Invalid username or password." });
            }

            const user = result.rows[0];
            if (user.status === "Paused") {
                return response.status(403).json({ message: "This user account is paused. Contact an admin." });
            }

            const hasBcryptPassword = /^\$2[aby]\$\d{2}\$/.test(user.password || "");
            const passwordMatches = hasBcryptPassword
                ? await bcrypt.compare(password, user.password)
                : password === user.password;

            if (!passwordMatches) {
                return response.status(401).json({ message: "Invalid username or password." });
            }

            const passwordHash = hasBcryptPassword
                ? user.password
                : await bcrypt.hash(validatePassword(password), BCRYPT_ROUNDS);
            const updated = await pool.query(`
                UPDATE users
                SET password = $1, last_seen = NOW()
                WHERE id = $2
                RETURNING id, username, email, name, role, status, sites, last_seen
            `, [passwordHash, user.id]);
            const publicUser = toPublicUser(updated.rows[0]);

            return response.json({
                message: "Successful Login",
                token: signToken(publicUser),
                user: publicUser,
            });
        } catch (error) {
            const status = error.message?.startsWith("Enter a valid") ? 400 : 500;
            return response.status(status).json({ message: status === 500 ? "Unable to log in." : error.message });
        }
    }

    async function requireSession(request, response, next) {
        try {
            const authorization = String(request.headers.authorization || "");
            const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

            if (!token) {
                return response.status(401).json({ message: "Sign in is required." });
            }

            const user = await verifySessionToken(token);
            request.authUser = user;
            return next();
        } catch {
            return response.status(401).json({ message: "Your login has expired. Please sign in again." });
        }
    }

    async function requireAdmin(request, response, next) {
        return requireSession(request, response, () => {
            if (request.authUser.role !== "Admin") {
                return response.status(403).json({ message: "Admin access is required." });
            }
            return next();
        });
    }

    async function getPublicSettings(request, response) {
        try {
            if (!hasDatabaseConfig) {
                return response.json({ guestAccessEnabled: false });
            }
            return response.json({ guestAccessEnabled: await isGuestAccessEnabled() });
        } catch (error) {
            console.error("Load public settings failed:", error.message);
            return response.status(500).json({ message: "Unable to load access settings." });
        }
    }

    async function createGuestSession(request, response) {
        try {
            if (!hasDatabaseConfig) {
                return response.status(503).json({ message: "Guest access is unavailable." });
            }
            if (!await isGuestAccessEnabled()) {
                return response.status(403).json({ message: "Guest access is currently disabled." });
            }

            const user = {
                id: "guest",
                username: "guest",
                name: "Guest",
                role: "Guest",
                status: "Active",
                sites: [...SITES],
            };
            return response.json({
                token: signToken(user),
                user,
            });
        } catch (error) {
            console.error("Create guest session failed:", error.message);
            return response.status(500).json({ message: "Unable to start guest access." });
        }
    }

    async function updateGuestAccess(request, response) {
        try {
            if (typeof request.body?.enabled !== "boolean") {
                return response.status(400).json({ message: "Guest access must be enabled or disabled." });
            }

            await ensureSettingsSchema();
            await pool.query(`
                INSERT INTO production_overview_settings (setting_key, setting_value, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (setting_key)
                DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
            `, [GUEST_SETTING_KEY, String(request.body.enabled)]);
            await onGuestAccessChanged(request.body.enabled);

            return response.json({ guestAccessEnabled: request.body.enabled });
        } catch (error) {
            console.error("Update guest access failed:", error.message);
            return response.status(500).json({ message: "Unable to update guest access." });
        }
    }

    async function authenticateSocket(socket, next) {
        try {
            const token = String(socket.handshake.auth?.token || "");
            if (!token) throw new Error("Sign in is required.");

            socket.data.authUser = await verifySessionToken(token);
            return next();
        } catch (error) {
            const authError = new Error(error.message || "Authentication failed.");
            authError.data = { code: "AUTH_REQUIRED" };
            return next(authError);
        }
    }

    async function listUsers(request, response) {
        try {
            await ensureUserSchema();
            const result = await pool.query(`
                SELECT id, username, email, name, role, status, sites, last_seen
                FROM users
                ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, name, username
            `);
            return response.json({ users: result.rows.map(toPublicUser) });
        } catch {
            return response.status(500).json({ message: "Unable to load users." });
        }
    }

    async function createUser(request, response) {
        try {
            await ensureUserSchema();
            const name = String(request.body?.name || "").trim();
            const username = validateUsername(request.body?.username);
            const userId = createUserId();
            const email = `${userId}@users.local`;
            const password = validatePassword(request.body?.password);
            const role = ROLES.includes(request.body?.role) ? request.body.role : "Viewer";
            const sites = normalizeSites(request.body?.sites, role);

            if (!name) {
                return response.status(400).json({ message: "Name is required." });
            }

            const existing = await pool.query(
                "SELECT id FROM users WHERE LOWER(username) = $1",
                [username],
            );
            if (existing.rows.length > 0 || (localAdmin.enabled && username === localAdmin.username.toLowerCase())) {
                return response.status(409).json({ message: "This username is already in use." });
            }

            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const result = await pool.query(`
                INSERT INTO users (id, username, name, email, password, role, status, sites)
                VALUES ($1, $2, $3, $4, $5, $6, 'Active', $7)
                RETURNING id, username, email, name, role, status, sites, last_seen
            `, [userId, username, name, email, passwordHash, role, sites]);

            return response.status(201).json({ user: toPublicUser(result.rows[0]) });
        } catch (error) {
            console.error("Create user failed:", error.message);
            if (error.code === "23505") return response.status(409).json({ message: "This username is already in use." });
            const isValidation = /^(Enter|Password)/.test(error.message || "");
            return response.status(isValidation ? 400 : 500).json({
                message: isValidation ? error.message : "Unable to create the user.",
            });
        }
    }

    async function countOtherActiveAdmins(userId) {
        const result = await pool.query(`
            SELECT COUNT(*)::INTEGER AS count
            FROM users
            WHERE role = 'Admin' AND status = 'Active' AND id::TEXT <> $1
        `, [String(userId)]);
        return result.rows[0].count;
    }

    async function updateUser(request, response) {
        try {
            await ensureUserSchema();
            const userId = String(request.params.userId);
            const current = await pool.query(`
                SELECT id, username, email, name, password, role, status, sites, last_seen
                FROM users WHERE id::TEXT = $1
            `, [userId]);

            if (current.rows.length === 0) {
                return response.status(404).json({ message: "User not found." });
            }

            const existing = current.rows[0];
            const nextRole = request.body?.role === undefined
                ? existing.role
                : request.body.role;
            const nextStatus = request.body?.status === undefined
                ? existing.status
                : request.body.status;

            if (!ROLES.includes(nextRole) || !STATUSES.includes(nextStatus)) {
                return response.status(400).json({ message: "Invalid role or account status." });
            }
            if (
                request.authUser.id === userId &&
                (nextRole !== "Admin" || nextStatus !== "Active")
            ) {
                return response.status(400).json({ message: "You cannot remove your own active admin access." });
            }
            if (
                existing.role === "Admin" &&
                existing.status === "Active" &&
                (nextRole !== "Admin" || nextStatus !== "Active") &&
                await countOtherActiveAdmins(userId) === 0
            ) {
                return response.status(400).json({ message: "At least one active database admin is required." });
            }

            const name = request.body?.name === undefined
                ? existing.name
                : String(request.body.name || "").trim();
            const username = request.body?.username === undefined
                ? existing.username
                : validateUsername(request.body.username);
            const duplicate = await pool.query("SELECT id FROM users WHERE LOWER(username) = $1 AND id::TEXT <> $2", [username, userId]);
            if (duplicate.rows.length || (localAdmin.enabled && username === localAdmin.username.toLowerCase())) {
                return response.status(409).json({ message: "This username is already in use." });
            }
            const sites = normalizeSites(
                request.body?.sites === undefined ? existing.sites : request.body.sites,
                nextRole,
            );
            const passwordHash = request.body?.password
                ? await bcrypt.hash(validatePassword(request.body.password), BCRYPT_ROUNDS)
                : existing.password;

            if (!name) {
                return response.status(400).json({ message: "Name is required." });
            }

            const result = await pool.query(`
                UPDATE users
                SET name = $1, username = $2, password = $3, role = $4, status = $5, sites = $6
                WHERE id::TEXT = $7
                RETURNING id, username, email, name, role, status, sites, last_seen
            `, [name, username, passwordHash, nextRole, nextStatus, sites, userId]);

            onUserChanged(userId);
            return response.json({ user: toPublicUser(result.rows[0]) });
        } catch (error) {
            if (error.code === "23505") return response.status(409).json({ message: "This username is already in use." });
            const isValidation = /^(Enter|Password)/.test(error.message || "");
            return response.status(isValidation ? 400 : 500).json({
                message: isValidation ? error.message : "Unable to update the user.",
            });
        }
    }

    async function removeUser(request, response) {
        try {
            await ensureUserSchema();
            const userId = String(request.params.userId);

            if (request.authUser.id === userId) {
                return response.status(400).json({ message: "You cannot remove your own account." });
            }

            const current = await pool.query(
                "SELECT id, role, status FROM users WHERE id::TEXT = $1",
                [userId],
            );
            if (current.rows.length === 0) {
                return response.status(404).json({ message: "User not found." });
            }
            if (
                current.rows[0].role === "Admin" &&
                current.rows[0].status === "Active" &&
                await countOtherActiveAdmins(userId) === 0
            ) {
                return response.status(400).json({ message: "At least one active database admin is required." });
            }

            await pool.query("DELETE FROM users WHERE id::TEXT = $1", [userId]);
            onUserChanged(userId);
            return response.status(204).end();
        } catch {
            return response.status(500).json({ message: "Unable to remove the user." });
        }
    }

    return {
        authenticateSocket,
        createGuestSession,
        login,
        requireSession,
        requireAdmin,
        getPublicSettings,
        listUsers,
        createUser,
        updateGuestAccess,
        updateUser,
        removeUser,
    };
}

module.exports = {
    createUserId,
    createAuthRouter,
    normalizeSites,
    toPublicUser,
    validatePassword,
};
