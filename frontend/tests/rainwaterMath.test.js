import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHarvestLitres,
  parseCapacityLitres,
  calculateStorageBalance,
  calculateReservePercent,
} from "../src/utils/rainwaterMath.js";

test("calculator applies runoff coefficient and 90% collection efficiency", () => {
  const result = calculateHarvestLitres(100, 243, 0.85, 0.9);
  assert.equal(result.grossVolume, 24300);
  assert.equal(result.estimatedYield, 18589.5);
});

test("zero rainfall gives zero collection", () => {
  assert.deepEqual(calculateHarvestLitres(100, 0, 0.85), {
    grossVolume: 0,
    estimatedYield: 0,
  });
});

test("calculator rejects invalid roof area and coefficient", () => {
  assert.throws(() => calculateHarvestLitres(0, 20, 0.85), RangeError);
  assert.throws(() => calculateHarvestLitres(10, 20, 1.2), RangeError);
});

test("tank capacity parsing handles comma-formatted text and blank/invalid input", () => {
  assert.equal(parseCapacityLitres("15,000"), 15000);
  assert.equal(parseCapacityLitres(15000), 15000);
  assert.equal(parseCapacityLitres(""), null);
  assert.equal(parseCapacityLitres("not a number"), null);
  assert.equal(parseCapacityLitres(-10), null);
});

test("storage balance retains negative balance to flag deficit", () => {
  assert.equal(calculateStorageBalance(1000, 500, 250), 1250);
  assert.equal(calculateStorageBalance(100, 0, 150), -50);
  assert.equal(calculateStorageBalance("", 0, 0), null);
});

test("reserve percentage uses balance over tank capacity and supports overflow", () => {
  assert.equal(calculateReservePercent(1500, 15000), 10);
  assert.equal(calculateReservePercent(20000, 15000), 133.33333333333331);
  assert.equal(calculateReservePercent(-50, 15000), 0);
  assert.equal(calculateReservePercent(100, 0), null);
  assert.equal(calculateReservePercent(100, 15000, false), null);
});
