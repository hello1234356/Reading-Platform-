import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Discover from "./pages/Discover";
import BookClubs from "./pages/BookClubs";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main style={{ padding: "24px" }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/clubs" element={<BookClubs />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;