import { useEffect, useRef, useState } from "react";
import "./production-ai.css";

const examples = [
  "How did production do yesterday?",
  "Summarize last week’s production.",
  "How are we doing this month?",
  "Give me this year’s production summary.",
];
const numberFormat = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  dateStyle: "medium",
  timeStyle: "short",
});

function Metric({ label, value, count, total, unit = "" }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value == null ? "Unavailable" : `${numberFormat.format(value)}${unit}`}</dd>
      {count < total && <small>{count} of {total} shifts recorded</small>}
    </div>
  );
}

function SummarySource({ source }) {
  const { start, end, through, site, asOf, metrics, period } = source;
  const siteName = site === "both" ? "Port Klang and Sendayan" : site;
  const firstDay = dayFormat.format(new Date(`${start}T00:00:00Z`));
  const lastDay = dayFormat.format(new Date(`${through}T00:00:00Z`));
  const shifts = metrics?.shiftCount ?? 0;
  const cutoff = timeFormat.format(new Date(asOf));

  return (
    <section className="production-ai__source" aria-label="Saved production summary">
      <p className="production-ai__source-label">Saved {period} summary</p>
      <h3>{siteName}</h3>
      <p>
        {start === through ? firstDay : `${firstDay} – ${lastDay}`}
        {through !== end && " · To date"}
      </p>
      <p className="production-ai__coverage">{shifts} completed {shifts === 1 ? "shift" : "shifts"} · As of {cutoff} MYT</p>
      {metrics && (
        <dl>
          <Metric label="Output" value={metrics.output} count={metrics.outputShiftCount} total={shifts} />
          <Metric label="Rejects" value={metrics.rejects} count={metrics.rejectShiftCount} total={shifts} />
          <Metric label={metrics.targetShiftCount > 0 && metrics.targetShiftCount < shifts ? "Recorded target" : "Target"} value={metrics.target} count={metrics.targetShiftCount} total={shifts} />
          <Metric label="Average shift OEE" value={metrics.oee} count={metrics.oeeShiftCount} total={shifts} unit="%" />
          {metrics.attainment != null && <Metric label="Target attainment" value={metrics.attainment} count={shifts} total={shifts} unit="%" />}
        </dl>
      )}
      {metrics?.legacyShiftCount > 0 && (
        <p className="production-ai__coverage">Historical line state is unavailable for {metrics.legacyShiftCount} {metrics.legacyShiftCount === 1 ? "shift" : "shifts"}.</p>
      )}
    </section>
  );
}

export default function ProductionAi({ request }) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState([]);
  const [context, setContext] = useState(null);
  const [clarification, setClarification] = useState("");
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef(null);
  const input = useRef(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function send(text) {
    const message = text.trim();
    if (!message || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setDraft("");
    setBusy(true);
    setTurns((current) => [...current, { message }]);

    let reply;
    try {
      reply = await request("/api/production-ai/chat", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ message, context, clarification }),
      });
    } catch (error) {
      reply = { answer: error.message || "Production AI is unavailable. Try again in a moment.", error: true };
    }
    if (activeRequest.current !== controller || controller.signal.aborted) return;
    activeRequest.current = null;
    if (reply.context) setContext(reply.context);
    if (!reply.error) setClarification(reply.needsClarification ? message : "");
    setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { ...turn, ...reply } : turn));
    setBusy(false);
  }

  function newChat() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setDraft("");
    setTurns([]);
    setContext(null);
    setClarification("");
    setBusy(false);
    input.current?.focus();
  }

  return (
    <section className="production-ai" aria-labelledby="production-ai-heading">
      <header className="production-ai__header">
        <div>
          <p>Production analytics</p>
          <h1 id="production-ai-heading">Production AI</h1>
          <p>Ask about completed shifts by day, week, month, or year.</p>
        </div>
        <button type="button" onClick={newChat}>New chat</button>
      </header>

      {turns.length === 0 && (
        <div className="production-ai__examples" aria-label="Example questions">
          {examples.map((question) => <button type="button" key={question} onClick={() => send(question)}>{question}</button>)}
        </div>
      )}
      <div className="production-ai__conversation" role="log" aria-label="Conversation">
        {turns.map((turn, index) => (
          <div className="production-ai__turn" key={index}>
            <p className="production-ai__question"><strong>You</strong>{turn.message}</p>
            {turn.answer && (
              <div className="production-ai__reply">
                <p><strong>Production AI</strong>{turn.answer}</p>
                {turn.source && <SummarySource source={turn.source} />}
                {turn.error && index === turns.length - 1 && !busy && (
                  <button type="button" onClick={() => send(turn.message)}>Retry question</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {busy && <p className="production-ai__waiting" role="status">Looking up the saved summary…</p>}
      <form className="production-ai__form" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
        <label htmlFor="production-ai-question">Ask about production</label>
        <div>
          <input id="production-ai-question" ref={input} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={600} placeholder="How did we do last month?" required />
          <button type="submit" disabled={busy || !draft.trim()}>Send</button>
        </div>
      </form>
    </section>
  );
}
