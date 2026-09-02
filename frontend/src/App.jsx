import { Component } from "react";
import { HashRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Discover from "./pages/Discover";
import BookClubs from "./pages/BookClubs";
import Admin from "./pages/Admin";
import RecommendationPost from "./pages/RecommendationPost";
import { useAuth } from "./hooks/useAuth";
import { PublicProfileProvider } from "./context/PublicProfileContext";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";

function DiscoverRoute() {
  const location = useLocation();

  return <Discover key={location.search} />;
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { isLoggedIn, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <main className="error-panel">
        <p className="eyebrow">{t("app.checkingAccount")}</p>
        <h1>{t("app.openingRoom")}</h1>
      </main>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-panel">
          <p className="eyebrow">{i18n.t("app.previewInterrupted")}</p>
          <h1>{i18n.t("app.loadFailed")}</h1>
          <p>{i18n.t("app.refreshHelp")}</p>
        </main>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <HashRouter>
        <PublicProfileProvider>
          <div className="app-shell">
            <Navbar />

            <main className="app-main">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/post/:postId" element={<Home />} />
                <Route path="/login" element={<Login />} />

                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/profile/shelves/:shelfSlug"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/discover"
                  element={<DiscoverRoute />}
                />

                <Route
                  path="/discover/lists/:listSlug"
                  element={<RecommendationPost />}
                />

                <Route
                  path="/clubs"
                  element={
                    <ProtectedRoute>
                      <BookClubs />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/clubs/:clubId"
                  element={
                    <ProtectedRoute>
                      <BookClubs />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <Admin />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<Home />} />
              </Routes>
            </main>
          </div>
        </PublicProfileProvider>
      </HashRouter>
    </AppErrorBoundary>
  );
}

export default App;
