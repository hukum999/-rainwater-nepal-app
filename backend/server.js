
"use strict";

require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const DB_NAME = process.env.DB_NAME || "defaultdb";

// Allow both local development and the published GitHub Pages website.
const FRONTEND_URLS = [
  "http://localhost:5173",
  "https://hukum999.github.io",
  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const ALLOWED_ORIGINS = [...new Set(FRONTEND_URLS)];

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid port number.");
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "Set JWT_SECRET in backend/.env to a random secret of at least 32 characters."
  );
}

// ======================================================
// 1. MIDDLEWARE
// ======================================================

app.disable("x-powered-by");

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "100kb" }));

// ======================================================
// 2. DATABASE — AIVEN MYSQL WITH SSL
// ======================================================

let caCertificate;

const encodedCertificate = process.env.DB_SSL_CA_BASE64;

if (encodedCertificate && encodedCertificate.trim()) {
  caCertificate = Buffer.from(
    encodedCertificate.trim(),
    "base64"
  );

  if (!caCertificate.length) {
    throw new Error("Invalid DB_SSL_CA_BASE64 certificate.");
  }

  console.log(
    "Using Aiven CA certificate from environment variable."
  );
} else {
  const localCertificatePath = path.join(
    __dirname,
    "certs",
    "ca.pem"
  );

  const renderCertificatePath = "/etc/secrets/ca.pem";

  const certificatePath = fs.existsSync(localCertificatePath)
    ? localCertificatePath
    : renderCertificatePath;

  if (!fs.existsSync(certificatePath)) {
    throw new Error(
      "Aiven CA certificate not found. Set DB_SSL_CA_BASE64 or provide ca.pem."
    );
  }

  caCertificate = fs.readFileSync(certificatePath);

  console.log("Using Aiven CA certificate from file.");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: DB_NAME,
  port: Number(process.env.DB_PORT),

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  charset: "utf8mb4",
  timezone: "Z",

  ssl: {
    ca: caCertificate,
    rejectUnauthorized: true,
  },
});

const db = pool.promise();

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function ensureSafeSchemaMigrations() {
  // Additive, idempotent migration for FR-06 usage categories.
  // Preserves all existing records and does not modify existing data.
  try {
    await db.query(
      `ALTER TABLE water_records
       ADD COLUMN usage_category VARCHAR(50) NULL DEFAULT NULL`
    );
    console.log("Schema migration: added water_records.usage_category.");
  } catch (error) {
    // ER_DUP_FIELDNAME = 1060 means the column already exists.
    if (error && error.code === "ER_DUP_FIELDNAME") {
      return;
    }
    console.error(
      "Schema migration warning (usage_category):",
      error.code || error.message
    );
  }
}

// ======================================================
// 3. VALIDATION HELPERS
// ======================================================

const WATER_USAGE_CATEGORIES = [
  "Toilet flushing",
  "Laundry",
  "Cleaning",
  "Gardening",
  "Livestock",
];

function isPositiveInteger(value) {
  return (
    (typeof value === "number" || typeof value === "string") &&
    String(value).trim() !== "" &&
    /^\d+$/.test(String(value)) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function parseOptionalDate(value, fieldName) {
  if (value === undefined || value === "") {
    return { value: null };
  }

  if (!isValidDate(value)) {
    return {
      error: `${fieldName} must use YYYY-MM-DD format.`,
    };
  }

  return { value };
}

function parsePositiveNumber(value, fieldName) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return { error: `${fieldName} is required.` };
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return {
      error: `${fieldName} must be a number greater than zero.`,
    };
  }

  return { value: number };
}

