
import { useState } from "react";
import {
  User,
  Mail,
  LockKeyhole,
  UserPlus,
  Droplets,
  LoaderCircle,
} from "lucide-react";

import { apiPost, setAuthToken } from "../services/api";

export default function Signup({
  onSignupSuccess,
  onNavigateToLogin,
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    // Required field validation
    if (!cleanName || !cleanEmail || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    // Name validation
    if (cleanName.length > 150) {
      setError("Name must not exceed 150 characters.");
      return;
    }

    // Email validation
    if (
      cleanEmail.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      setError("Please enter a valid email address.");
      return;
    }

    // Password validation
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password.length > 1024) {
      setError("Password is too long.");
      return;
    }

    // Confirm password validation
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // Register new account using the backend API
      const response = await apiPost("/api/auth/register", {
        name: cleanName,
        email: cleanEmail,
        password,
      });

      if (!response?.token || !response?.user) {
        throw new Error(
          "The server returned an incomplete registration response."
        );
      }

      // Save authentication token
      setAuthToken(response.token);

      // Clear password fields
      setPassword("");
      setConfirmPassword("");

      // Automatically log in after successful registration
      if (typeof onSignupSuccess === "function") {
        onSignupSuccess(response.user);
      }
    } catch (err) {
      setError(
        err.message || "Unable to create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-intro">
        <h1>Create Your Account</h1>
        <p>
          Register to access your Rainwater Collection and
          Usage Management System.
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

          <h3>Join Rainwater Nepal</h3>

          <p className="panel-subtitle">
            Enter your details to create a new account.
          </p>
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="signup-name">Full Name</label>

            <div className="input-with-icon">
              <User size={18} aria-hidden="true" />

              <input
                id="signup-name"
                name="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={150}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="signup-email">Email Address</label>

            <div className="input-with-icon">
              <Mail size={18} aria-hidden="true" />

              <input
                id="signup-email"
                name="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={150}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="signup-password">Password</label>

            <div className="input-with-icon">
              <LockKeyhole size={18} aria-hidden="true" />

              <input
                id="signup-password"
                name="password"
                type="password"
                placeholder="Create a password (minimum 8 characters)"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label htmlFor="signup-confirm-password">
              Confirm Password
            </label>

            <div className="input-with-icon">
              <LockKeyhole size={18} aria-hidden="true" />

              <input
                id="signup-confirm-password"
                name="confirmPassword"
                type="password"
                placeholder="Enter your password again"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Submit */}
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
                Creating account...
              </>
            ) : (
              <>
                <UserPlus size={18} />
                Create Account
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <LockKeyhole size={15} />
          <span>
            Your password is securely encrypted before being stored.
          </span>
        </div>

        <div className="signup-switch">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onNavigateToLogin}
            disabled={loading}
          >
            Sign In
          </button>
        </div>
      </section>
    </>
  );
}
