
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Droplets,
  Database,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertCircle,
  Info,
  CheckCircle,
} from "lucide-react";

import { apiGet } from "../services/api";

function formatLitres(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? `${number.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })} L`
    : "—";
}

function getNumericValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : null;
}

export default function Storage() {
  const [roofs, setRoofs] = useState([]);
  const [records, setRecords] = useState([]);
  const [startingBalance, setStartingBalance] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load the current user's roof and water records.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [roofResponse, recordResponse] = await Promise.all([
        apiGet("/api/roofs"),
        apiGet("/api/water-records"),
      ]);

      setRoofs(Array.isArray(roofResponse) ? roofResponse : []);
      setRecords(Array.isArray(recordResponse) ? recordResponse : []);
    } catch (err) {
      setError(
        err.message || "Unable to load storage information."
      );

      setRoofs([]);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate the total capacity of registered tanks.
  const tankCapacity = roofs.reduce((total, roof) => {
    const capacity = getNumericValue(roof.storage_tank_litres);

    return total + (capacity ?? 0);
  }, 0);

  const hasTankCapacity = roofs.some(
    (roof) =>
      getNumericValue(roof.storage_tank_litres) !== null
  );

  // Calculate collected water belonging to the current user.
  const collected = records
    .filter((record) => record.record_type === "collected")
    .reduce(
      (total, record) =>
        total + (getNumericValue(record.volume_litres) ?? 0),
      0
    );

  // Calculate used water belonging to the current user.
  const used = records
    .filter((record) => record.record_type === "used")
    .reduce(
      (total, record) =>
        total + (getNumericValue(record.volume_litres) ?? 0),
      0
    );

  const initialVolume = getNumericValue(startingBalance);

  // Do not hide a negative balance: it indicates a shortfall.
  const estimatedBalance =
    initialVolume === null
      ? null
      : initialVolume + collected - used;

  const balanceExceedsCapacity =
    estimatedBalance !== null &&
    hasTankCapacity &&
    estimatedBalance > tankCapacity;

  const hasInsufficientBalance =
    estimatedBalance !== null && estimatedBalance < 0;

  return (
    <div className="storage-page">
      <div className="page-intro storage-heading">
        <div>
          <h1>Water Storage</h1>
          <p>
            Review tank capacity and recorded rainwater collection
            and usage.
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
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Tank Capacity</div>

          <div className="stat-value">
            {loading
              ? "Loading..."
              : hasTankCapacity
                ? formatLitres(tankCapacity)
                : "—"}
          </div>

          <div className="stat-note">
            {roofs.length} registered roof record(s)
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Starting Water Balance</div>

          <div className="stat-value">
            {initialVolume === null
              ? "Not entered"
              : formatLitres(initialVolume)}
          </div>

          <div className="stat-note">
            User-provided starting amount
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Water Collected</div>

          <div className="stat-value">
            {loading ? "Loading..." : formatLitres(collected)}
          </div>

          <div className="stat-note">
            From saved collection records
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Water Used</div>

          <div className="stat-value">
            {loading ? "Loading..." : formatLitres(used)}
          </div>

          <div className="stat-note">
            From saved usage records
          </div>
        </div>
      </div>

      <section className="panel storage-balance-panel">
        <div className="storage-section-heading">
          <div>
            <h3>Estimated Storage Balance</h3>

            <p className="panel-subtitle">
              Enter the amount of water available at the beginning
              of the period to calculate an estimated balance.
            </p>
          </div>

          <Droplets size={24} />
        </div>

        <label className="storage-starting-field">
          <span>Starting stored water (litres)</span>

          <input
            type="number"
            min="0"
            step="0.01"
            value={startingBalance}
            onChange={(event) =>
              setStartingBalance(event.target.value)
            }
            placeholder="Enter starting water volume"
          />
        </label>

        <div className="storage-formula">
          <strong>
            Estimated ending balance = Starting balance + Water
            collected − Water used
          </strong>
        </div>

        <div className="storage-result">
          <span>Estimated ending balance</span>

          <h2>
            {estimatedBalance === null
              ? "Enter starting balance"
              : formatLitres(estimatedBalance)}
          </h2>
        </div>

        {hasInsufficientBalance && (
          <div className="notice error" role="alert">
            <AlertCircle size={17} />
            Water usage exceeds the available starting balance
            and collected water by{" "}
            {formatLitres(Math.abs(estimatedBalance))}.
            Check your records and starting amount.
          </div>
        )}

        {balanceExceedsCapacity && (
          <div className="notice info" role="status">
            <Info size={17} />
            The estimated balance is greater than the registered
            tank capacity. This may indicate overflow or missing
            loss records.
          </div>
        )}

        {estimatedBalance !== null &&
          estimatedBalance >= 0 &&
          !balanceExceedsCapacity && (
            <div className="notice success" role="status">
              <CheckCircle size={17} />
              The estimated balance is within the registered
              tank capacity.
            </div>
          )}

        <p className="panel-subtitle storage-disclaimer">
          This is a calculation based on the records currently
          available. It does not measure actual tank levels or
          automatically account for overflow, leakage, evaporation,
          or other losses. The starting balance is not saved to
          the database.
        </p>
      </section>

      <section className="panel storage-information-panel">
        <h3>Storage Data Information</h3>

        <div className="storage-info-row">
          <Database size={19} />

          <div>
            <strong>Tank capacity</strong>
            <p>
              Retrieved from the logged-in user's registered roof
              information, where capacity has been entered.
            </p>
          </div>
        </div>

        <div className="storage-info-row">
          <ArrowDownToLine size={19} />

          <div>
            <strong>Collected water</strong>
            <p>
              Total volume from the logged-in user's saved
              collection records.
            </p>
          </div>
        </div>

        <div className="storage-info-row">
          <ArrowUpFromLine size={19} />

          <div>
            <strong>Used water</strong>
            <p>
              Total volume from the logged-in user's saved
              usage records.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