// ======================================================
// 4. AUTHENTICATION
// ======================================================

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      error: "Authentication required. Please log in.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      error: "Authentication token is missing.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (
      !decoded ||
      !isPositiveInteger(decoded.userId) ||
      String(decoded.sub) !== String(decoded.userId)
    ) {
      return res.status(401).json({
        error: "Invalid authentication token.",
      });
    }

    req.user = {
      user_id: Number(decoded.userId),
    };

    return next();
  } catch {
    return res.status(401).json({
      error: "Your session is invalid or has expired. Please log in again.",
    });
  }
}

async function requireExistingUser(req, res, next) {
  try {
    const users = await query(
      "SELECT user_id FROM users WHERE user_id = ? LIMIT 1",
      [req.user.user_id]
    );

    if (!users.length) {
      return res.status(401).json({
        error: "User account no longer exists. Please log in again.",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

const authenticated = [requireAuth, requireExistingUser];

// ======================================================
// 5. API HOME
// ======================================================

app.get("/", (req, res) => {
  res.json({
    message: "Rainwater Nepal API is running!",
    database: DB_NAME,
    availableEndpoints: [
      "/api/auth/login",
      "/api/auth/me",
      "/api/provinces",
      "/api/districts",
      "/api/provinces/:id/districts",
      "/api/station-types",
      "/api/locations",
      "/api/rainfall",
      "/api/rainfall/annual",
      "/api/roofs",
      "/api/water-demand-benchmarks",
      "/api/water-records",
      "/api/dashboard/summary",
    ],
  });
});

// ======================================================
// 6. REGISTER NEW USER
// ======================================================

app.post(
  "/api/auth/register",
  asyncRoute(async (req, res) => {
    const { name, email, password } = req.body || {};

    const cleanName =
      typeof name === "string" ? name.trim() : "";

    const cleanEmail =
      typeof email === "string" ? email.trim() : "";

    if (!cleanName || !cleanEmail || !password) {
      return res.status(400).json({
        error: "Name, email and password are required.",
      });
    }

    if (
      cleanName.length > 150 ||
      cleanEmail.length > 150 ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 1024
    ) {
      return res.status(400).json({
        error: "Please check your details. Password must be at least 8 characters.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        error: "Please enter a valid email address.",
      });
    }

    const connection = await db.getConnection();
    const lockName = "rainwater_users_registration";
    let lockAcquired = false;
    let transactionStarted = false;

    try {
      const [lockRows] = await connection.query(
        "SELECT GET_LOCK(?, 10) AS acquired",
        [lockName]
      );

      if (Number(lockRows[0]?.acquired) !== 1) {
        return res.status(503).json({
          error: "Registration is busy. Please try again.",
        });
      }

      lockAcquired = true;

      await connection.beginTransaction();
      transactionStarted = true;

      const [existingUsers] = await connection.query(
        "SELECT user_id FROM users WHERE email = ? LIMIT 1",
        [cleanEmail]
      );

      if (existingUsers.length > 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          error: "An account with this email already exists. Please log in.",
        });
      }

      const [idRows] = await connection.query(
        "SELECT COALESCE(MAX(user_id), 0) + 1 AS next_id FROM users"
      );

      const newUserId = Number(idRows[0].next_id);

      const passwordHash = await bcrypt.hash(password, 12);

      await connection.query(
        `INSERT INTO users (user_id, name, email, password_hash)
         VALUES (?, ?, ?, ?)`,
        [newUserId, cleanName, cleanEmail, passwordHash]
      );

      await connection.commit();
      transactionStarted = false;

      const token = jwt.sign(
        { userId: newUserId },
        JWT_SECRET,
        {
          expiresIn: JWT_EXPIRES_IN,
          subject: String(newUserId),
        }
      );

      return res.status(201).json({
        message: "Account created successfully.",
        token,
        user: {
          user_id: newUserId,
          name: cleanName,
          email: cleanEmail,
        },
      });
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      throw error;
    } finally {
      if (lockAcquired) {
        try {
          await connection.query(
            "SELECT RELEASE_LOCK(?)",
            [lockName]
          );
        } catch (releaseError) {
          console.error("Could not release registration lock.");
        }
      }

      connection.release();
    }
  })
);

// ======================================================
// 7. LOGIN
// ======================================================

app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        error: "Email and password are required.",
      });
    }

    if (email.length > 150 || password.length > 1024) {
      return res.status(400).json({
        error: "Email or password is too long.",
      });
    }

    const users = await query(
      `SELECT user_id, name, email, password_hash
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email.trim()]
    );

    if (
      !users.length ||
      typeof users[0].password_hash !== "string" ||
      !users[0].password_hash
    ) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const user = users[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
      { userId: user.user_id },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
        subject: String(user.user_id),
      }
    );

    return res.json({
      message: "Login successful.",
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
      },
    });
  })
);

// ======================================================
// 7. CURRENT USER
// ======================================================

app.get(
  "/api/auth/me",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const users = await query(
      `SELECT
         user_id,
         name,
         email,
         organization_or_site,
         building_category,
         district_id,
         household_occupants
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.user_id]
    );

    return res.json({ user: users[0] });
  })
);

