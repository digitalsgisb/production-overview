const { malaysiaDay, resolvePeriod, PERIODS, PRODUCTION_SITES } = require("./production-periods");

const TOOLS = PERIODS.map((period) => ({
    type: "function",
    function: {
        name: `get_${period}`,
        description: `Look up the ${period} production summary for a single period.`,
        parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
                site: { type: "string", enum: [...PRODUCTION_SITES, "both"], description: "Omit when the user does not specify a site." },
                relative: { type: "string", enum: ["current", "previous"] },
                date: { type: "string", description: "An ISO YYYY-MM-DD date in the requested period. Use either date or relative." },
            },
        },
    },
}));

const CLARIFY = "Which day, week, month, or year should I summarize? You can also name a site.";
const MODEL_UNAVAILABLE = "Production AI couldn’t reach its language model. Try again in a moment.";
const numberFormat = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 1 });
const WORDING = {
    output: ["Output was {{output}} units.", "The recorded output was {{output}} units."],
    rejects: ["There were {{rejects}} recorded rejects.", "Recorded rejects totaled {{rejects}}."],
    target: ["The target was {{target}} units.", "The production target was {{target}} units."],
    recordedTarget: ["The recorded target was {{recordedTarget}} units.", "Shifts with targets had a combined target of {{recordedTarget}} units."],
    oee: ["Average shift OEE was {{oee}}%.", "Shifts with OEE readings averaged {{oee}}%."],
    attainment: ["Output reached {{attainment}}% of target.", "Target attainment was {{attainment}}%."],
};

function authorizedSite(site, sites) {
    return site === "both" ? PRODUCTION_SITES.every((name) => sites.includes(name)) : sites.includes(site);
}

function previousSelection(context, sites, today) {
    if (!context || !PERIODS.includes(context.period) || !authorizedSite(context.site, sites)) return null;
    const dates = resolvePeriod(context.period, { date: context.start }, today);
    return dates?.start === context.start ? { period: context.period, start: dates.start, site: context.site } : null;
}

function resolveTool(call, previous, sites, today) {
    const name = call?.function?.name;
    const period = PERIODS.find((kind) => name === `get_${kind}`);
    const args = call?.function?.arguments;
    if (!period || !args || typeof args !== "object" || Array.isArray(args)
        || Object.keys(args).some((key) => !["site", "relative", "date"].includes(key))) return null;
    const site = args.site === undefined ? previous?.site ?? (sites.length === 1 ? sites[0] : "both") : args.site;
    if (!PRODUCTION_SITES.includes(site) && site !== "both") return null;
    if (!authorizedSite(site, sites)) return { forbidden: true };

    const inheritDate = args.date === undefined && args.relative === undefined && previous?.period === period;
    const dates = resolvePeriod(period, { date: inheritDate ? previous.start : args.date, relative: args.relative }, today);
    return dates && { ...dates, period, site };
}

function summaryWording(metrics) {
    const values = {
        output: metrics.output,
        rejects: metrics.rejects,
        [metrics.targetShiftCount === metrics.shiftCount ? "target" : "recordedTarget"]: metrics.target,
        oee: metrics.oee,
        attainment: metrics.attainment,
    };
    return Object.entries(values)
        .filter(([, value]) => Number.isFinite(value))
        .map(([key, value]) => ({ key, value: numberFormat.format(value), choices: WORDING[key] }));
}

function renderWording(content, wording) {
    const fallback = () => wording.map(({ key, value, choices }) => choices[0].replace(`{{${key}}}`, value)).join(" ");
    if (!content) return fallback();
    try {
        const { sentences } = JSON.parse(content);
        if (!Array.isArray(sentences) || sentences.length !== wording.length) return fallback();
        const unused = new Map(wording.flatMap((entry) => entry.choices.map((choice) => [choice, entry])));
        const rendered = [];
        for (const sentence of sentences) {
            const entry = unused.get(sentence);
            if (!entry) return fallback();
            entry.choices.forEach((choice) => unused.delete(choice));
            rendered.push(sentence.replace(`{{${entry.key}}}`, entry.value));
        }
        return rendered.join(" ");
    } catch {
        return fallback();
    }
}

