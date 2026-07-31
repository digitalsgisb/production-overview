const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const ROLES = ["Admin", "Supervisor", "Line Leader", "Operator", "Viewer"];
const STATUSES = ["Active", "Paused"];
const SITES = ["Port Klang", "Sendayan"];
const BCRYPT_ROUNDS = 12;

function normalizeSites(sites, role) {
    if (role === "Admin") return [...SITES];

    const values = Array.isArray(sites) ? sites : [];
    const filtered = values.filter((site) => SITES.includes(site));
    return filtered.length > 0 ? [...new Set(filtered)] : [SITES[0]];
}

function toPublicUser(user) {
    return {
        id: String(user.id),
        email: user.email,
        name: user.name,
        role: ROLES.includes(user.role) ? user.role : "Viewer",
        status: user.status === "Paused" ? "Paused" : "Active",
        sites: normalizeSites(user.sites, user.role),
        lastSeen: user.last_seen || null,
    };
}

function validateEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address.");
    }
    return email;
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

function createAuthRouter({ pool, hasDatabaseConfig, localAdmin }) {
    const configuredSecret = String(process.env.JWT_SECRET || "").trim();
    const jwtSecret = configuredSecret || crypto.randomBytes(64).toString("hex");
    let schemaPromise;

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
            schemaPromise = pool.query(`
                ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Viewer',
                    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active',
                    ADD COLUMN IF NOT EXISTS sites TEXT[] NOT NULL DEFAULT ARRAY['Port Klang']::TEXT[],
                    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
                ALTER TABLE users ALTER COLUMN password TYPE TEXT;
            `).catch((error) => {
                schemaPromise = undefined;
                throw error;
            });
        }
        return schemaPromise;
    }

    function signToken(user) {
        return jwt.sign(
            { role: user.role, email: user.email },
            jwtSecret,
            { subject: String(user.id), expiresIn: "8h" },
        );
    }

    async function login(request, response) {
        try {
            const email = validateEmail(request.body?.email);
            const password = String(request.body?.password || "");

            if (
                localAdmin.enabled &&
                email === localAdmin.email.toLowerCase() &&
                password === localAdmin.password
            ) {
                const user = {
                    id: "local-admin",
                    email: localAdmin.email,
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
                SELECT id, email, name, password, role, status, sites, last_seen
                FROM users
                WHERE LOWER(email) = $1
            `, [email]);

            if (result.rows.length === 0) {
                return response.status(401).json({ message: "Invalid email or password." });
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
                return response.status(401).json({ message: "Invalid email or password." });
            }

            const passwordHash = hasBcryptPassword
                ? user.password
                : await bcrypt.hash(validatePassword(password), BCRYPT_ROUNDS);
            const updated = await pool.query(`
                UPDATE users
                SET password = $1, last_seen = NOW()
                WHERE id = $2
                RETURNING id, email, name, role, status, sites, last_seen
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

    async function requireAdmin(request, response, next) {
        try {
            const authorization = String(request.headers.authorization || "");
            const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

            if (!token) {
                return response.status(401).json({ message: "Sign in is required." });
            }

            const claims = jwt.verify(token, jwtSecret);
            if (claims.sub === "local-admin" && claims.role === "Admin" && localAdmin.enabled) {
                request.authUser = { id: "local-admin", role: "Admin" };
                return next();
            }

            if (!ensureDatabase(request, response)) return;
            await ensureUserSchema();
            const result = await pool.query(
                "SELECT id, role, status FROM users WHERE id = $1",
                [claims.sub],
            );
            const user = result.rows[0];

            if (!user || user.status !== "Active") {
                return response.status(401).json({ message: "Your login is no longer active." });
            }
            if (user.role !== "Admin") {
                return response.status(403).json({ message: "Admin access is required." });
            }

            request.authUser = { id: String(user.id), role: user.role };
            return next();
        } catch {
            return response.status(401).json({ message: "Your login has expired. Please sign in again." });
        }
    }

    async function listUsers(request, response) {
        try {
            await ensureUserSchema();
            const result = await pool.query(`
                SELECT id, email, name, role, status, sites, last_seen
                FROM users
                ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, name, email
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
            const email = validateEmail(request.body?.email);
            const password = validatePassword(request.body?.password);
            const role = ROLES.includes(request.body?.role) ? request.body.role : "Viewer";
            const sites = normalizeSites(request.body?.sites, role);

            if (!name) {
                return response.status(400).json({ message: "Name is required." });
            }

            const existing = await pool.query(
                "SELECT id FROM users WHERE LOWER(email) = $1",
                [email],
            );
            if (existing.rows.length > 0) {
                return response.status(409).json({ message: "A user with this email already exists." });
            }

            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const userId = createUserId();
            const result = await pool.query(`
                INSERT INTO users (id, name, email, password, role, status, sites)
                VALUES ($1, $2, $3, $4, $5, 'Active', $6)
                RETURNING id, email, name, role, status, sites, last_seen
            `, [userId, name, email, passwordHash, role, sites]);

            return response.status(201).json({ user: toPublicUser(result.rows[0]) });
        } catch (error) {
            console.error("Create user failed:", error.message);
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
                SELECT id, email, name, password, role, status, sites, last_seen
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
            const email = request.body?.email === undefined
                ? existing.email
                : validateEmail(request.body.email);
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
                SET name = $1, email = $2, password = $3, role = $4, status = $5, sites = $6
                WHERE id::TEXT = $7
                RETURNING id, email, name, role, status, sites, last_seen
            `, [name, email, passwordHash, nextRole, nextStatus, sites, userId]);

            return response.json({ user: toPublicUser(result.rows[0]) });
        } catch (error) {
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
            return response.status(204).end();
        } catch {
            return response.status(500).json({ message: "Unable to remove the user." });
        }
    }

    return {
        login,
        requireAdmin,
        listUsers,
        createUser,
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
