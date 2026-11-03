import { useState } from "react";
import { apiGet } from "../services/api";

export default function Reports() {
  const [year, setYear] = useState("2018");
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  async function generateReport(event) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setError("");
    setGenerated(false);

    const selectedYear = year.trim();

    if (selectedYear && !/^\d{4}$/.test(selectedYear)) {
      setError("Please enter a valid four-digit year.");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();

      if (selectedYear) {
        params.set("year", selectedYear);
      }

      // api.js already provides the backend base URL.
      const query = params.toString();
      const data = await apiGet(
        `/api/rainfall${query ? `?${query}` : ""}`
      );

      const reportRows = Array.isArray(data) ? data : [];

      setRows(reportRows);
      setGenerated(true);
      setMessage(
        `Loaded ${reportRows.length.toLocaleString()} rainfall records.`
      );
    } catch (err) {
      setRows([]);
      setError(err.message || "Unable to generate the rainfall report.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!rows.length) {
      setError("Generate a report with records before exporting.");
      return;
    }

    const columns = [
      "rainfall_id",
      "location_id",
      "year",
      "month",
      "rainfall_mm",
    ];

    function escapeCsv(value) {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    }

    const csv = [
      columns.join(","),
      ...rows.map((row) =>
        columns.map((column) => escapeCsv(row[column])).join(",")
      ),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `rainfall-report-${year.trim() || "all-years"}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setError("");
    setMessage("CSV report exported successfully.");
  }

  const totalRainfall = rows.reduce(
    (total, row) => total + Number(row.rainfall_mm || 0),
    0
  );

  const averageRainfall =
    rows.length > 0 ? totalRainfall / rows.length : 0;

  return (
    <div className="reports-page">
      <div className="page-intro">
        <h1>Reports</h1>
        <p>
          Generate and export reports using rainfall data available in
          your database.
        </p>
      </div>

      <section className="panel">
        <h3>Rainfall Report</h3>

        <p className="panel-subtitle">
          Select a year to retrieve rainfall records from the backend.
          Leave the year empty to retrieve all available records.
        </p>

        <form onSubmit={generateReport}>
          <div className="filters">
            <input
              className="filter-control"
              type="number"
              min="1900"
              max="2100"
              aria-label="Report year"
              placeholder="Enter year"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />

            <button
              className="primary-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Loading..." : "Generate Report"}
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={exportCsv}
              disabled={loading || rows.length === 0}
            >
              Export CSV
            </button>
          </div>
        </form>

        {message && (
          <div className="notice success" role="status">
            {message}
          </div>
        )}

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
      </section>

      {generated && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Records</div>
            <div className="stat-value">
              {rows.length.toLocaleString()}
            </div>
            <div className="stat-note">Returned rainfall records</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Rainfall</div>
            <div className="stat-value">
              {totalRainfall.toLocaleString("en-US", {
                maximumFractionDigits: 2,
              })}{" "}
              mm
            </div>
            <div className="stat-note">
              Sum of returned rainfall values
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Average Record Value</div>
            <div className="stat-value">
              {averageRainfall.toLocaleString("en-US", {
                maximumFractionDigits: 2,
              })}{" "}
              mm
            </div>
            <div className="stat-note">
              Average per returned database record
            </div>
          </div>
        </div>
      )}

      <section className="panel">
        <div className="panel-heading">
          <h3>Report Preview</h3>
          <span className="topbar-badge">
            {rows.length.toLocaleString()} records
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            Generating rainfall report...
          </div>
        ) : rows.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Location ID</th>
                    <th>Year</th>
                    <th>Month</th>
                    <th>Rainfall (mm)</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={row.rainfall_id}>
                      <td>{row.rainfall_id}</td>
                      <td>{row.location_id}</td>
                      <td>{row.year}</td>
                      <td>{row.month}</td>
                      <td>{row.rainfall_mm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length > 100 && (
              <p className="panel-subtitle">
                Preview displays the first 100 records. CSV export
                includes all {rows.length.toLocaleString()} returned
                records.
              </p>
            )}
          </>
        ) : (
          <div className="empty-state">
            {generated
              ? "No rainfall records were found for the selected year."
              : "Generate a report to see matching rainfall records."}
          </div>
        )}
      </section>

      <p className="panel-subtitle">
        Report values are calculated from the records returned by the
        database. Total rainfall is the sum of those records, not a
        national average or a location-independent rainfall measurement.
      </p>
    </div>
  );
}