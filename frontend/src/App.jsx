import { useState } from "react";

import {
  LayoutDashboard,
  CloudRain,
  Calculator,
  Droplets,
  Database,
  FileText,
  LogIn,
  LogOut,
  Menu,
  Waves,
  Home,
  Info,
} from "lucide-react";

import {
  getAuthToken,
  clearAuthToken,
} from "./services/api";

import Dashboard from "./pages/Dashboard";
import RainfallData from "./pages/RainfallData";
import CollectionCalculator from "./pages/CollectionCalculator";
import WaterRecords from "./pages/WaterRecords";
import Storage from "./pages/Storage";
import Reports from "./pages/Reports";
import Login from "./pages/Login";

// ======================================================
// PUBLIC NAVIGATION
// ======================================================

const publicNavigation = [
  { label: "Home", icon: Home },
  { label: "Rainfall Data", icon: CloudRain },
  { label: "Collection Calculator", icon: Calculator },
  { label: "About", icon: Info },
];

// ======================================================
// PRIVATE NAVIGATION
// ======================================================

const privateNavigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Rainfall Data", icon: CloudRain },
  { label: "Collection Calculator", icon: Calculator },
  { label: "Water Records", icon: Droplets },
  { label: "Storage", icon: Database },
  { label: "Reports", icon: FileText },
];

// ======================================================
// PRIVATE PAGE COMPONENTS
// ======================================================

const privatePages = {
  Dashboard,
  "Water Records": WaterRecords,
  Storage,
  Reports,
};