// ======================================================
// 8. PUBLIC REFERENCE DATA
// ======================================================

app.get(
  "/api/provinces",
  asyncRoute(async (req, res) => {
    const results = await query(
      `SELECT province_id, province_name
       FROM provinces
       ORDER BY province_id`
    );

    res.json(results);
  })
);

app.get(
  "/api/districts",
  asyncRoute(async (req, res) => {
    const results = await query(
      `SELECT district_id, district_name, province_id
       FROM districts
       ORDER BY district_id`
    );

    res.json(results);
  })
);

app.get(
  "/api/provinces/:id/districts",
  asyncRoute(async (req, res) => {
    const provinceId = req.params.id;

    if (!isPositiveInteger(provinceId)) {
      return res.status(400).json({
        error: "Please provide a valid province ID.",
      });
    }

    const results = await query(
      `SELECT district_id, district_name, province_id
       FROM districts
       WHERE province_id = ?
       ORDER BY district_id`,
      [Number(provinceId)]
    );

    res.json(results);
  })
);

app.get(
  "/api/station-types",
  asyncRoute(async (req, res) => {
    const results = await query(
      `SELECT station_type_id, type_name, description
       FROM station_types
       ORDER BY station_type_id`
    );

    res.json(results);
  })
);

app.get(
  "/api/locations",
  asyncRoute(async (req, res) => {
    const results = await query(
      `SELECT
         location_id,
         station_name,
         district_id,
         station_type_id,
         latitude,
         longitude,
         elevation_m,
         dhm_index_no
       FROM locations
       ORDER BY station_name`
    );

    res.json(results);
  })
);

// ======================================================
// 9. MONTHLY RAINFALL
// ======================================================

app.get(
  "/api/rainfall",
  asyncRoute(async (req, res) => {
    const conditions = [];
    const params = [];

    if (req.query.year !== undefined && req.query.year !== "") {
      if (
        !isPositiveInteger(req.query.year) ||
        Number(req.query.year) > 9999
      ) {
        return res.status(400).json({
          error: "Year must be a valid positive integer.",
        });
      }

      conditions.push("year = ?");
      params.push(Number(req.query.year));
    }

    if (
      req.query.location_id !== undefined &&
      req.query.location_id !== ""
    ) {
      if (!isPositiveInteger(req.query.location_id)) {
        return res.status(400).json({
          error: "Invalid location ID.",
        });
      }

      conditions.push("location_id = ?");
      params.push(Number(req.query.location_id));
    }

    if (req.query.month !== undefined && req.query.month !== "") {
      if (
        typeof req.query.month !== "string" ||
        req.query.month.trim().length > 20
      ) {
        return res.status(400).json({
          error: "Month must be text of at most 20 characters.",
        });
      }

      conditions.push("month = ?");
      params.push(req.query.month.trim());
    }

    let sql = `
      SELECT rainfall_id, location_id, year, month, rainfall_mm
      FROM rainfall_monthly_2018
    `;

    if (conditions.length) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += " ORDER BY location_id, year, rainfall_id";

    res.json(await query(sql, params));
  })
);

