const express = require('express');
const { updateMode,getSession, getRuntime, insertStaffSession} = require('./functions.js');
const { ProductionLine } = require('./class.js');
const http = require('http');
const { Server } = require('socket.io');
const cors = require("cors");
// const bcrypt = require("bcrypt");
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3200;
const configuredOrigins = (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
const allowedOrigins = Array.from(new Set([
  "https://productionoverview.sugidigital.org",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...configuredOrigins,
]));

function resolveCorsOrigin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
}

app.use(cors({
  origin: resolveCorsOrigin,
}));

const io = new Server(server, {
  cors: {
    origin: resolveCorsOrigin,
  },
});

const pool = new Pool ({
    host:process.env.DB_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASS,
    database:process.env.DB_DB,
    port:Number(process.env.DB_PORT)
})
const hasDatabaseConfig = Boolean(
    process.env.DB_HOST &&
    process.env.DB_USER &&
    process.env.DB_PASS &&
    process.env.DB_DB &&
    process.env.DB_PORT
);
const localAdmin = {
    enabled: process.env.ENABLE_LOCAL_ADMIN === "true",
    email: process.env.LOCAL_ADMIN_EMAIL || "admin@local.test",
    password: process.env.LOCAL_ADMIN_PASSWORD || "admin123",
    name: process.env.LOCAL_ADMIN_NAME || "Local Admin",
};

const Existing_ID = ['ABB4', 'ABB1', 'ABB7','ABB2','SDY1','SDY2'];
const productionLines = new Map();

Existing_ID.forEach(id => {
    productionLines.set(id, new ProductionLine(id));
});

// function emitLineUpdate(line_id) {
//     const line = productionLines.get(line_id);
//     if (!line) return;

//     io.to(line_id).emit('line:update', {
//         line_id,
//         line
//     });
// }

function emitLineData(socket,line_id){
    const line = productionLines.get(line_id);
    if (!line) return;

    socket.emit("line:data", {
        line_id, 
        line
    })
}
function emitLineChanges(line_id, changes){
    io.to(line_id).emit("line:update", {
        line_id, 
        changes
    })
}

function normalizeLineMode(mode) {
    const key = String(mode || "offline").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const modeMap = {
        run: "normal",
        running: "normal",
        normal: "normal",
        rest: "rest",
        downtime: "downtime",
        down: "downtime",
        planned_stop: "planned_stop",
        maintenance: "planned_stop",
        model_change: "model_change",
        idle: "idle",
        offline: "offline",
    };

    return modeMap[key] || key;
}
// async function testConnection() {
//     try {
//         const client = await pool.connect();
//         console.log("Connected to PostgreSQL!");
//         client.release();
//     } catch (err) {
//         console.error("Connection failed:");
//         console.error(err.message);
//     } finally {
//         await pool.end();
//     }
// }

io.on('connection', (socket) => {
    console.log('React connected:', socket.id);

    socket.on('join-line', (line_id) => {
        socket.join(line_id);
        emitLineData(socket,line_id);
    });
});

app.post("/login", async(req,res) =>{
    try {
        const { email, password } = req.body;
        const normalizedEmail = String(email || "").trim().toLowerCase();

        if (
            localAdmin.enabled &&
            normalizedEmail === localAdmin.email.toLowerCase() &&
            password === localAdmin.password
        ) {
            return res.json({
                message: "Successful Login",
                user: {
                    id: "local-admin",
                    email: localAdmin.email,
                    name: localAdmin.name,
                },
            });
        }

        if (!hasDatabaseConfig) {
            return res.status(503).json({
                message: "Database is not configured locally. Use local admin access or add server .env DB settings.",
            });
        }

        const result = await pool.query(
            `
            SELECT * FROM users WHERE email = $1
            `
            ,[email]
        );

        if (result.rows.length === 0){
            return res.status(401).json({ message: "not found"});
        }

        const user = result.rows[0];

        if (password !== user.password) {
            return res.status(401).json({ message: "wrong password" });
        }

        res.json({
            message: "Successful Login",
            // token: "test-token",
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });
        // const user = result.rows[0];
        // const passwordMatch = await bcrypt.compare(password, user.password);
        
        // if (!passwordMatch){
        //     return res.status(401).json({ message: "Invalid email or password"});
        // }

        // const token = jwt.sign(
        //     {
        //     id: user.id,
        //     email:user.email,
        //     },
        //     process.env.JWT_SECRET,
        //     { expiresIn: "1h"}
        // );

        // res.json({
        //     message: "Successful Login",
        //     token,
        //     user: {
        //         id: user.id,
        //         email: user.email,
        //     },
        // });
    } catch(error){

        return res.status(500).json({ message: error.message});
    }
});

//
// FROM NODE RED TO NODE JS
//
const API_KEY = process.env.API_KEY;