// ======================================================
// MAIN APP
// ======================================================

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => Boolean(getAuthToken())
  );

  // The website always starts on Home when logged out.
  const [activePage, setActivePage] = useState(
    () => (getAuthToken() ? "Dashboard" : "Home")
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ====================================================
  // LOGIN SUCCESS
  // ====================================================

  function handleLoginSuccess(token) {
    if (!token) return;

    setIsAuthenticated(true);
    setActivePage("Dashboard");
    setSidebarOpen(false);
  }

  // ====================================================
  // LOGOUT
  // ====================================================

  function handleLogout() {
    clearAuthToken();
    setIsAuthenticated(false);
    setActivePage("Home");
    setSidebarOpen(false);
  }

  // ====================================================
  // NAVIGATION
  // ====================================================

  function handleNavigation(label) {
    // Public pages do not require login.
    if (
      label === "Home" ||
      label === "Rainfall Data" ||
      label === "Collection Calculator" ||
      label === "About"
    ) {
      setActivePage(label);
      setSidebarOpen(false);
      return;
    }

    // Only private pages require authentication.
    if (!isAuthenticated) {
      setActivePage("Login");
      setSidebarOpen(false);
      return;
    }

    setActivePage(label);
    setSidebarOpen(false);
  }

  // ====================================================
  // PUBLIC PAGES
  // ====================================================

  function renderPublicPage() {
    if (activePage === "Rainfall Data") {
      return <RainfallData />;
    }

    if (activePage === "Collection Calculator") {
      return <CollectionCalculator />;
    }

    if (activePage === "About") {
      return (
        <div className="public-page">
          <div className="public-hero">
            <span className="topbar-eyebrow">
              ABOUT THE PROJECT
            </span>

            <h1>Rainwater Nepal</h1>

            <p>
              A Rainwater Collection and Usage Management System
              designed to help users explore rainfall information,
              estimate rainwater harvesting potential, and understand
              water collection and usage.
            </p>
          </div>

          <div className="public-card-grid">
            <article className="public-card">
              <CloudRain size={28} />
              <h3>Rainfall Information</h3>
              <p>
                Explore available rainfall data for locations
                represented in the system.
              </p>
            </article>

            <article className="public-card">
              <Calculator size={28} />
              <h3>Harvesting Estimates</h3>
              <p>
                Estimate potential rainwater collection using
                rainfall and roof information.
              </p>
            </article>

            <article className="public-card">
              <Droplets size={28} />
              <h3>Water Management</h3>
              <p>
                Registered users can manage their own collection
                and water usage records.
              </p>
            </article>
          </div>
        </div>
      );
    }

    // Home page
    return (
      <div className="public-page">
        <section className="public-hero">
          <span className="hero-tag">
            RAINWATER MANAGEMENT FOR NEPAL
          </span>

          <h1>
            Every Drop Counts.
            <br />
            <span>Make Rainwater Useful.</span>
          </h1>

          <p>
            Explore rainfall information, estimate your rainwater
            harvesting potential, and learn how collected rainwater
            can support better water management.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => handleNavigation("Rainfall Data")}
            >
              <CloudRain size={18} />
              Explore Rainfall
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                handleNavigation("Collection Calculator")
              }
            >
              <Calculator size={18} />
              Calculate Collection
            </button>
          </div>
        </section>

        <section className="public-section">
          <div className="section-heading">
            <span className="topbar-eyebrow">
              WHAT YOU CAN DO
            </span>

            <h2>Explore the system</h2>

            <p>
              Start with public information, then sign in if you
              want to manage your personal water records.
            </p>
          </div>

          <div className="public-card-grid">
            <article className="public-card">
              <div className="public-card-icon">
                <CloudRain size={25} />
              </div>

              <h3>Rainfall Data</h3>

              <p>
                Browse the rainfall information available in
                the system.
              </p>

              <button
                type="button"
                className="text-button"
                onClick={() => handleNavigation("Rainfall Data")}
              >
                View rainfall →
              </button>
            </article>

            <article className="public-card">
              <div className="public-card-icon">
                <Calculator size={25} />
              </div>

              <h3>Collection Calculator</h3>

              <p>
                Explore potential rainwater collection using
                the calculator.
              </p>

              <button
                type="button"
                className="text-button"
                onClick={() =>
                  handleNavigation("Collection Calculator")
                }
              >
                Open calculator →
              </button>
            </article>

            <article className="public-card">
              <div className="public-card-icon">
                <Droplets size={25} />
              </div>

              <h3>Personal Water Management</h3>

              <p>
                Sign in to access your dashboard, collection
                records, usage records, and storage information.
              </p>

              <button
                type="button"
                className="text-button"
                onClick={() => handleNavigation("Login")}
              >
                Sign in →
              </button>
            </article>
          </div>
        </section>
      </div>
    );
  }

  // ====================================================
  // CURRENT PAGE
  // ====================================================

  let pageContent;

  if (activePage === "Login") {
    pageContent = (
      <Login onLoginSuccess={handleLoginSuccess} />
    );
  } else if (!isAuthenticated) {
    pageContent = renderPublicPage();
  } else {
    // Authenticated users can use private pages.
    const PrivatePage = privatePages[activePage];

    if (PrivatePage) {
      pageContent = <PrivatePage />;
    } else if (activePage === "Rainfall Data") {
      pageContent = <RainfallData />;
    } else if (activePage === "Collection Calculator") {
      pageContent = <CollectionCalculator />;
    } else {
      pageContent = renderPublicPage();
    }
  }

  // ====================================================
  // NAVIGATION MENU
  // ====================================================

  const navigation = isAuthenticated
    ? privateNavigation
    : publicNavigation;

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${
          sidebarOpen ? "sidebar-open" : ""
        }`}
      >
        <button
          type="button"
          className="brand brand-button"
          onClick={() => {
            setActivePage(
              isAuthenticated ? "Dashboard" : "Home"
            );
            setSidebarOpen(false);
          }}
        >
          <div className="brand-icon">
            <Waves size={25} />
          </div>

          <div>
            <strong>Rainwater Nepal</strong>
            <small>Collection &amp; Usage System</small>
          </div>
        </button>

        <p className="nav-heading">
          {isAuthenticated ? "MAIN MENU" : "EXPLORE"}
        </p>

        <nav className="navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className={`nav-item ${
                activePage === label ? "active" : ""
              }`}
              onClick={() => handleNavigation(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot" />
          <span>Rainwater Nepal Project</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu icon-button"
            onClick={() =>
              setSidebarOpen((open) => !open)
            }
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu size={22} />
          </button>

          <div>
            <span className="topbar-eyebrow">
              RAINWATER MANAGEMENT
            </span>

            <h2>{activePage}</h2>
          </div>

          <div className="topbar-actions">
            <div className="topbar-badge">Nepal</div>

            {isAuthenticated ? (
              <button
                type="button"
                className="icon-button"
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut size={19} />
              </button>
            ) : (
              <button
                type="button"
                className="login-button"
                onClick={() => {
                  setActivePage("Login");
                  setSidebarOpen(false);
                }}
              >
                <LogIn size={17} />
                Login
              </button>
            )}
          </div>
        </header>

        <section className="page-content">
          {pageContent}
        </section>

        <footer className="app-footer">
          Rainwater Collection and Usage Management System
          {" · "}
          College Project
        </footer>
      </main>
    </div>
  );
}