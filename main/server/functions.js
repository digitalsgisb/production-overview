const express = require('express');
const { Pool } = require('pg');
const { ProductionLine } = require('./class');
require('dotenv').config();

const pool = new Pool ({
    host:process.env.DB_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASS,
    database:process.env.DB_DB,
    port:Number(process.env.DB_PORT)
})

async function getSession(subject){
    const now = new Date();
    const date = now.toLocaleDateString('en-GB');
    const time = now.toLocaleTimeString('en-GB');

    let result = await pool.query(
        `
        INSERT INTO session(line_id, start_time,date)
        VALUES ($1,$2,$3) RETURNING session_id
        `,[subject, time, date]
    )

    let session_id = result.rows[0].session_id
    //set into the object directly, same with runtime, hehe
    await pool.query(
    `
    INSERT INTO reject(session_id, product_reject)
    VALUES ($1, 0)
    `,
    [session_id]
);

    return session_id;
}

async function getRuntime(subject){
    let result = await pool.query(
        `
        INSERT INTO runtime (session_id)
        VALUES ($1) RETURNING runtime_id
        `,[subject]
    )
    let runtime_id = result.rows[0].runtime_id
    
    return runtime_id;
}

async function getStaffByRole(session_id, role){
    const result = await pool.query (
        `SELECT name from staff_session 
        where session_id = $1 and role = $2`,[session_id,role]
    )
    return result.rows.map(row => row.name);
}// need to use like : const supervisors = await getStaffByRole(session_id, 'supervisor'); then just insert into constructor

async function updateMode(subject,subject_sessionId){
    let result = await pool.query (
        `UPDATE session 
        SET mode = $1
        WHERE session_id = $2`,[subject,subject_sessionId]
    )
}
async function insertStaffSession(session_id, role, names){
    const staffNames = Array.isArray(names) ? names : [names];
    for (const name of staffNames){
        if (!name) continue;

        await pool.query(
            `
            INSERT into staff_session(session_id, name, role)
            VALUES ($1,$2,$3)
            `,[session_id,name,role]
        );
    }
}
async function InsertExistingSession(subject,session_id,productionLines){ //subject - line_id, 
        let temp = await pool.query(
            `
            SELECT 
                start_time,
                product_count,
                product_reject,
                mode,
                hourly_output,
                oee,
                standard_cycle_time,
                performance_pct,
                availability_pct,
                quality_pct
            FROM session
            WHERE session_id = $1
            `,[session_id]
        )
        let start_time = temp.rows[0].start_time;
        let product_count = temp.rows[0].product_count;
        let product_reject = temp.rows[0].product_reject;
        let mode = temp.rows[0].mode;
        let hourly_output = temp.rows[0].hourly_output;
        let oee = temp.rows[0].oee;
        let standard_cycle_time = temp.rows[0].standard_cycle_time;
        let performance_pct = temp.rows[0].performance_pct;
        let availability_pct = temp.rows[0].availability_pct;
        let quality_pct = temp.rows[0].quality_pct;
        const supervisors = await getStaffByRole(session_id,'supervisor');
        const lineleaders = await getStaffByRole(session_id,'lineLeaders')
        const waterjet = await getStaffByRole(session_id,'waterjetOperators');
        const assembly = await getStaffByRole(session_id,'assemblyOperators');
        const forming = await getStaffByRole(session_id, 'formingOperators');
        const quality = await getStaffByRole(session_id, 'qualityOperators');

        let temp2 = await pool.query(
            `SELECT runtime_id, current_mode from runtime where session_id = $1`,[session_id]
        )
        let runtime_id = temp2.rows[0].runtime_id;
        let current_mode = temp2.rows[0].current_mode;

        const line = productionLines.get(subject)

        line.insertIntoLine(
            session_id,
            start_time,
            product_count,
            product_reject,
            mode || current_mode,
            hourly_output,
            oee,
            standard_cycle_time,
            runtime_id,
            performance_pct,
            availability_pct,
            quality_pct
        )
        line.setOperators('supervisor', supervisors);
        line.setOperators('waterjet', waterjet);
        line.setOperators('assembly', assembly);
        line.setOperators('forming', forming);
        line.setOperators('quality', quality);
    }
module.exports = { updateMode,insertStaffSession,getSession, getRuntime, getStaffByRole, InsertExistingSession, pool };