app.use((req, res, next) => {
    const key = req.headers['x-api-key'];

    if (!API_KEY) {
        return res.status(503).json({ success: false, error: 'API key is not configured on the backend' });
    }

    if (key !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    next();
});

app.post('/start-session-', async (req, res) => {
    const { line_id, start_time } = req.body;
    const {
        supervisor,
        lineLeaders,
        waterjetOperators,
        formingOperators,
        assemblyOperators,
        qualityOperators
    } = req.body;

    const line = productionLines.get(line_id);
    if (!line) {
        return console.log(`Unknwon line_id ${line_id}`) 
    }

    let session_id, runtime_id;

    try {
        session_id = await getSession(line_id);
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message});
    }

    try {
        runtime_id = await getRuntime(session_id);
    } catch (err) {
        return res.status(400).json({ success: false, error: 'failed to fetch runtime_id' });
    }

    line.setOperators('supervisor', supervisor);
    line.setOperators('lineLeader', lineLeaders);
    line.setOperators('waterjet', waterjetOperators);
    line.setOperators('forming', formingOperators);
    line.setOperators('assembly', assemblyOperators);
    line.setOperators('quality', qualityOperators);

    await insertStaffSession(session_id, "supervisor", supervisor);
    await insertStaffSession(session_id, "lineLeaders", lineLeaders);
    await insertStaffSession(session_id, "waterjetOperators", waterjetOperators);
    await insertStaffSession(session_id, "formingOperators", formingOperators);
    await insertStaffSession(session_id, "assemblyOperators", assemblyOperators);
    await insertStaffSession(session_id, "qualityOperators", qualityOperators);
    
    line.mode = "normal";
    await updateMode(line.mode,session_id);

    line.session_id = session_id;
    line.runtime_id = runtime_id;
    line.start_time = start_time;
    

    // emitLineUpdate(line_id);
    emitLineChanges(line_id, {
    operators: line.operators,
    session_id: line.session_id,
    runtime_id: line.runtime_id,
    start_time: line.start_time,
    mode: line.mode
});

    return res.json({ success: true, line });
});

