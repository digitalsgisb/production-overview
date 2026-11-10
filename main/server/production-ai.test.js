const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const express = require("express");
const { createProductionAi } = require("./production-ai");

function tool(name, args) {
    return { function: { name, arguments: args } };
}

function routed(...calls) {
    return { message: { tool_calls: calls } };
}

async function listen(t, server) {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
    });
    return `http://127.0.0.1:${server.address().port}`;
}

test("production chat validates Ollama tools and renders only saved figures", async (t) => {
    const replies = [];
    const requests = [];
    const ollama = await listen(t, http.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        requests.push({ path: req.url, ...JSON.parse(Buffer.concat(chunks)) });
        const reply = replies.shift();
        if (reply === "timeout") return;
        if (reply === "failure") return res.writeHead(503).end();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(reply ?? {}));
    }));

    const saved = {
        asOf: "2024-03-01T02:00:00.000Z",
        metrics: {
            output: 100, rejects: 5, target: 150, oee: 72.5, attainment: null,
            shiftCount: 2, targetShiftCount: 1, oeeShiftCount: 1,
        },
    };
    const selections = [];
    let snapshot = saved;
    const getSummary = async (selection) => {
        selections.push(selection);
        return snapshot;
    };
    const authUsers = {
        staff: { id: "staff", role: "Operator", sites: ["Sendayan"] },
        admin: { id: "admin", role: "Admin", sites: ["Port Klang", "Sendayan"] },
        guest: { id: "guest", role: "Guest", sites: ["Port Klang", "Sendayan"] },
    };
    const handler = createProductionAi({
        enabled: true, baseUrl: ollama, model: "fixture-model", getSummary,
        now: () => new Date("2024-03-01T02:00:00Z"), timeoutMs: 350,
        log: { error() {} },
    });
    const app = express();
    app.use(express.json());
    app.post("/api/production-ai/chat", (req, res, next) => {
        req.authUser = authUsers[req.get("Authorization")];
        if (!req.authUser) return res.sendStatus(401);
        return next();
    }, handler.chat);
    const endpoint = `${await listen(t, http.createServer(app))}/api/production-ai/chat`;
    async function chat(body, user = "staff") {
        const response = await fetch(endpoint, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: user },
            body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
    }

    await t.test("last month uses server dates and phrases exact data", async () => {
        replies.push(
            routed(tool("get_monthly", { site: "Sendayan", relative: "previous" })),
            { message: { content: JSON.stringify({ sentences: [
                "The recorded output was {{output}} units.",
                "Average shift OEE was {{oee}}%.",
                "Recorded rejects totaled {{rejects}}.",
                "Shifts with targets had a combined target of {{recordedTarget}} units.",
            ] }) } },
        );
        const result = await chat({ message: "How did Sendayan do last month?" });
        assert.equal(result.status, 200);
        assert.match(result.body.answer, /2024-02-01 to 2024-02-29/);
        assert.match(result.body.answer, /The recorded output was 100 units\. Average shift OEE was 72\.5%\./);
        assert.match(result.body.answer, /combined target of 150 units/);
        assert.deepEqual(result.body.source.metrics, saved.metrics);
        assert.equal(requests[0].path, "/api/chat");
        assert.deepEqual(requests[0].tools.map((entry) => entry.function.name), ["get_daily", "get_weekly", "get_monthly", "get_yearly"]);
        assert.equal(requests[1].tools, undefined);
        assert.equal(JSON.parse(requests[1].messages.at(-1).content).metrics.oee, 72.5);

        replies.push(routed(tool("get_yearly", { relative: "current" })), "failure");
        const followUp = await chat({ message: "What about this year?", context: result.body.context });
        assert.equal(followUp.body.source.site, "Sendayan");
        assert.equal(followUp.body.source.through, "2024-03-01");
        assert.match(followUp.body.answer, /Output was 100 units\./);
    });

    await t.test("site access is checked before lookup", async () => {
        const callsBefore = selections.length;
        const requestsBefore = requests.length;
        assert.equal((await chat({ message: "Summarize today" }, "guest")).status, 403);
        assert.equal(requests.length, requestsBefore);
        for (const site of ["Port Klang", "both"]) {
            replies.push(routed(tool("get_daily", { site, relative: "current" })));
            assert.equal((await chat({ message: `Summarize ${site} today` })).status, 403);
        }
        assert.equal(selections.length, callsBefore);

        snapshot = { ...saved, metrics: null };
        replies.push(routed(tool("get_weekly", { relative: "current" })));
        const result = await chat({ message: "Summarize this week" }, "admin");
        assert.equal(result.body.source.site, "both");
        assert.equal(result.body.answer, "No completed shifts recorded.");
        snapshot = saved;
    });

    await t.test("ambiguous, malformed and unsupported calls never reach the database", async () => {
        const before = selections.length;
        const badCalls = [
            [],
            [tool("get_daily", { relative: "current" }), tool("get_monthly", { relative: "current" })],
            [tool("run_sql", { query: "SELECT 1" })],
            [tool("get_daily", { date: "2024-02-30" })],
            [tool("get_daily", { relative: "current", sql: "SELECT 1" })],
            [tool("get_daily", "not an object")],
        ];
        for (const calls of badCalls) {
            replies.push(routed(...calls));
            const result = await chat({ message: "How did Sendayan do?" });
            assert.equal(result.body.needsClarification, true);
        }
        assert.equal(selections.length, before);

        replies.push(routed(tool("get_daily", { relative: "previous" })), { message: { content: '{"sentences":["Output was 999 units."]}' } });
        const result = await chat({ message: "Yesterday", clarification: "How did Sendayan do?" });
        assert.equal(result.body.source.start, "2024-02-29");
        assert.match(result.body.answer, /Output was 100 units\./);
        assert.doesNotMatch(result.body.answer, /999/);
        assert.ok(requests.at(-2).messages.some((message) => message.content === "How did Sendayan do?"));
    });

    await t.test("routing timeout returns a retryable failure", async () => {
        const before = selections.length;
        replies.push("timeout");
        const result = await chat({ message: "Summarize yesterday" });
        assert.equal(result.status, 503);
        assert.match(result.body.message, /Try again/);
        assert.equal(selections.length, before);
    });
});
