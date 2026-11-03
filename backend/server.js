
"use strict";

require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const DB_NAME = process.env.DB_NAME || "rainwater_nepal";
const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

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
    origin: FRONTEND_URL.split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "100kb" }));

// ======================================================
// 2. DATABASE
// ======================================================

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "Z",
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

// ======================================================
// 3. VALIDATION HELPERS
// ======================================================

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
// 6. LOGIN
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

    const results = await query(
      `SELECT
         wr.record_id,
         wr.record_date,
         wr.record_type,
         wr.volume_litres,
         wr.location_id,
         l.station_name,
         wr.notes,
         wr.created_at
       FROM water_records AS wr
       LEFT JOIN locations AS l
         ON wr.location_id = l.location_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY wr.record_date DESC, wr.record_id DESC`,
      params
    );

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

    const result = await db.query(
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
    const results = await query(
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
      [
        req.user.user_id,
        req.user.user_id,
        req.user.user_id,
        req.user.user_id,
      ]
    );

    res.json(results[0]);
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

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(
      "Could not connect to MySQL:",
      error.code || error.message
    );

    console.error(
      "Check backend/.env and make sure MySQL is running."
    );

    process.exitCode = 1;
  }
}

startServer();
