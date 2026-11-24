// Shared, pure rainwater calculations used by the UI and unit tests.
export function calculateHarvestLitres(areaM2, rainfallMm, runoffCoefficient, efficiency = 0.9) {
  const values = [areaM2, rainfallMm, runoffCoefficient, efficiency].map(Number);
  const [area, rainfall, coefficient, collectionEfficiency] = values;
  if (!values.every(Number.isFinite) || area <= 0 || rainfall < 0 ||
      coefficient <= 0 || coefficient > 1 || collectionEfficiency < 0 || collectionEfficiency > 1) {
    throw new RangeError("Invalid rainwater calculation inputs.");
  }
  const grossVolume = area * rainfall;
  return {
    grossVolume,
    estimatedYield: grossVolume * coefficient * collectionEfficiency,
  };
}

export function parseCapacityLitres(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function calculateStorageBalance(startingBalance, collected, used) {
  if (startingBalance === null || startingBalance === undefined || startingBalance === "") return null;
  const values = [startingBalance, collected, used].map(Number);
  if (!values.every(Number.isFinite)) return null;
  return values[0] + values[1] - values[2];
}

export function calculateReservePercent(balance, capacity, hasCapacity = true) {
  const numericBalance = Number(balance);
  const numericCapacity = Number(capacity);
  if (!hasCapacity || balance === null || balance === undefined ||
      !Number.isFinite(numericBalance) || !Number.isFinite(numericCapacity) || numericCapacity <= 0) {
    return null;
  }
  return numericBalance < 0 ? 0 : (numericBalance / numericCapacity) * 100;
}
