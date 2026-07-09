import { Component } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Discover from "./pages/Discover";
import BookClubs from "./pages/BookClubs";

function DiscoverRoute() {
  const location = useLocation();

  return <Discover key={location.search} />;
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
          <p className="eyebrow">Preview interrupted</p>
          <h1>The Reading Room could not load.</h1>
          <p>
            Refresh the preview. If it stays here, check the browser console for
            the first React error.
          </p>
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
        <div className="app-shell">
          <Navbar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/discover" element={<DiscoverRoute />} />
              <Route path="/clubs" element={<BookClubs />} />
              <Route path="/clubs/:clubId" element={<BookClubs />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AppErrorBoundary>
  );
}

export default App;
