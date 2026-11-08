"use strict";

// ======================================================
// 1. API CONFIGURATION
// ======================================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5000"
    : "https://rainwater-nepal-app.onrender.com")
).replace(/\/+$/, "");

const TOKEN_KEY = "rainwater_token";

// ======================================================
// 2. AUTHENTICATION HELPERS
// ======================================================

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("A valid authentication token is required.");
  }

  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ======================================================
// 3. COMMON API REQUEST HANDLER
// ======================================================

async function apiRequest(path, options = {}) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("API path must start with '/'.");
  }

  const headers = {
    Accept: "application/json",
    ...options.headers,
  };

  const token = getAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Cannot connect to the Rainwater Nepal server. " +
      "Please check your internet connection or backend server."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  let data = null;

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid JSON response.");
    }
  } else {
    const responseText = await response.text();
    data = responseText ? { message: responseText } : null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed with status ${response.status}.`
    );
  }

  return data;
}

// ======================================================
// 4. GET — RETRIEVE DATA
// ======================================================

export function apiGet(path) {
  return apiRequest(path, {
    method: "GET",
  });
}

// ======================================================
// 5. POST — CREATE OR CALCULATE
// ======================================================

export function apiPost(path, body) {
  return apiRequest(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ======================================================
// 6. PUT — UPDATE DATA
// ======================================================

export function apiPut(path, body) {
  return apiRequest(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ======================================================
// 7. DELETE — REMOVE A RECORD
// ======================================================

export function apiDelete(path) {
  return apiRequest(path, {
    method: "DELETE",
  });
}