// ======================================================
// 10. ANNUAL RAINFALL HISTORY
// ======================================================

app.get(
  "/api/rainfall/annual",
  asyncRoute(async (req, res) => {
    const results = await query(
      "SELECT * FROM rainfall_annual_history"
    );

    res.json(results);
  })
);

// ======================================================
// 11. ROOFS — PRIVATE TO EACH USER
// ======================================================

function parseOptionalNonNegativeNumber(value, fieldName) {
  if (value === undefined) return { value: undefined };
  if (value === null || String(value).trim() === "") return { value: null };

  const number = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(number) || number < 0) {
    return { error: `${fieldName} must be a number zero or greater.` };
  }
  return { value: number };
}

function parseStorageTankLitres(value) {
  if (value === undefined) return { value: undefined };
  if (value === null || String(value).trim() === "") return { value: null };

  const number = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(number) || number <= 0) {
    return { error: "Tank capacity must be a number greater than zero." };
  }
  if (number > 100000000) {
    return { error: "Tank capacity is too large." };
  }
  return { value: number };
}

app.get(
  "/api/roofs",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const results = await query(
      `SELECT
         roof_id,
         user_id,
         roof_area_m2,
         roof_material,
         runoff_coefficient,
         storage_tank_litres,
         notes
       FROM roofs
       WHERE user_id = ?
       ORDER BY roof_id DESC`,
      [req.user.user_id]
    );

    res.json(results);
  })
);