app.post('/update_product_count', async (req, res) => {
    const data = req.body;
    const line_id = data.line_id;
    const productCount = Number(data.product_count) || 0;
    const hasMetric = (key) => data[key] !== undefined && data[key] !== null && data[key] !== "";
    const oee = hasMetric("oee") ? Number(data.oee) || 0 : null;
    const availability_pct = hasMetric("availability_pct") || hasMetric("availability_pctm")
        ? Number(data.availability_pct ?? data.availability_pctm) || 0
        : null;
    const quality_pct = hasMetric("quality_pct") ? Number(data.quality_pct) || 0 : null;
    const performance_pct = hasMetric("performance_pct") ? Number(data.performance_pct) || 0 : null;

    const line = productionLines.get(line_id);

    if (!line) {
        return res.status(400).json({ success: false, error: `Unknown line_id ${line_id}` });
    }

    const session_id = line.session_id;

    if (!session_id) {
        return res.status(400).json({ success: false, error: 'No active session for this line' });
    }

    try {
        await pool.query(
            `
            UPDATE session
            SET 
                product_count = $1,
                oee = COALESCE($2, oee),
                availability_pct = COALESCE($3, availability_pct),
                quality_pct = COALESCE($4, quality_pct),
                performance_pct = COALESCE($5, performance_pct)
            WHERE session_id = $6
            `,
            [productCount, oee, availability_pct, quality_pct, performance_pct, session_id]
        );

        line.product_count = productCount;
        if (oee !== null) line.oee = oee;
        if (availability_pct !== null) {
            line.availability_pct = availability_pct;
            line.availability_pctm = availability_pct;
        }
        if (quality_pct !== null) line.quality_pct = quality_pct;
        if (performance_pct !== null) line.performance_pct = performance_pct;

        emitLineChanges(line_id, {
            product_count: line.product_count,
            oee: line.oee,
            availability_pct: line.availability_pct,
            availability_pctm: line.availability_pctm,
            quality_pct: line.quality_pct,
            performance_pct: line.performance_pct,
        });

        return res.json({ success: true, session_id, line });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
    }
});
app.post('/oee_update', async (req,res) => {
    const data = req.body;
    const line_id = data.line_id;
    const oee = Number(data.oee) || 0;
    const quality_pct = Number(data.quality_pct) || 0;
    const performance_pct = Number(data.performance_pct) || 0;
    const availability_pct = Number(data.availability_pct ?? data.availability_pctm) || 0;

    const line = productionLines.get(line_id);

    if (!line) {
        return res.status(400).json({ success: false, error: `Unknown line_id ${line_id}` });
    }

    const session_id = line.session_id;

    if (!session_id) {
        return res.status(400).json({ success: false, error: 'No active session for this line' });
    }

    try {
        await pool.query(
            `
            UPDATE session
            SET 
                oee = $1,
                availability_pct = $2,
                quality_pct = $3,
                performance_pct = $4
            WHERE session_id = $5
            `,
            [oee, availability_pct, quality_pct, performance_pct, session_id]
        );

        line.oee = oee;
        line.performance_pct = performance_pct;
        line.availability_pct = availability_pct;
        line.availability_pctm = availability_pct;
        line.quality_pct = quality_pct;

        emitLineChanges(line_id, {
            oee: line.oee,
            performance_pct: line.performance_pct,
            availability_pct: line.availability_pct,
            availability_pctm: line.availability_pctm,
            quality_pct: line.quality_pct,
        });

        return res.json({ success: true, session_id, line });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/update_reject', async (req, res) => {
    const data = req.body;
    let reject_count = Number(data.reject_count) || 0;
    const line = productionLines.get(data.line_id);
    let rejectType = null;

    if (!line) {
        return res.status(400).json({ success: false, error: `Unknown line_id ${data.line_id}` });
    }

    const session_id = line.session_id;
    if (!session_id) {
        return res.status(400).json({ success: false, error: 'No active session for this line' });
    }

    if (data.totalSlabReject > 0 || data.totalReturnRoll > 0){
        reject_count = reject_count + 1;
        rejectType = "before"
    }
    if (data.totalRejectNG > 0 || data.totalLoftLayerReject > 0){
        reject_count = (Number(data.totalRejectNG) || 0 ) + (Number(data.totalLoftLayerReject) || 0 );
        rejectType = "after"
    }

    try {
        
        await pool.query(`
            UPDATE reject 
            SET product_reject = product_reject + $1
            WHERE session_id = $2
        `, [reject_count, session_id]);

        line.product_reject = (Number(line.product_reject) || 0) + reject_count;
        // emitLineUpdate(data.line_id);
        emitLineChanges(data.line_id, {
    product_reject: line.product_reject
});

        if (rejectType === 'after'){
    await pool.query(
        `
        INSERT INTO reject_log (
            session_id,
            total_slab_reject,
            slab_reject_code,
            total_return_roll,
            oht_number,
            total_reject_ng,
            ng_reject_code,
            total_loft_layer_reject,
            loft_layer_reject_code,
            remarks,
            created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        `,
        [
            session_id,
            0,
            "",
            0,
            "",
            Number(data.totalRejectNG) || 0,
            data.ngRejectCode || "",
            Number(data.totalLoftLayerReject) || 0,
            data.loftLayerRejectCode || "",
            data.remarks || ""
        ]
    );
}
else if (rejectType === 'before'){
    await pool.query(
        `
        INSERT INTO reject_log (
            session_id,
            total_slab_reject,
            slab_reject_code,
            total_return_roll,
            oht_number,
            total_reject_ng,
            ng_reject_code,
            total_loft_layer_reject,
            loft_layer_reject_code,
            remarks,
            created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        `,
        [
            session_id,
            Number(data.totalSlabReject) || 0,
            data.slabRejectCode || "",
            Number(data.totalReturnRoll) || 0,
            data.ohtNumber || "",
            0,
            "",
            0,
            "",
            data.remarks || ""
        ]
    );
}
        return res.json({ success: true, session_id, line });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// app.post('/reject_log', async (req, res) => {
//     const data = req.body;
//     const line_id = data.line_id;
//     const line = productionLines.get(line_id);

//     if (!line) {
//         return res.status(400).json({ success: false, error: `Unknown line_id ${line_id}` });
//     }

//     const session_id = line.session_id;
//     if (!session_id) {
//         return res.status(400).json({ success: false, error: 'No active session for this line' });
//     }

//     try {
//         await pool.query(`
//             INSERT INTO reject_log (
//                 session_id,
//                 total_slab_reject,
//                 slab_reject_code,
//                 total_return_roll,
//                 oht_number,
//                 total_reject_ng,
//                 ng_reject_code,
//                 total_loft_layer_reject,
//                 loft_layer_reject_code,
//                 remarks,
//                 created_at
//             )
//             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
//         `, [
//             session_id,
//             data.totalSlabReject,
//             data.slabRejectCode,
//             data.totalReturnRoll,
//             data.ohtNumber,
//             data.totalRejectNG,
//             data.ngRejectCode,
//             data.totalLoftLayerReject,
//             data.loftLayerRejectCode,
//             data.remarks
//         ]);

//         line.last_reject_log = data;
//         emitLineUpdate(line_id);

//         res.json({ success: true, session_id, line });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ success: false, error: err.message });
//     }
// });

app.post('/machine_mode', async (req, res) => {
    const { line_id } = req.body;
    const machine_mode = normalizeLineMode(req.body.machine_mode || req.body.mode);
    const line = productionLines.get(line_id);

    if (!line) {
        return res.status(400).json({ success: false, error: `Unknown line_id ${line_id}` });
    }

    const session_id = line.session_id;
    if (!session_id) {
        return res.status(400).json({ success: false, error: 'No active session for this line' });  
    }

    try {
        await pool.query(`
            UPDATE session
            SET mode = $1
            WHERE session_id = $2
        `, [machine_mode, session_id]);

        line.machine_mode = machine_mode;
        // emitLineUpdate(line_id);
        line.mode = machine_mode;

        emitLineChanges(line_id, {
    mode: line.mode
});

        return res.json({ success: true, session_id, line });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'failed to fetch/change mode' });
    }
});

app.post('/setupModel', async(req,res) =>{
    const { line_id } = req.body;
    const line = productionLines.get(line_id);
    const data = req.body;

    if (!line) {
        return res.status(400).json({ success: false, error: `Unknown line_id ${line_id}` });
    }

    const session_id = line.session_id;
    if (!session_id) {
        return res.status(400).json({ success: false, error: 'No active session for this line' });
    }

    try {
        await pool.query(`
                INSERT INTO session_model (session_id, model, lot_number, standard_cycle, pcs_hr, std_slab_width
                ,std_slab_length, hourly_plan, model_changed, change_type, timestamp)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            `,[session_id, data.model, data.lot_number, data.standard_cycle, data.pcs_hr, data.std_slab_width, data.std_slab_length, data.hourly_plan, data.model_changed, data.change_type, data.timestamp ]
        )
        line.model = data.model;
        line.hourly_plan = data.hourly_plan; //later take a look at the constructor, add target

        emitLineChanges(line_id, {
    model: line.model,
    target: line.hourly_plan,
});
    return res.json({ success: true, session_id, line });

    }catch(err){
        return res.status(500).json({ success: false, error: 'failed to setup model' });
    }
});

app.post('/downtime_log', async (req, res) => {
    const data = req.body;
    const line_id = data.line_id;
    const line = productionLines.get(line_id);

    if (!line) {
        return res.status(400).json({ success: false, error: `Unknown line_id ${line_id}` });
    }

    const session_id = line.session_id;
    if (!session_id) {
        return res.status(400).json({ success: false, error: 'No active session for this line' });
    }

    try {
        await pool.query(`
            INSERT INTO downtime_log (
                session_id,
                category,
                code,
                duration_minutes,
                description,
                action_taken,
                remarks,
                created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
        `, [
            session_id,
            data.category,
            data.code,
            data.durationMinutes,
            data.description,
            data.actionTaken,
            data.remarks
        ]);

        line.last_downtime_log = data;
        // emitLineUpdate(line_id);
        emitLineChanges(line_id, {
    last_downtime_log: line.last_downtime_log
});

        return res.json({ success: true, session_id, line });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/endShift', async (req,res) => {
    const data = req.body;
    const line = productionLines.get(data.line_id);
    const session_id = line.session_id;
    try {
        await pool.query(
            `
            UPDATE session
            SET end_time = $1
            WHERE session_id = $2
            `,[data.timestamp,session_id]
        )
        line.resetValue();

        // emitLineUpdate(data.line_id);
        line.resetValue();

emitLineChanges(data.line_id, {
    session_id: line.session_id,
    start_time: line.start_time,
    operators: line.operators,
    product_count: line.product_count,
    product_reject: line.product_reject,
    mode: line.mode,
    hourly_output: line.hourly_output,
    oee: line.oee,
    availability_pct: line.availability_pct,
    availability_pctm: line.availability_pctm,
    performance_pct: line.performance_pct,
    quality_pct: line.quality_pct,
    standard_cycle_time: line.standard_cycle_time,
    end_time: line.end_time,
    target: line.hourly_plan,
});
        return res.json({ success: true, line });
    } catch(err){
        return res.status(500).json({ success: false, error: err.message });
    }
})

app.get('/line/:line_id', (req, res) => {
    const { line_id } = req.params;
    const line = productionLines.get(line_id);

    if (!line) {
        return res.status(404).json({ success: false, error: `Unknown line_id ${line_id}` });
    }

    return res.json({ success: true, line_id, line });
});

//testing connection
app.post('/testtry', async (req, res) => {
    const { line_id, name } = req.body;

    console.log(`the line is ${line_id} and the name is ${name}`);

    try {await pool.query(`
        INSERT INTO test(name, line)
        VALUES ($1, $2)
        `,[name,line_id])
    } catch (err){
         return res.status(500).json({ success: false, error: err.message });
    }
    return res.json({ success: true });
});


server.listen(PORT, () => console.log(`API + WebSocket listening on port ${PORT}`));
