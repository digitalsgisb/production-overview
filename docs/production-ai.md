# Production AI on the AI PC

Production AI uses PostgreSQL summaries of completed shifts. Ollama chooses one summary and phrases the reply. The app inserts the exact figures and shows the saved period, site, refresh time, and metric coverage in a source card.

## Enable the feature

1. Start with `PRODUCTION_AI_ENABLED=false` in `main/server/.env`. Configure `OLLAMA_MODEL` with the exact name of an installed model that supports tool calling. Run `ollama list` on the AI PC to see installed model names.
2. For Compose with Ollama running on the host, set `OLLAMA_BASE_URL=http://host.docker.internal:11434`. The supplied Compose file maps that name to the host gateway. The Ollama listener must be reachable from that gateway. Keep its listener on a private interface or restrict host firewall access to the app’s Docker network. For a backend running directly on the AI PC, use `http://127.0.0.1:11434`. Keep Ollama outside the public app tunnel.
3. With the feature still disabled, test a real tool call from the rebuilt app container. Use the same Compose flags as your deployment. This example uses the bundled PostgreSQL service.

   ```bash
   docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml exec -T app node - <<'NODE'
   const url = new URL('/api/chat', process.env.OLLAMA_BASE_URL);
   const tool = { type: 'function', function: {
     name: 'get_weekly',
     description: 'Get one weekly production summary.',
     parameters: { type: 'object', properties: {
       relative: { type: 'string', enum: ['current', 'previous'] }
     }, required: ['relative'] }
   }};
   fetch(url, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ model: process.env.OLLAMA_MODEL, stream: false,
       messages: [{ role: 'user', content: 'Use get_weekly to look up last week.' }],
       tools: [tool] }),
     signal: AbortSignal.timeout(25000)
   }).then(async response => {
     if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
     const { message } = await response.json();
     const calls = message?.tool_calls ?? [];
     if (calls.length !== 1 || calls[0].function?.name !== 'get_weekly'
       || calls[0].function.arguments?.relative !== 'previous') {
       throw new Error('Expected one get_weekly call for the previous week.');
     }
     console.log('Ollama tool call passed.');
   }).catch(error => { console.error(error.message); process.exitCode = 1; });
   NODE
   ```

4. Validate the database and reconcile sample totals on a restored copy before enabling production access. See the backfill steps below. The app’s database user needs permission to add nullable analytics columns to `session` and create two summary tables on first use. Set `PRODUCTION_AI_ENABLED=true` and recreate the app container. Signed-in staff should see **Production AI** in the sidebar or mobile More menu. Verify one daily and one yearly question, then verify a site-restricted account cannot request the other site.
5. To turn the feature off, set `PRODUCTION_AI_ENABLED=false` and recreate the app. The database keeps the saved analytics data. Shifts started while the feature is off need verified backfill if you want them included later.

## Production figures

- Send optional `shift_target_units` to `POST /start-session-` as the planned total whole units for the shift. Omit it when there is no known shift target. The existing `hourly_plan` continues to drive the live dashboard. A partial target is labeled **Recorded target**, and period attainment requires complete output and target coverage plus a positive target.
- The shift’s start day, site, and eligibility are recorded at shift start. Days use Malaysia time and weeks start on Monday. The analytics job refreshes after shifts close, at startup, and every five minutes. Check the source card’s refresh time and the app logs if a recently closed shift is absent.
- Output is the stored session count. Rejects use the shift accumulator in `reject`. OEE is the mean of the latest recorded OEE for each shift with a reading. For new shifts, send `oee` or `oee_pct`, or send all three OEE components in the same update so the backend can record the derived OEE. A reported zero counts as a reading.

## Optional historical backfill

On a restored copy of the AI PC database, confirm `session` has a unique session ID, a production start date, a completion time, and numeric output and OEE fields. Confirm `reject` has one accumulator per session. Compare sampled stored dates to known Malaysia shift dates, including a date after the twelfth day of a month. The importer accepts ISO dates and day-first `DD/MM/YYYY` text. Legacy zero OEE is treated as unavailable because older data cannot distinguish a real zero from the default. Historical shift targets and historical line eligibility are unavailable for imported rows.

Make a JSON file from verified line-to-site records. Supply inclusive date bounds if a line has moved. Leave unverified lines or time ranges out of the file.

```json
[
  { "lineId": "VERIFIED-LINE-ID", "site": "Port Klang", "from": "2025-01-01", "through": "2025-12-31" }
]
```

Run from `main/server` with the intended database’s `DB_*` settings loaded. For Docker, run inside the app container with the mapping file available there. Review the candidate, invalid-date, and unmapped counts before applying.

```bash
node backfill-production-summaries.js /path/to/verified-mapping.json
node backfill-production-summaries.js /path/to/verified-mapping.json --apply
```

The next refresh incorporates the imported rows. Compare saved output, rejects, and average shift OEE for sampled periods against the source rows on the restored database before applying the same reviewed mapping to production.