app.post(
  "/api/roofs",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const {
      roof_area_m2,
      roof_material,
      runoff_coefficient,
      storage_tank_litres,
      notes,
    } = req.body || {};

    const areaResult = parseOptionalNonNegativeNumber(roof_area_m2, "Roof area");
    if (areaResult.error) return res.status(400).json({ error: areaResult.error });
    if (areaResult.value !== undefined && areaResult.value !== null && areaResult.value <= 0) {
      return res.status(400).json({ error: "Roof area must be greater than zero when provided." });
    }

    const coefficientResult = parseOptionalNonNegativeNumber(runoff_coefficient, "Runoff coefficient");
    if (coefficientResult.error) return res.status(400).json({ error: coefficientResult.error });
    if (
      coefficientResult.value !== undefined &&
      coefficientResult.value !== null &&
      (coefficientResult.value <= 0 || coefficientResult.value > 1)
    ) {
      return res.status(400).json({ error: "Runoff coefficient must be between 0 and 1." });
    }

    const capacityResult = parseStorageTankLitres(storage_tank_litres);
    if (capacityResult.error) return res.status(400).json({ error: capacityResult.error });

    let roofMaterial = null;
    if (roof_material !== undefined && roof_material !== null && String(roof_material).trim() !== "") {
      if (typeof roof_material !== "string" || roof_material.trim().length > 100) {
        return res.status(400).json({ error: "Roof material must be text of at most 100 characters." });
      }
      roofMaterial = roof_material.trim();
    }

    let roofNotes = null;
    if (notes !== undefined && notes !== null && String(notes).trim() !== "") {
      if (typeof notes !== "string") {
        return res.status(400).json({ error: "Notes must be text." });
      }
      roofNotes = notes.trim();
      if (roofNotes.length > 5000) {
        return res.status(400).json({ error: "Notes cannot exceed 5000 characters." });
      }
    }

    const [result] = await db.query(
      `INSERT INTO roofs (
         user_id,
         roof_area_m2,
         roof_material,
         runoff_coefficient,
         storage_tank_litres,
         notes
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.user_id,
        areaResult.value === undefined ? null : areaResult.value,
        roofMaterial,
        coefficientResult.value === undefined ? null : coefficientResult.value,
        capacityResult.value === undefined ? null : capacityResult.value,
        roofNotes,
      ]
    );

    return res.status(201).json({
      message: "Roof information saved successfully.",
      roof_id: result.insertId,
    });
  })
);

app.put(
  "/api/roofs/:id",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const roofId = req.params.id;
    if (!isPositiveInteger(roofId)) {
      return res.status(400).json({ error: "Please provide a valid roof ID." });
    }

    const existing = await query(
      "SELECT roof_id, roof_area_m2, roof_material, runoff_coefficient, storage_tank_litres, notes FROM roofs WHERE roof_id = ? AND user_id = ? LIMIT 1",
      [Number(roofId), req.user.user_id]
    );

    if (!existing.length) {
      return res.status(404).json({ error: "Roof record not found." });
    }

    const current = existing[0];
    const {
      roof_area_m2,
      roof_material,
      runoff_coefficient,
      storage_tank_litres,
      notes,
    } = req.body || {};

    const areaResult = parseOptionalNonNegativeNumber(roof_area_m2, "Roof area");
    if (areaResult.error) return res.status(400).json({ error: areaResult.error });
    if (areaResult.value !== undefined && areaResult.value !== null && areaResult.value <= 0) {
      return res.status(400).json({ error: "Roof area must be greater than zero when provided." });
    }

    const coefficientResult = parseOptionalNonNegativeNumber(runoff_coefficient, "Runoff coefficient");
    if (coefficientResult.error) return res.status(400).json({ error: coefficientResult.error });
    if (
      coefficientResult.value !== undefined &&
      coefficientResult.value !== null &&
      (coefficientResult.value <= 0 || coefficientResult.value > 1)
    ) {
      return res.status(400).json({ error: "Runoff coefficient must be between 0 and 1." });
    }

    const capacityResult = parseStorageTankLitres(storage_tank_litres);
    if (capacityResult.error) return res.status(400).json({ error: capacityResult.error });

    let roofMaterial = current.roof_material;
    if (roof_material !== undefined) {
      if (roof_material === null || String(roof_material).trim() === "") {
        roofMaterial = null;
      } else if (typeof roof_material !== "string" || roof_material.trim().length > 100) {
        return res.status(400).json({ error: "Roof material must be text of at most 100 characters." });
      } else {
        roofMaterial = roof_material.trim();
      }
    }

    let roofNotes = current.notes;
    if (notes !== undefined) {
      if (notes === null || String(notes).trim() === "") {
        roofNotes = null;
      } else if (typeof notes !== "string") {
        return res.status(400).json({ error: "Notes must be text." });
      } else {
        roofNotes = notes.trim();
        if (roofNotes.length > 5000) {
          return res.status(400).json({ error: "Notes cannot exceed 5000 characters." });
        }
      }
    }

    const nextArea = areaResult.value === undefined ? current.roof_area_m2 : areaResult.value;
    const nextCoefficient = coefficientResult.value === undefined ? current.runoff_coefficient : coefficientResult.value;
    const nextCapacity = capacityResult.value === undefined ? current.storage_tank_litres : capacityResult.value;

    await db.query(
      `UPDATE roofs
       SET roof_area_m2 = ?, roof_material = ?, runoff_coefficient = ?, storage_tank_litres = ?, notes = ?
       WHERE roof_id = ? AND user_id = ?`,
      [
        nextArea,
        roofMaterial,
        nextCoefficient,
        nextCapacity,
        roofNotes,
        Number(roofId),
        req.user.user_id,
      ]
    );

    return res.json({ message: "Roof information updated successfully." });
  })
);

// ======================================================
// 12. WATER DEMAND BENCHMARKS
// ======================================================

app.get(
  "/api/water-demand-benchmarks",
  asyncRoute(async (req, res) => {
    const results = await query(
      `SELECT *
       FROM water_demand_benchmarks
       ORDER BY benchmark_id`
    );

    res.json(results);
  })
);

// ======================================================
// 13. WATER RECORDS — LIST
// ======================================================

app.get(
  "/api/water-records",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const conditions = ["wr.user_id = ?"];
    const params = [req.user.user_id];

    if (req.query.type !== undefined && req.query.type !== "") {
      const type = String(req.query.type).trim().toLowerCase();

      if (!["collected", "used"].includes(type)) {
        return res.status(400).json({
          error: "Type must be collected or used.",
        });
      }

      conditions.push("wr.record_type = ?");
      params.push(type);
    }

    const fromResult = parseOptionalDate(req.query.from, "From date");
    const toResult = parseOptionalDate(req.query.to, "To date");

    if (fromResult.error) {
      return res.status(400).json({ error: fromResult.error });
    }

    if (toResult.error) {
      return res.status(400).json({ error: toResult.error });
    }

    if (
      fromResult.value &&
      toResult.value &&
      fromResult.value > toResult.value
    ) {
      return res.status(400).json({
        error: "From date cannot be later than to date.",
      });
    }

    if (fromResult.value) {
      conditions.push("wr.record_date >= ?");
      params.push(fromResult.value);
    }

    if (toResult.value) {
      conditions.push("wr.record_date <= ?");
      params.push(toResult.value);
    }

    const selectWithCategory = `
      SELECT
         wr.record_id,
         wr.record_date,
         wr.record_type,
         wr.volume_litres,
         wr.usage_category,
         wr.location_id,
         l.station_name,
         wr.notes,
         wr.created_at
       FROM water_records AS wr
       LEFT JOIN locations AS l
         ON wr.location_id = l.location_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY wr.record_date DESC, wr.record_id DESC`;

    const selectWithoutCategory = `
      SELECT
         wr.record_id,
         wr.record_date,
         wr.record_type,
         wr.volume_litres,
         NULL AS usage_category,
         wr.location_id,
         l.station_name,
         wr.notes,
         wr.created_at
       FROM water_records AS wr
       LEFT JOIN locations AS l
         ON wr.location_id = l.location_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY wr.record_date DESC, wr.record_id DESC`;

    let results;
    try {
      results = await query(selectWithCategory, params);
    } catch (error) {
      if (error && error.code === "ER_BAD_FIELD_ERROR") {
        results = await query(selectWithoutCategory, params);
      } else {
        throw error;
      }
    }

    res.json(results);
  })
);

// ======================================================
// 14. WATER RECORDS — CREATE
// ======================================================

app.post(
  "/api/water-records",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const {
      record_date,
      record_type,
      volume_litres,
      location_id,
      notes,
      usage_category,
    } = req.body || {};

    if (!isValidDate(record_date)) {
      return res.status(400).json({
        error: "Record date must use YYYY-MM-DD format.",
      });
    }

    if (
      typeof record_type !== "string" ||
      !["collected", "used"].includes(record_type)
    ) {
      return res.status(400).json({
        error: "Record type must be collected or used.",
      });
    }

    const volumeResult = parsePositiveNumber(
      volume_litres,
      "Water volume"
    );

    if (volumeResult.error) {
      return res.status(400).json({
        error: volumeResult.error,
      });
    }

    let usageCategory = null;

    if (record_type === "used") {
      if (
        typeof usage_category !== "string" ||
        !WATER_USAGE_CATEGORIES.includes(usage_category.trim())
      ) {
        return res.status(400).json({
          error:
            "Usage category is required for used water records and must be one of: " +
            WATER_USAGE_CATEGORIES.join(", ") +
            ".",
        });
      }

      usageCategory = usage_category.trim();
    } else if (
      usage_category !== undefined &&
      usage_category !== null &&
      String(usage_category).trim() !== ""
    ) {
      return res.status(400).json({
        error: "Usage category applies only to used water records.",
      });
    }

    let locationId = null;

    if (
      location_id !== undefined &&
      location_id !== null &&
      location_id !== ""
    ) {
      if (!isPositiveInteger(location_id)) {
        return res.status(400).json({
          error: "Location ID must be a valid positive integer.",
        });
      }

      locationId = Number(location_id);

      const locations = await query(
        "SELECT location_id FROM locations WHERE location_id = ?",
        [locationId]
      );

      if (!locations.length) {
        return res.status(400).json({
          error: "The selected monitoring location does not exist.",
        });
      }
    }

    let recordNotes = null;

    if (notes !== undefined && notes !== null) {
      if (typeof notes !== "string") {
        return res.status(400).json({
          error: "Notes must be text.",
        });
      }

      recordNotes = notes.trim() || null;

      if (recordNotes && recordNotes.length > 5000) {
        return res.status(400).json({
          error: "Notes cannot exceed 5000 characters.",
        });
      }
    }

    let result;
    try {
      result = await db.query(
        `INSERT INTO water_records (
           user_id,
           record_date,
           record_type,
           volume_litres,
           usage_category,
           location_id,
           notes
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.user_id,
          record_date,
          record_type,
          volumeResult.value,
          usageCategory,
          locationId,
          recordNotes,
        ]
      );
    } catch (error) {
      if (error && error.code === "ER_BAD_FIELD_ERROR") {
        if (usageCategory !== null) {
          return res.status(503).json({
            error:
              "Usage categories are not available in the database yet. Please run the safe schema migration and try again.",
          });
        }

        result = await db.query(
          `INSERT INTO water_records (
             user_id,
             record_date,
             record_type,
             volume_litres,
             location_id,
             notes
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            req.user.user_id,
            record_date,
            record_type,
            volumeResult.value,
            locationId,
            recordNotes,
          ]
        );
      } else {
        throw error;
      }
    }

    return res.status(201).json({
      message: "Water record saved successfully.",
      record_id: result[0].insertId,
    });
  })
);

// ======================================================
// 15. WATER RECORDS — DELETE OWN RECORD ONLY
// ======================================================

app.delete(
  "/api/water-records/:id",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const recordId = req.params.id;

    if (!isPositiveInteger(recordId)) {
      return res.status(400).json({
        error: "Please provide a valid record ID.",
      });
    }

    const [result] = await db.query(
      `DELETE FROM water_records
       WHERE record_id = ? AND user_id = ?`,
      [Number(recordId), req.user.user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "Water record not found.",
      });
    }

    res.json({
      message: "Water record deleted successfully.",
    });
  })
);

// ======================================================
// 16. DASHBOARD SUMMARY
// ======================================================

app.get(
  "/api/dashboard/summary",
  ...authenticated,
  asyncRoute(async (req, res) => {
    const userId = req.user.user_id;

    const [summaryRows, roofRows, rainfallAvgRows] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*) FROM provinces) AS provinces,
           (SELECT COUNT(*) FROM districts) AS districts,
           (SELECT COUNT(*) FROM locations) AS locations,
           (SELECT COUNT(*) FROM rainfall_monthly_2018)
             AS rainfall_records,
           (SELECT COUNT(DISTINCT year)
            FROM rainfall_monthly_2018) AS years_available,
           (SELECT COUNT(*)
            FROM roofs
            WHERE user_id = ?) AS user_roofs,
           (SELECT COUNT(*)
            FROM water_records
            WHERE user_id = ?) AS user_water_records,
           (SELECT COALESCE(SUM(volume_litres), 0)
            FROM water_records
            WHERE user_id = ? AND record_type = 'collected')
             AS total_collected_litres,
           (SELECT COALESCE(SUM(volume_litres), 0)
            FROM water_records
            WHERE user_id = ? AND record_type = 'used')
             AS total_used_litres`,
        [userId, userId, userId, userId]
      ),
      query(
        `SELECT roof_area_m2, runoff_coefficient
         FROM roofs
         WHERE user_id = ?`,
        [userId]
      ),
      query(
        `SELECT AVG(station_total) AS avg_annual_rainfall_mm
         FROM (
           SELECT location_id, SUM(rainfall_mm) AS station_total
           FROM rainfall_monthly_2018
           WHERE year = 2018
           GROUP BY location_id
         ) AS station_totals`
      ),
    ]);

    const summary = summaryRows[0] || {};
    const avgAnnualRainfall = Number(rainfallAvgRows[0]?.avg_annual_rainfall_mm);
    const COLLECTION_EFFICIENCY = 0.9;

    let estimatedCollectionLitres = null;
    const hasRoofData = Array.isArray(roofRows) && roofRows.some((r) => {
      const area = Number(String(r.roof_area_m2 ?? "").replace(/,/g, ""));
      const coeff = Number(String(r.runoff_coefficient ?? "").replace(/,/g, ""));
      return Number.isFinite(area) && area > 0 && Number.isFinite(coeff) && coeff > 0;
    });

    if (hasRoofData && Number.isFinite(avgAnnualRainfall) && avgAnnualRainfall > 0) {
      estimatedCollectionLitres = roofRows.reduce((total, roof) => {
        const area = Number(String(roof.roof_area_m2 ?? "").replace(/,/g, ""));
        const coeff = Number(String(roof.runoff_coefficient ?? "").replace(/,/g, ""));
        if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(coeff) || coeff <= 0) {
          return total;
        }
        return total + (area * avgAnnualRainfall * coeff * COLLECTION_EFFICIENCY);
      }, 0);
    }

    const totalCollected = Number(summary.total_collected_litres || 0);
    const totalUsed = Number(summary.total_used_litres || 0);

    let selfSufficiencyPercent = null;
    if (Number.isFinite(totalUsed) && totalUsed > 0 && Number.isFinite(totalCollected) && totalCollected >= 0) {
      selfSufficiencyPercent = (totalCollected / totalUsed) * 100;
    }

    res.json({
      ...summary,
      estimated_collection_litres: estimatedCollectionLitres,
      estimated_collection_basis:
        estimatedCollectionLitres !== null
          ? "Annual potential based on user roof area, runoff coefficient, 90% collection efficiency, and average 2018 station annual rainfall."
          : null,
      avg_annual_rainfall_mm_2018: Number.isFinite(avgAnnualRainfall) ? avgAnnualRainfall : null,
      self_sufficiency_percent: selfSufficiencyPercent,
      self_sufficiency_basis:
        selfSufficiencyPercent !== null
          ? "All-time recorded collected water / all-time recorded used water × 100. This is a recorded-water ratio proxy, not demand-based self-sufficiency; records may cover different periods."
          : null,
    });
  })
);

// ======================================================
// 17. API NOT FOUND
// ======================================================

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found",
    requestedUrl: req.originalUrl,
  });
});

// ======================================================
// 18. GLOBAL ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    Object.prototype.hasOwnProperty.call(err, "body")
  ) {
    return res.status(400).json({
      error: "Invalid JSON request body.",
    });
  }

  console.error(
    "Unhandled server error:",
    err.code || err.message
  );

  return res.status(500).json({
    error: "An unexpected server error occurred.",
  });
});

// ======================================================
// 19. START SERVER
// ======================================================

async function startServer() {
  try {
    await db.query("SELECT 1");

    console.log(`Connected to ${DB_NAME} database!`);

    await ensureSafeSchemaMigrations();

    console.log("Allowed frontend origins:", ALLOWED_ORIGINS);

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(
      "Could not connect to MySQL:",
      error.code || error.message
    );

    console.error(
      "Check backend/.env, Aiven connection details, and CA certificate."
    );

    process.exitCode = 1;
  }
}

startServer();
