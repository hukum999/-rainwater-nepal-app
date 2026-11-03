import { useState } from "react";
import {
  LockKeyhole,
  Mail,
  LogIn,
  Droplets,
  LoaderCircle,
} from "lucide-react";
import { apiPost, setAuthToken } from "../services/api";

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError("Please enter both your email and password.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiPost("/api/auth/login", {
        email: cleanEmail,
        password,
      });

      if (!response?.token || !response?.user) {
        throw new Error(
          "The server returned an incomplete login response."
        );
      }

      setAuthToken(response.token);

      setSuccess(
        `Welcome${response.user.name ? `, ${response.user.name}` : ""}! Login successful.`
      );

      setPassword("");

      if (typeof onLoginSuccess === "function") {
        onLoginSuccess(response.user);
      }
    } catch (err) {
      setError(err.message || "Unable to log in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-intro">
        <h1>Welcome Back</h1>
        <p>
          Sign in to access your Rainwater Collection and Usage
          Management System.
        </p>
      </div>

      <section
        className="panel login-panel"
        style={{ maxWidth: 480, margin: "0 auto" }}
      >
        <div className="login-heading">
          <div className="login-icon">
            <Droplets size={30} />
          </div>

          <h3>Account Access</h3>

          <p className="panel-subtitle">
            Enter your registered email and password.
          </p>
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="notice success" role="status">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-email">Email Address</label>

            <div className="input-with-icon">
              <Mail size={18} aria-hidden="true" />

              <input
                id="login-email"
                name="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                maxLength={150}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>

            <div className="input-with-icon">
              <LockKeyhole size={18} aria-hidden="true" />

              <input
                id="login-password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                maxLength={1024}
                required
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderCircle
                  size={18}
                  className="login-spinner"
                />
                Signing in...
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <LockKeyhole size={15} />
          <span>
            Your password is verified securely by the backend.
          </span>
        </div>
      </section>
    </>
  );
}