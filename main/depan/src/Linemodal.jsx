import "./LineModal.css";

const ROLE_LABELS = {
  supervisor: "Supervisor",
  lineLeaders: "Line Leaders",
  waterjetOperators: "Waterjet Operators",
  formingOperators: "Forming Operators",
  assemblyOperators: "Assembly Operators",
  qualityOperators: "Quality Operators",
};

function Row({ label, value }) {
  return (
    <div className="modal-row">
      <span className="modal-row-label">{label}</span>
      <span className="modal-row-value">{value ?? "—"}</span>
    </div>
  );
}

function fmtTime(t) {
  if (!t) return "—";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString();
}

export default function LineModal({ line, onClose }) {
  if (!line) return null;

  const operators = line.operators || {};
  const isRunning = line.mode === "running";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />

        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">LINE</div>
            <div className="modal-title">{line.line_id}</div>
          </div>
          <span className={`modal-status-pill status-${line.mode || "offline"}`}>
            <span className="modal-status-dot" />
            {(line.mode || "offline").toUpperCase()}
          </span>
        </div>

        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="modal-section">
          <div className="modal-section-title">Session</div>
          <Row label="Session ID" value={line.session_id} />
          <Row label="Runtime ID" value={line.runtime_id} />
          <Row label="Start Time" value={fmtTime(line.start_time)} />
          <Row label="End Time" value={fmtTime(line.end_time)} />
          <Row label="Machine Mode" value={line.machine_mode} />
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Output</div>
          <Row label="Product Count" value={line.product_count} />
          <Row label="Product Reject" value={line.product_reject} />
          <Row label="Hourly Output" value={line.hourly_output} />
          <Row label="OEE" value={line.oee != null ? `${line.oee}%` : null} />
          <Row label="Std. Cycle Time" value={line.standard_cycle_time} />
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Operators</div>
          {Object.entries(ROLE_LABELS).map(([key, label]) => {
            const names = operators[key];
            const list = Array.isArray(names) ? names : names ? [names] : [];
            return (
              <div className="modal-row" key={key}>
                <span className="modal-row-label">{label}</span>
                <span className="modal-row-value">
                  {list.length > 0 ? list.join(", ") : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {line.last_reject_log && (
          <div className="modal-section">
            <div className="modal-section-title">Last Reject Log</div>
            <Row label="Total Slab Reject" value={line.last_reject_log.totalSlabReject} />
            <Row label="Slab Reject Code" value={line.last_reject_log.slabRejectCode} />
            <Row label="Total Return Roll" value={line.last_reject_log.totalReturnRoll} />
            <Row label="OHT Number" value={line.last_reject_log.ohtNumber} />
            <Row label="Total Reject (NG)" value={line.last_reject_log.totalRejectNG} />
            <Row label="NG Reject Code" value={line.last_reject_log.ngRejectCode} />
            <Row label="Remarks" value={line.last_reject_log.remarks} />
          </div>
        )}

        {line.last_downtime_log && (
          <div className="modal-section">
            <div className="modal-section-title">Last Downtime Log</div>
            <Row label="Category" value={line.last_downtime_log.category} />
            <Row label="Code" value={line.last_downtime_log.code} />
            <Row label="Duration (min)" value={line.last_downtime_log.durationMinutes} />
            <Row label="Description" value={line.last_downtime_log.description} />
            <Row label="Action Taken" value={line.last_downtime_log.actionTaken} />
            <Row label="Remarks" value={line.last_downtime_log.remarks} />
          </div>
        )}

        {!isRunning && (
          <div className="modal-offline-note">No active session on this line.</div>
        )}
      </div>
    </div>
  );
}