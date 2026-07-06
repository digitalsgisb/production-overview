const express = require('express');
const { getSession, getRuntime} = require('./functions.js');
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

app.use(cors({
  origin: "https://productionoverview.sugidigital.org",
}));

const io = new Server(server, {
  cors: {
    origin: "https://productionoverview.sugidigital.org",
  },
});

const API_KEY = process.env['API_KEY'];

app.use((req, res, next) => {
    const key = req.headers['x-api-key'];

    if (key != API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    next();
});

app.post('/testtry', (req,res) =>{
    const { line_id, name } = req.body;

    console.log(`the line is ${line_id} and the name is ${name}`)
})