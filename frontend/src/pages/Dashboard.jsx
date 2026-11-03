import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Building2,
  CloudRain,
  Database,
  RefreshCw,
  Droplets,
  Activity,
  ArrowUpRight,
  Map,
  AlertCircle,
  House,
  ClipboardList,
  TrendingUp,
  Waves,
} from "lucide-react";
import { apiGet } from "../services/api";

const formatNumber = (value, decimals = 0) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
};

export default function Dashboard() {
  const [summary, setSummary] = useState({});
  const [locations, setLocations] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [rainfall, setRainfall] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        summaryResponse,
        locationResponse,
        provinceResponse,
        rainfallResponse,
      ] = await Promise.all([
        apiGet("/api/dashboard/summary"),
        apiGet("/api/locations"),
        apiGet("/api/provinces"),
        apiGet("/api/rainfall?year=2018"),
      ]);

      const rawSummary = Array.isArray(summaryResponse)
        ? summaryResponse[0] || {}
        : summaryResponse || {};

      setSummary({
        provinces: rawSummary.provinces ?? 0,
        districts: rawSummary.districts ?? 0,
        locations: rawSummary.locations ?? 0,
        rainfall_records: rawSummary.rainfall_records ?? 0,
        years_available: rawSummary.years_available ?? 0,
        user_roofs: rawSummary.user_roofs ?? 0,
        user_water_records: rawSummary.user_water_records ?? 0,
        total_collected_litres:
          rawSummary.total_collected_litres ?? 0,
        total_used_litres: rawSummary.total_used_litres ?? 0,
      });

      setLocations(
        Array.isArray(locationResponse) ? locationResponse : []
      );

      setProvinces(
        Array.isArray(provinceResponse) ? provinceResponse : []
      );

      setRainfall(
        Array.isArray(rainfallResponse) ? rainfallResponse : []
      );
    } catch (err) {
      setError(
        err.message || "Unable to load dashboard information."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const rainfallStats = useMemo(() => {
    const values = rainfall
      .map((record) => Number(record.rainfall_mm))
      .filter((value) => Number.isFinite(value));

    const total = values.reduce((sum, value) => sum + value, 0);
    const average = values.length ? total / values.length : 0;

    return {
      total,
      average,
      validRows: values.length,
    };
  }, [rainfall]);

  const systemCards = [
    {
      label: "Provinces",
      value: summary.provinces,
      note: "Provinces in database",
      icon: Map,
      color: "teal",
    },
    {
      label: "Districts",
      value: summary.districts,
      note: "Districts in database",
      icon: Building2,
      color: "blue",
    },
    {
      label: "Monitoring Stations",
      value: summary.locations,
      note: "Registered locations",
      icon: MapPin,
      color: "orange",
    },
    {
      label: "Rainfall Records",
      value: summary.rainfall_records,
      note: "Stored monthly records",
      icon: Database,
      color: "purple",
    },
  ];

  const userCards = [
    {
      label: "My Roofs",
      value: summary.user_roofs,
      note: "Saved roof profiles",
      icon: House,
      color: "teal",
    },
    {
      label: "My Water Records",
      value: summary.user_water_records,
      note: "Collection and usage entries",
      icon: ClipboardList,
      color: "blue",
    },
    {
      label: "Total Collected",
      value: `${formatNumber(summary.total_collected_litres, 2)} L`,
      note: "Water collected by your account",
      icon: TrendingUp,
      color: "orange",
    },
    {
      label: "Total Used",
      value: `${formatNumber(summary.total_used_litres, 2)} L`,
      note: "Water used by your account",
      icon: Waves,
      color: "purple",
    },
  ];

  return (
    <div className="dashboard-page">
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-content">
          <div className="dashboard-eyebrow">
            <Droplets size={16} />
            RAINWATER MANAGEMENT SYSTEM
          </div>

          <h1>Dashboard Overview</h1>

          <p>
            Explore rainfall records, monitoring stations, geographic
            coverage, and your personal rainwater collection and usage
            information.
          </p>

          <div className="dashboard-welcome-meta">
            <span>
              <Activity size={15} />
              {loading ? "Updating data..." : "Database overview"}
            </span>

            <span>
              <CloudRain size={15} />
              Rainfall snapshot: 2018
            </span>
          </div>
        </div>

        <div className="dashboard-welcome-icon" aria-hidden="true">
          <CloudRain size={76} strokeWidth={1.2} />
          <Droplets size={32} strokeWidth={1.5} />
        </div>
      </section>

      <div className="dashboard-toolbar">
        <div>
          <h2>System Statistics</h2>
          <p>Summary of records currently stored in the system.</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadDashboard}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={loading ? "refresh-spinning" : ""}
          />
          {loading ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {error && (
        <div className="notice error" role="alert">
          <AlertCircle
            size={19}
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginRight: 8,
            }}
          />

          <strong>Unable to load dashboard data.</strong>
          <p>{error}</p>
          <p>
            Check that MySQL and the backend server are running and
            that your login session is valid.
          </p>

          <button
            type="button"
            className="secondary-button"
            onClick={loadDashboard}
            disabled={loading}
          >
            Try Again
          </button>
        </div>
      )}

      <section aria-label="System statistics">
        <div className="dashboard-toolbar">
          <div>
            <h2>National Data Overview</h2>
            <p>Reference data available in the project database.</p>
          </div>
        </div>

        <section className="stats-grid">
          {systemCards.map((card) => {
            const Icon = card.icon;

            return (
              <article className="stat-card" key={card.label}>
                <div className="stat-card-top">
                  <div className={`stat-icon ${card.color}`}>
                    <Icon size={22} />
                  </div>

                  <span className="stat-card-indicator">
                    <ArrowUpRight size={15} />
                  </span>
                </div>

                <p className="stat-label">{card.label}</p>

                <h2 className="stat-value">
                  {loading ? "—" : formatNumber(card.value)}
                </h2>

                <p className="stat-note">{card.note}</p>
              </article>
            );
          })}
        </section>
      </section>

      <section aria-label="Personal statistics">
        <div className="dashboard-toolbar">
          <div>
            <h2>My Rainwater Information</h2>
            <p>
              Roof and water-record statistics for your logged-in account.
            </p>
          </div>
        </div>

        <section className="stats-grid">
          {userCards.map((card) => {
            const Icon = card.icon;

            return (
              <article className="stat-card" key={card.label}>
                <div className="stat-card-top">
                  <div className={`stat-icon ${card.color}`}>
                    <Icon size={22} />
                  </div>

                  <span className="stat-card-indicator">
                    <ArrowUpRight size={15} />
                  </span>
                </div>

                <p className="stat-label">{card.label}</p>

                <h2 className="stat-value">
                  {loading
                    ? "—"
                    : typeof card.value === "number"
                      ? formatNumber(card.value)
                      : card.value}
                </h2>

                <p className="stat-note">{card.note}</p>
              </article>
            );
          })}
        </section>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>
                <CloudRain
                  size={19}
                  style={{
                    display: "inline",
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                />
                Rainfall Data Snapshot
              </h3>

              <p className="panel-subtitle">
                Summary of rainfall records returned for 2018.
              </p>
            </div>

            <span className="topbar-badge">2018</span>
          </div>

          <div className="snapshot-grid">
            <div className="snapshot-card">
              <div className="snapshot-card-icon">
                <Droplets size={20} />
              </div>

              <p>Sum of returned values</p>

              <h2>
                {loading
                  ? "—"
                  : formatNumber(rainfallStats.total, 2)}
              </h2>

              <span>mm · selected records only</span>
            </div>

            <div className="snapshot-card">
              <div className="snapshot-card-icon">
                <Activity size={20} />
              </div>

              <p>Average per valid record</p>

              <h2>
                {loading
                  ? "—"
                  : formatNumber(rainfallStats.average, 2)}
              </h2>

              <span>
                mm · {loading ? "—" : rainfallStats.validRows} valid rows
              </span>
            </div>
          </div>

          <div className="dashboard-summary-footer">
            <div>
              <span className="summary-footer-label">
                Years represented in monthly data
              </span>

              <strong>
                {loading
                  ? "—"
                  : formatNumber(summary.years_available)}
              </strong>
            </div>

            <Database size={21} />
          </div>

          <p className="panel-subtitle">
            These figures summarize the returned records. They are not
            Nepal's national rainfall total or national average.
          </p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>
                <MapPin
                  size={19}
                  style={{
                    display: "inline",
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                />
                Monitoring Locations
              </h3>

              <p className="panel-subtitle">
                Stations registered in your database.
              </p>
            </div>

            <span className="topbar-badge">
              {loading ? "—" : locations.length} stations
            </span>
          </div>

          {loading && (
            <div className="notice info" role="status">
              Loading monitoring locations...
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Station Name</th>
                  <th>District ID</th>
                </tr>
              </thead>

              <tbody>
                {!loading &&
                  locations.slice(0, 8).map((location) => (
                    <tr key={location.location_id}>
                      <td>
                        <div className="station-name-cell">
                          <span className="station-dot" />
                          {location.station_name || "Unnamed station"}
                        </div>
                      </td>

                      <td>{location.district_id ?? "—"}</td>
                    </tr>
                  ))}

                {!loading && locations.length === 0 && (
                  <tr>
                    <td colSpan={2}>
                      No monitoring locations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && locations.length > 8 && (
            <p className="panel-subtitle">
              Showing 8 of {locations.length} registered locations.
            </p>
          )}
        </section>
      </div>

      <section className="panel province-panel">
        <div className="panel-heading">
          <div>
            <h3>
              <Map
                size={19}
                style={{
                  display: "inline",
                  marginRight: 8,
                }}
              />
              Provinces of Nepal
            </h3>

            <p className="panel-subtitle">
              Province names returned by your database.
            </p>
          </div>

          <span className="topbar-badge">
            {loading ? "—" : provinces.length} provinces
          </span>
        </div>

        {loading && (
          <div className="notice info" role="status">
            Loading provinces...
          </div>
        )}

        <div className="province-grid">
          {provinces.map((province) => (
            <div
              className="province-item"
              key={province.province_id}
            >
              <div className="province-item-icon">
                <MapPin size={18} />
              </div>

              <div>
                <span>{province.province_name}</span>
                <small>
                  Province ID: {province.province_id}
                </small>
              </div>
            </div>
          ))}

          {!loading && provinces.length === 0 && (
            <p>No provinces were returned by the API.</p>
          )}
        </div>
      </section>

      <p className="dashboard-disclaimer">
        Dashboard statistics reflect data currently available in the
        project's database. Personal water statistics are restricted
        to the logged-in account. Rainfall summaries describe the
        records returned by the selected query and should not be
        interpreted as national totals.
      </p>
    </div>
  );
}