function createProductionAi({
    enabled, baseUrl, model, getSummary, now = () => new Date(), timeoutMs = 25000, log = console,
}) {
    const activeUsers = new Set();
    let chatUrl;
    if (baseUrl) {
        try {
            const url = new URL(baseUrl);
            if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
                chatUrl = new URL("/api/chat", url);
            }
        } catch {
            if (enabled) log.error("Production AI has an invalid Ollama URL.");
        }
    }

    async function askOllama(messages, options, signal) {
        if (!model || !chatUrl) throw new Error("Ollama is not configured");
        const result = await fetch(chatUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0, num_predict: 512 }, ...options }),
            redirect: "error",
            signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
        if (!result.ok) throw new Error(`Ollama HTTP ${result.status}`);
        const { message } = await result.json();
        if (!message || typeof message !== "object") throw new Error("Invalid Ollama response");
        return message;
    }

    async function chat(req, res) {
        res.set("Cache-Control", "no-store");
        const user = req.authUser;
        if (user.role === "Guest") return res.status(403).json({ message: "Staff sign-in is required." });
        if (!enabled) return res.status(503).json({ message: "Production AI is disabled." });
        const question = typeof req.body?.message === "string" ? req.body.message.trim() : "";
        if (!question || question.length > 600) {
            return res.status(400).json({ message: "Enter a question of 1 to 600 characters." });
        }
        if (activeUsers.has(user.id) || activeUsers.size >= 2) {
            return res.status(429).json({ message: "Production AI is busy. Try again in a moment." });
        }

        activeUsers.add(user.id);
        const controller = new AbortController();
        const abort = () => controller.abort();
        res.once("close", abort);
        try {
            const today = malaysiaDay(now());
            const sites = PRODUCTION_SITES.filter((site) => user.sites.includes(site));
            if (!sites.length) return res.status(403).json({ message: "You don’t have access to any production sites." });
            const previous = previousSelection(req.body.context, sites, today);
            const clarification = typeof req.body.clarification === "string" ? req.body.clarification.trim().slice(0, 600) : "";
            const messages = [
                { role: "system", content: [
                    "Route production summary questions to exactly one provided tool. Do not answer with data.",
                    "Use relative current or previous for this or last period. For specific periods use an ISO anchor date.",
                    "Only set site when explicitly named. For follow-ups, the server can reuse the previous site or same-period date.",
                    "If no single period can be determined, call no tools.",
                    `Today in Malaysia is ${today}. Previous selection: ${JSON.stringify(previous)}.`,
                ].join(" ") },
                ...(clarification ? [{ role: "user", content: clarification }, { role: "assistant", content: CLARIFY }] : []),
                { role: "user", content: question },
            ];
            let routed;
            try {
                routed = await askOllama(messages, { tools: TOOLS }, controller.signal);
            } catch (error) {
                if (controller.signal.aborted) return;
                log.error("Production AI routing failed:", error.message);
                return res.status(503).json({ message: MODEL_UNAVAILABLE });
            }
            const calls = routed.tool_calls;
            const selection = Array.isArray(calls) && calls.length === 1 ? resolveTool(calls[0], previous, sites, today) : null;
            if (!selection) return res.json({ answer: CLARIFY, needsClarification: true });
            if (selection.forbidden) return res.status(403).json({ message: "You don’t have access to that site scope." });

            const snapshot = await getSummary(selection);
            if (controller.signal.aborted) return;
            if (!snapshot) return res.status(503).json({ message: "The production summaries are being prepared. Try again shortly." });
            const { period, start, end, through, site } = selection;
            const source = { period, start, end, through, site, asOf: snapshot.asOf, metrics: snapshot.metrics };
            const context = { period, start, site };
            if (!snapshot.metrics) return res.json({ answer: "No completed shifts recorded.", context, source });

            const wording = summaryWording(snapshot.metrics);
            let content;
            if (wording.length) {
                try {
                    const phrased = await askOllama([
                        { role: "system", content: [
                            "Phrase the production summary by selecting exactly one sentence per available metric.",
                            "Use the provided sentences verbatim, including their placeholders. Order them for readability.",
                            JSON.stringify(wording.map(({ key, choices }) => ({ metric: key, choices }))),
                        ].join(" ") },
                        { role: "user", content: "Summarize the saved production report." },
                        { role: "assistant", content: "", tool_calls: [{
                            function: { name: `get_${period}`, arguments: { date: start, site } },
                        }] },
                        { role: "tool", tool_name: `get_${period}`, content: JSON.stringify(source) },
                    ], {
                        format: {
                            type: "object",
                            required: ["sentences"],
                            properties: { sentences: { type: "array", items: { type: "string", enum: wording.flatMap(({ choices }) => choices) } } },
                        },
                    }, controller.signal);
                    content = phrased.content;
                } catch (error) {
                    if (controller.signal.aborted) return;
                    log.error("Production AI wording failed:", error.message);
                }
            }
            const label = site === "both" ? "Port Klang and Sendayan" : site;
            const range = start === through ? start : `${start} to ${through}`;
            const details = renderWording(content, wording) || "There are no recorded metrics for the completed shifts.";
            return res.json({ answer: `For ${label} (${range}): ${details}`, context, source });
        } catch (error) {
            if (controller.signal.aborted) return;
            log.error("Production AI summary failed:", error.message);
            return res.status(503).json({ message: "Saved production summaries are unavailable. Try again in a moment." });
        } finally {
            res.removeListener("close", abort);
            activeUsers.delete(user.id);
        }
    }

    return { chat };
}

module.exports = { createProductionAi };
