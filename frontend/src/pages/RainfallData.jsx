import { useCallback, useEffect, useState } from "react";
import {
  Search,
  RotateCcw,
  CloudRain,
  MapPin,
  Database,
  TrendingUp,
} from "lucide-react";

import { apiGet } from "../services/api";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits,
  });
}

export default function RainfallData() {
  const [locations, setLocations] = useState([]);
  const [rows, setRows] = useState([]);

  // Applied filters are separate from the inputs.
  // The user must click Search to apply changes.
  const [yearInput, setYearInput] = useState("2018");
  const [monthInput, setMonthInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  const [filters, setFilters] = useState({
    year: "2018",
    month: "",
    locationId: "",
  });

  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingRainfall, setLoadingRainfall] = useState(true);

  const [locationError, setLocationError] = useState("");
  const [rainfallError, setRainfallError] = useState("");

  // ====================================================
  // LOAD PUBLIC MONITORING LOCATIONS
  // ====================================================

  useEffect(() => {
    let active = true;

    async function loadLocations() {
      setLoadingLocations(true);
      setLocationError("");

      try {
        const data = await apiGet("/api/locations");

        if (!active) return;

        setLocations(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!active) return;

        setLocations([]);
        setLocationError(
          error.message || "Unable to load monitoring stations."
        );
      } finally {
        if (active) {
          setLoadingLocations(false);
        }
      }
    }

    loadLocations();

    return () => {
      active = false;
    };
  }, []);

  // ====================================================
  // LOAD RAINFALL RECORDS
  // ====================================================

  const loadRainfall = useCallback(async (selectedFilters) => {
    setLoadingRainfall(true);
    setRainfallError("");

    const params = new URLSearchParams();

    if (selectedFilters.year) {
      params.set("year", selectedFilters.year);
    }

    if (selectedFilters.month) {
      params.set("month", selectedFilters.month);
    }

    if (selectedFilters.locationId) {
      params.set("location_id", selectedFilters.locationId);
    }

    const queryString = params.toString();
    const endpoint = queryString
      ? `/api/rainfall?${queryString}`
      : "/api/rainfall";

    try {
      const data = await apiGet(endpoint);

      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setRows([]);
      setRainfallError(
        error.message || "Unable to load rainfall records."
      );
    } finally {
      setLoadingRainfall(false);
    }
  }, []);

  useEffect(() => {
    loadRainfall(filters);
  }, [filters, loadRainfall]);

  // ====================================================
  // APPLY SEARCH FILTERS
  // ====================================================

  function handleSearch(event) {
    event.preventDefault();

    const cleanYear = yearInput.trim();

    if (cleanYear && !/^\d{4}$/.test(cleanYear)) {
      setRainfallError("Enter a valid four-digit year.");
      return;
    }

    setFilters({
      year: cleanYear,
      month: monthInput,
      locationId: locationInput,
    });
  }

  // ====================================================
  // RESET FILTERS
  // ====================================================

  function handleReset() {
    setYearInput("");
    setMonthInput("");
    setLocationInput("");

    setFilters({
      year: "",
      month: "",
      locationId: "",
    });
  }

  // ====================================================
  // STATION NAME LOOKUP
  // ====================================================

  const stationNames = new Map(
    locations.map((location) => [
      String(location.location_id),
      location.station_name,
    ])
  );

  // ====================================================
  // SUMMARY CALCULATIONS
  // These describe only the currently returned records.
  // ====================================================

  const totalRainfall = rows.reduce((total, row) => {
    return total + (Number(row.rainfall_mm) || 0);
  }, 0);

  const averageRainfall =
    rows.length > 0 ? totalRainfall / rows.length : 0;

  const matchingStations = new Set(
    rows.map((row) => String(row.location_id))
  ).size;

  const isLoading = loadingRainfall;

  // ====================================================
  // PAGE
  // ====================================================

  return (
    <div className="rainfall-page">
      {/* PAGE INTRODUCTION */}

      <div className="page-intro">
        <h1>Rainfall Data</h1>

        <p>
          Explore rainfall measurements available in the
          Rainwater Nepal database. Filter the records by
          year, month, or monitoring station.
        </p>
      </div>

      {/* LOCATION LOADING / ERROR */}

      {locationError && (
        <div className="notice error" role="alert">
          {locationError}
        </div>
      )}

      {/* FILTERS */}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Filter Rainfall Records</h3>

            <p className="panel-subtitle">
              Select the records you want to view.
            </p>
          </div>

          <Search size={22} />
        </div>

        <form onSubmit={handleSearch}>
          <div className="filters">
            <input
              className="filter-control"
              type="number"
              min="1900"
              max="2100"
              step="1"
              aria-label="Filter by year"
              placeholder="Year (e.g. 2018)"
              value={yearInput}
              onChange={(event) =>
                setYearInput(event.target.value)
              }
            />

            <select
              className="filter-control"
              aria-label="Filter by month"
              value={monthInput}
              onChange={(event) =>
                setMonthInput(event.target.value)
              }
            >
              <option value="">All months</option>

              {MONTHS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              className="filter-control"
              aria-label="Filter by monitoring station"
              value={locationInput}
              onChange={(event) =>
                setLocationInput(event.target.value)
              }
            >
              <option value="">All stations</option>

              {locations.map((location) => (
                <option
                  key={location.location_id}
                  value={location.location_id}
                >
                  {location.station_name}
                </option>
              ))}
            </select>

            <button
              className="primary-button"
              type="submit"
              disabled={loadingRainfall || loadingLocations}
            >
              <Search size={16} />
              Search
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={handleReset}
              disabled={loadingRainfall}
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </form>
      </section>

      {/* API ERRORS */}

      {rainfallError && (
        <div className="notice error" role="alert">
          {rainfallError}
        </div>
      )}

      {/* SUMMARY CARDS */}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Database size={22} />
          </div>

          <div>
            <p className="stat-label">Matching Records</p>

            <h2>
              {isLoading ? "—" : formatNumber(rows.length, 0)}
            </h2>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <CloudRain size={22} />
          </div>

          <div>
            <p className="stat-label">Sum of Listed Rainfall</p>

            <h2>
              {isLoading
                ? "—"
                : `${formatNumber(totalRainfall)} mm`}
            </h2>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <MapPin size={22} />
          </div>

          <div>
            <p className="stat-label">Stations in Results</p>

            <h2>
              {isLoading
                ? "—"
                : formatNumber(matchingStations, 0)}
            </h2>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={22} />
          </div>

          <div>
            <p className="stat-label">Average per Record</p>

            <h2>
              {isLoading
                ? "—"
                : `${formatNumber(averageRainfall)} mm`}
            </h2>
          </div>
        </div>
      </div>

      <p className="panel-subtitle">
        Summary values describe the records returned by the
        selected filters. They should not be interpreted as
        nationwide rainfall totals.
      </p>

      {/* RECORDS TABLE */}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h3>Rainfall Records</h3>

            <p className="panel-subtitle">
              Records retrieved from the monthly rainfall table.
            </p>
          </div>

          <span className="topbar-badge">
            {loadingRainfall
              ? "Loading..."
              : `${rows.length.toLocaleString()} records`}
          </span>
        </div>

        {loadingRainfall && (
          <div className="notice info" role="status">
            Loading rainfall records...
          </div>
        )}

        {!loadingRainfall && rainfallError && (
          <div className="notice error" role="alert">
            The rainfall records could not be loaded.
          </div>
        )}

        {!loadingRainfall && !rainfallError && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Record ID</th>
                  <th>Monitoring Station</th>
                  <th>Year</th>
                  <th>Month</th>
                  <th>Rainfall (mm)</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.rainfall_id}>
                    <td>{row.rainfall_id}</td>

                    <td>
                      {stationNames.get(
                        String(row.location_id)
                      ) ||
                        `Station #${row.location_id}`}
                    </td>

                    <td>{row.year}</td>

                    <td>{row.month}</td>

                    <td>
                      {formatNumber(row.rainfall_mm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loadingRainfall &&
          !rainfallError &&
          rows.length === 0 && (
            <div className="empty-state">
              No matching records were found. Try different
              filters or select Reset to view all available
              records.
            </div>
          )}
      </section>
    </div>
  );
}