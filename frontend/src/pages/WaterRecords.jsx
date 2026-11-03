import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  RefreshCw,
  Droplets,
  Trash2,
  Search,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import { apiGet, apiPost, apiDelete } from "../services/api";

const today = () => {
  const date = new Date();
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );
  return localDate.toISOString().slice(0, 10);
};

const createInitialForm = () => ({
  record_date: today(),
  record_type: "collected",
  volume_litres: "",
  location_id: "",
  notes: "",
});

function formatVolume(value) {
  const number = Number(value || 0);

  return Number.isFinite(number)
    ? number.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "0";
}

function formatDate(value) {
  if (!value) return "—";

  const parts = String(value).slice(0, 10).split("-");
  if (parts.length !== 3) return String(value);

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function WaterRecords() {
  const [records, setRecords] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(createInitialForm);
  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load water records and monitoring locations.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [recordsResponse, locationsResponse] = await Promise.all([
        apiGet("/api/water-records"),
        apiGet("/api/locations"),
      ]);

      setRecords(
        Array.isArray(recordsResponse) ? recordsResponse : []
      );

      setLocations(
        Array.isArray(locationsResponse) ? locationsResponse : []
      );
    } catch (err) {
      setError(err.message || "Unable to load water records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  // Save a new water record.
  async function handleSubmit(event) {
    event.preventDefault();
    clearMessages();

    const volume = Number(form.volume_litres);

    if (!form.record_date) {
      setError("Please select the record date.");
      return;
    }

    if (!["collected", "used"].includes(form.record_type)) {
      setError("Please select a valid record type.");
      return;
    }

    if (!Number.isFinite(volume) || volume <= 0) {
      setError("Water volume must be greater than zero.");
      return;
    }

    setSaving(true);

    try {
      await apiPost("/api/water-records", {
        record_date: form.record_date,
        record_type: form.record_type,
        volume_litres: volume,
        location_id: form.location_id || null,
        notes: form.notes.trim(),
      });

      setSuccess("Water record saved successfully.");
      setForm(createInitialForm());

      await loadData();
    } catch (err) {
      setError(err.message || "Could not save the water record.");
    } finally {
      setSaving(false);
    }
  }

  // Delete a selected water record.
  async function handleDelete(record) {
    const confirmed = window.confirm(
      `Delete this ${record.record_type} record of ${formatVolume(
        record.volume_litres
      )} litres? This cannot be undone.`
    );

    if (!confirmed) return;

    clearMessages();
    setDeletingId(record.record_id);

    try {
      await apiDelete(`/api/water-records/${record.record_id}`);

      setRecords((current) =>
        current.filter(
          (item) => item.record_id !== record.record_id
        )
      );

      setSuccess("Water record deleted successfully.");
    } catch (err) {
      setError(err.message || "Could not delete the water record.");
    } finally {
      setDeletingId(null);
    }
  }

  // Apply the selected filters.
  const filteredRecords = records.filter((record) => {
    const matchesType =
      !typeFilter || record.record_type === typeFilter;

    const recordDate = String(record.record_date || "").slice(0, 10);

    const matchesFrom = !fromDate || recordDate >= fromDate;
    const matchesTo = !toDate || recordDate <= toDate;

    return matchesType && matchesFrom && matchesTo;
  });

  const collectedTotal = filteredRecords
    .filter((record) => record.record_type === "collected")
    .reduce(
      (sum, record) => sum + Number(record.volume_litres || 0),
      0
    );

  const usedTotal = filteredRecords
    .filter((record) => record.record_type === "used")
    .reduce(
      (sum, record) => sum + Number(record.volume_litres || 0),
      0
    );

  function resetFilters() {
    setTypeFilter("");
    setFromDate("");
    setToDate("");
  }

  return (
    <div className="water-records-page">
      <div className="page-intro water-records-heading">
        <div>
          <span className="water-eyebrow">WATER MANAGEMENT</span>
          <h1>Water Records</h1>
          <p>
            Record and monitor collected rainwater and water usage.
          </p>
        </div>

        <button
          type="button"
          className="water-secondary-button"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={loading ? "water-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {error && (
        <div className="water-message water-message-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="water-message water-message-success" role="status">
          <CheckCircle2 size={18} />
          <span>{success}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setSuccess("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="water-stats-grid">
        <section className="water-stat-card">
          <div className="water-stat-icon water-icon-blue">
            <Droplets size={21} />
          </div>
          <div>
            <p>Total records</p>
            <h2>{filteredRecords.length.toLocaleString()}</h2>
            <span>Matching current filters</span>
          </div>
        </section>

        <section className="water-stat-card">
          <div className="water-stat-icon water-icon-green">
            <ArrowDownToLine size={21} />
          </div>
          <div>
            <p>Water collected</p>
            <h2>{formatVolume(collectedTotal)} L</h2>
            <span>Recorded collection volume</span>
          </div>
        </section>

        <section className="water-stat-card">
          <div className="water-stat-icon water-icon-orange">
            <ArrowUpFromLine size={21} />
          </div>
          <div>
            <p>Water used</p>
            <h2>{formatVolume(usedTotal)} L</h2>
            <span>Recorded usage volume</span>
          </div>
        </section>
      </div>

      <section className="panel water-form-panel">
        <div className="water-section-heading">
          <div>
            <h3>Add Water Record</h3>
            <p className="panel-subtitle">
              Enter the details of a collection or usage event.
            </p>
          </div>
          <span className="water-required-label">* Required fields</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="water-form-grid">
            <label className="water-field">
              <span>Record date *</span>
              <input
                type="date"
                name="record_date"
                value={form.record_date}
                onChange={updateField}
                required
                disabled={saving}
              />
            </label>

            <label className="water-field">
              <span>Record type *</span>
              <select
                name="record_type"
                value={form.record_type}
                onChange={updateField}
                required
                disabled={saving}
              >
                <option value="collected">Water collected</option>
                <option value="used">Water used</option>
              </select>
            </label>

            <label className="water-field">
              <span>Water volume (litres) *</span>
              <input
                type="number"
                name="volume_litres"
                value={form.volume_litres}
                onChange={updateField}
                min="0.01"
                step="0.01"
                placeholder="e.g. 250"
                required
                disabled={saving}
              />
            </label>

            <label className="water-field">
              <span>Monitoring location</span>
              <select
                name="location_id"
                value={form.location_id}
                onChange={updateField}
                disabled={saving}
              >
                <option value="">No location selected</option>
                {locations.map((location) => (
                  <option
                    key={location.location_id}
                    value={location.location_id}
                  >
                    {location.station_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="water-field water-field-full">
              <span>Notes (optional)</span>
              <textarea
                name="notes"
                value={form.notes}
                onChange={updateField}
                rows="3"
                maxLength="5000"
                placeholder="Add relevant details about this record..."
                disabled={saving}
              />
            </label>
          </div>

          <div className="water-form-actions">
            <button
              type="button"
              className="water-secondary-button"
              onClick={() => {
                setForm(createInitialForm());
                clearMessages();
              }}
              disabled={saving}
            >
              Clear form
            </button>

            <button
              type="submit"
              className="water-primary-button"
              disabled={saving}
            >
              <Plus size={17} />
              {saving ? "Saving..." : "Save water record"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel water-table-panel">
        <div className="water-section-heading">
          <div>
            <h3>Water Record History</h3>
            <p className="panel-subtitle">
              Review saved records and filter by type or date.
            </p>
          </div>
          <span className="water-record-count">
            {filteredRecords.length} records
          </span>
        </div>

        <div className="water-filters">
          <label className="water-filter-field">
            <span>Record type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All types</option>
              <option value="collected">Collected</option>
              <option value="used">Used</option>
            </select>
          </label>

          <label className="water-filter-field">
            <span>From date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>

          <label className="water-filter-field">
            <span>To date</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="water-clear-filters"
            onClick={resetFilters}
          >
            <Search size={15} />
            Clear filters
          </button>
        </div>

        {loading ? (
          <div className="water-empty-state" role="status">
            <RefreshCw size={25} className="water-spin" />
            <p>Loading water records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="water-empty-state">
            <div className="water-empty-icon">
              <Droplets size={27} />
            </div>
            <h4>
              {records.length === 0
                ? "No water records yet"
                : "No matching records"}
            </h4>
            <p>
              {records.length === 0
                ? "Add your first record using the form above. Only records you save will appear here."
                : "Try changing your filters to see other records."}
            </p>
          </div>
        ) : (
          <div className="table-wrap water-table-wrap">
            <table className="water-records-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Volume</th>
                  <th>Location</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.record_id}>
                    <td>{formatDate(record.record_date)}</td>
                    <td>
                      <span
                        className={`water-type-badge ${
                          record.record_type === "collected"
                            ? "water-type-collected"
                            : "water-type-used"
                        }`}
                      >
                        {record.record_type === "collected"
                          ? "Collected"
                          : "Used"}
                      </span>
                    </td>
                    <td className="water-volume-cell">
                      {formatVolume(record.volume_litres)} L
                    </td>
                    <td>{record.station_name || "Not specified"}</td>
                    <td className="water-notes-cell">
                      {record.notes || "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="water-delete-button"
                        title="Delete record"
                        aria-label={`Delete record ${record.record_id}`}
                        disabled={deletingId === record.record_id}
                        onClick={() => handleDelete(record)}
                      >
                        <Trash2 size={16} />
                        <span>
                          {deletingId === record.record_id
                            ? "Deleting..."
                            : "Delete"}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}