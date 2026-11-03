
import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Droplets,
  House,
  RotateCcw,
  Info,
  Database,
  CloudRain,
} from "lucide-react";
import { apiGet } from "../services/api";

const coefficients = {
  "CGI Sheet": 0.85,
  Concrete: 0.80,
  "Clay Tile": 0.75,
};

const numberFormat = (value) =>
  Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

const YEAR = "2018";

export default function CollectionCalculator() {
  const [area, setArea] = useState("100");
  const [rainfall, setRainfall] = useState("");
  const [material, setMaterial] = useState("CGI Sheet");

  const [rainfallSource, setRainfallSource] = useState("database");

  const [locations, setLocations] = useState([]);
  const [rainfallRecords, setRainfallRecords] = useState([]);

  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dataMessage, setDataMessage] = useState("");

  // Load stations and actual rainfall records.
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        setError("");
        setDataMessage("");

        const [locationData, rainfallData] = await Promise.all([
          apiGet("/api/locations"),
          apiGet(`/api/rainfall?year=${YEAR}`),
        ]);

        if (!active) return;

        const validLocations = Array.isArray(locationData)
          ? locationData
          : [];

        const validRainfall = Array.isArray(rainfallData)
          ? rainfallData.filter((record) => {
              const value = Number(record.rainfall_mm);
              return (
                Number.isFinite(value) &&
                value >= 0 &&
                record.location_id != null &&
                record.month
              );
            })
          : [];

        const availableLocationIds = new Set(
          validRainfall.map((record) =>
            String(record.location_id)
          )
        );

        const matchingLocations = validLocations.filter(
          (location) =>
            availableLocationIds.has(String(location.location_id))
        );

        setLocations(matchingLocations);
        setRainfallRecords(validRainfall);

        if (matchingLocations.length > 0) {
          const firstLocation = matchingLocations[0];
          const firstLocationId = String(firstLocation.location_id);

          setSelectedLocation(firstLocationId);

          const firstRecord = validRainfall.find(
            (record) =>
              String(record.location_id) === firstLocationId
          );

          setSelectedMonth(firstRecord?.month || "");
        } else {
          setSelectedLocation("");
          setSelectedMonth("");
          setDataMessage(
            "No matching rainfall records are available for 2018."
          );
        }
      } catch (err) {
        if (!active) return;

        setError(err.message || "Unable to load rainfall information.");
        setLocations([]);
        setRainfallRecords([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  // Find the months that actually exist for the selected station.
  const availableMonths = useMemo(() => {
    const months = rainfallRecords
      .filter(
        (record) =>
          String(record.location_id) === selectedLocation
      )
      .map((record) => record.month);

    return [...new Set(months)];
  }, [rainfallRecords, selectedLocation]);

  // Find the matching rainfall record.
  const selectedRainfallRecord = useMemo(() => {
    return rainfallRecords.find(
      (record) =>
        String(record.location_id) === selectedLocation &&
        record.month === selectedMonth
    );
  }, [rainfallRecords, selectedLocation, selectedMonth]);

  // Automatically update rainfall when station or month changes.
  useEffect(() => {
    if (rainfallSource !== "database") return;

    if (!selectedRainfallRecord) {
      setRainfall("");
      return;
    }

    setRainfall(String(selectedRainfallRecord.rainfall_mm));
    setResult(null);
    setError("");
  }, [selectedRainfallRecord, rainfallSource]);

  function changeLocation(value) {
    setSelectedLocation(value);
    setSelectedMonth("");
    setRainfall("");
    setResult(null);
    setError("");
  }

  function changeMonth(value) {
    setSelectedMonth(value);
    setResult(null);
    setError("");
  }

  function changeSource(source) {
    setRainfallSource(source);
    setRainfall("");
    setResult(null);
    setError("");
    setDataMessage("");
  }

  function calculate(event) {
    event.preventDefault();

    const roofArea = Number(area);
    const rainfallDepth = Number(rainfall);

    if (
      area.trim() === "" ||
      rainfall.trim() === "" ||
      !Number.isFinite(roofArea) ||
      !Number.isFinite(rainfallDepth) ||
      roofArea <= 0 ||
      rainfallDepth < 0
    ) {
      setError(
        "Enter a roof area greater than zero and a valid rainfall value of zero or more."
      );
      setResult(null);
      return;
    }

    if (
      rainfallSource === "database" &&
      !selectedRainfallRecord
    ) {
      setError(
        "Please select a station and month with an available rainfall record."
      );
      setResult(null);
      return;
    }

    const coefficient = coefficients[material];

    if (coefficient === undefined) {
      setError("Please select a valid roof material.");
      setResult(null);
      return;
    }

    // 1 mm of rainfall over 1 m² equals 1 litre.
    const grossVolume = roofArea * rainfallDepth;

    // Estimated collection after applying the roof coefficient.
    const estimatedYield = grossVolume * coefficient;

    const station = locations.find(
      (location) =>
        String(location.location_id) === selectedLocation
    );

    setError("");

    setResult({
      area: roofArea,
      rainfall: rainfallDepth,
      material,
      coefficient,
      grossVolume,
      yield: estimatedYield,
      source: rainfallSource,
      station: station?.station_name || "",
      month: selectedMonth,
      year: YEAR,
    });
  }

  function resetCalculator() {
    setArea("100");
    setMaterial("CGI Sheet");
    setResult(null);
    setError("");

    if (rainfallSource === "manual") {
      setRainfall("");
    } else if (selectedRainfallRecord) {
      setRainfall(String(selectedRainfallRecord.rainfall_mm));
    }
  }

  return (
    <div className="calculator-page">
      <div className="page-intro">
        <h1>Rainwater Collection Calculator</h1>
        <p>
          Estimate potential rooftop rainwater collection using
          roof area, rainfall depth, and roof material.
        </p>
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>
                <Calculator
                  size={20}
                  style={{
                    display: "inline",
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                />
                Calculation Details
              </h3>
              <p className="panel-subtitle">
                Enter your roof measurements and select a rainfall source.
              </p>
            </div>
          </div>

          <form onSubmit={calculate}>
            <div className="field">
              <label htmlFor="roof-area">Roof Area (m²)</label>
              <input
                id="roof-area"
                type="number"
                min="0.01"
                step="any"
                value={area}
                onChange={(event) => {
                  setArea(event.target.value);
                  setResult(null);
                }}
                required
              />
              <small>
                Enter the horizontal roof collection area.
              </small>
            </div>

            <div className="field">
              <label>Rainfall Data Source</label>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={
                    rainfallSource === "database"
                      ? "primary-button"
                      : "secondary-button"
                  }
                  onClick={() => changeSource("database")}
                >
                  <Database size={16} />
                  Database Data
                </button>

                <button
                  type="button"
                  className={
                    rainfallSource === "manual"
                      ? "primary-button"
                      : "secondary-button"
                  }
                  onClick={() => changeSource("manual")}
                >
                  <CloudRain size={16} />
                  Manual Entry
                </button>
              </div>
            </div>

            {rainfallSource === "database" && (
              <>
                <div className="field">
                  <label htmlFor="station">Monitoring Station</label>

                  <select
                    id="station"
                    value={selectedLocation}
                    onChange={(event) =>
                      changeLocation(event.target.value)
                    }
                    disabled={loading || locations.length === 0}
                  >
                    {locations.map((location) => (
                      <option
                        key={location.location_id}
                        value={String(location.location_id)}
                      >
                        {location.station_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="rainfall-month">Rainfall Month</label>

                  <select
                    id="rainfall-month"
                    value={selectedMonth}
                    onChange={(event) =>
                      changeMonth(event.target.value)
                    }
                    disabled={
                      loading || availableMonths.length === 0
                    }
                  >
                    {availableMonths.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="rainfall-year">Rainfall Year</label>
                  <input
                    id="rainfall-year"
                    type="text"
                    value={YEAR}
                    readOnly
                  />
                  <small>
                    Monthly rainfall is retrieved from the available
                    2018 database records.
                  </small>
                </div>

                {loading && (
                  <div className="notice info" role="status">
                    Loading monitoring stations and rainfall records...
                  </div>
                )}

                {!loading && selectedRainfallRecord && (
                  <div className="notice info">
                    <Database
                      size={17}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: 6,
                      }}
                    />
                    Rainfall retrieved from the database:
                    <strong>
                      {" "}
                      {numberFormat(selectedRainfallRecord.rainfall_mm)} mm
                    </strong>
                  </div>
                )}

                {!loading && !selectedRainfallRecord &&
                  locations.length > 0 && (
                    <div className="notice info" role="status">
                      Select a station and month with available rainfall data.
                    </div>
                  )}

                {!loading && dataMessage && (
                  <div className="notice info" role="status">
                    {dataMessage}
                  </div>
                )}
              </>
            )}

            <div className="field">
              <label htmlFor="rainfall-depth">Rainfall Depth (mm)</label>

              <input
                id="rainfall-depth"
                type="number"
                min="0"
                step="any"
                placeholder="Enter measured rainfall"
                value={rainfall}
                onChange={(event) => {
                  setRainfall(event.target.value);
                  setResult(null);
                }}
                required
              />

              <small>
                {rainfallSource === "database"
                  ? "Automatically filled from the selected database record. You can edit the value for an alternative estimate."
                  : "Enter the measured rainfall depth for your selected period."}
              </small>
            </div>

            <div className="field">
              <label htmlFor="roof-material">Roof Material</label>

              <select
                id="roof-material"
                value={material}
                onChange={(event) => {
                  setMaterial(event.target.value);
                  setResult(null);
                }}
              >
                {Object.entries(coefficients).map(
                  ([name, value]) => (
                    <option key={name} value={name}>
                      {name} — coefficient {value.toFixed(2)}
                    </option>
                  )
                )}
              </select>
            </div>

            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              <button
                className="primary-button"
                type="submit"
                disabled={
                  loading ||
                  (rainfallSource === "database" &&
                    (!selectedRainfallRecord || !rainfall.trim()))
                }
              >
                <Calculator size={17} />
                Calculate Yield
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={resetCalculator}
              >
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
          </form>

          {result && (
            <div
              className="result-card"
              aria-live="polite"
              style={{ marginTop: 24 }}
            >
              <div className="result-label">
                <Droplets
                  size={18}
                  style={{
                    display: "inline",
                    verticalAlign: "middle",
                    marginRight: 6,
                  }}
                />
                Estimated Potential Collection
              </div>

              <div className="result-value">
                {numberFormat(result.yield)} L
              </div>

              <p>
                This is an estimated potential collection volume,
                not a guarantee of the amount actually stored.
              </p>

              <div className="table-wrap" style={{ marginTop: 18 }}>
                <table>
                  <tbody>
                    <tr>
                      <th>Roof area</th>
                      <td>{numberFormat(result.area)} m²</td>
                    </tr>
                    <tr>
                      <th>Rainfall depth</th>
                      <td>{numberFormat(result.rainfall)} mm</td>
                    </tr>
                    <tr>
                      <th>Roof material</th>
                      <td>{result.material}</td>
                    </tr>
                    <tr>
                      <th>Runoff coefficient</th>
                      <td>{result.coefficient.toFixed(2)}</td>
                    </tr>
                    {result.source === "database" && (
                      <>
                        <tr>
                          <th>Monitoring station</th>
                          <td>{result.station}</td>
                        </tr>
                        <tr>
                          <th>Rainfall period</th>
                          <td>{result.month} {result.year}</td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <th>Gross rainfall volume</th>
                      <td>{numberFormat(result.grossVolume)} L</td>
                    </tr>
                    <tr>
                      <th>Estimated collection</th>
                      <td>
                        <strong>{numberFormat(result.yield)} L</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h3>
            <House
              size={20}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 8,
              }}
            />
            Calculation Method
          </h3>

          <p className="panel-subtitle">
            The calculator uses the rooftop rainwater harvesting formula.
          </p>

          <div className="notice info">
            <strong>
              Yield (L) = Roof Area (m²) × Rainfall (mm) ×
              Runoff Coefficient
            </strong>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3>Roof Runoff Coefficients</h3>
            <p className="panel-subtitle">
              These are project assumptions and must be verified
              against approved references.
            </p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Roof Material</th>
                    <th>Coefficient</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(coefficients).map(
                    ([name, value]) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td>{value.toFixed(2)}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="notice info" style={{ marginTop: 20 }}>
            <Info
              size={18}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            <strong>Important:</strong> The runoff coefficients are
            project assumptions, not verified measurements from your
            rainfall database. Confirm their values and references
            with your teacher.
          </div>

          <div style={{ marginTop: 20 }}>
            <h3>How to Use</h3>
            <ul style={{ paddingLeft: 22, lineHeight: 1.9 }}>
              <li>Enter the roof collection area in square metres.</li>
              <li>Select database rainfall or manual entry.</li>
              <li>If using database data, select an available station and month.</li>
              <li>Check the rainfall value.</li>
              <li>Select the roof material.</li>
              <li>Click Calculate Yield to view the estimate.</li>
            </ul>
          </div>

          <div className="notice info" style={{ marginTop: 18 }}>
            <Database
              size={18}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            Rainfall is retrieved from your existing MySQL database
            through the Express API. The calculator does not save
            or modify database records.
          </div>
        </section>
      </div>
    </div>
  );
}
