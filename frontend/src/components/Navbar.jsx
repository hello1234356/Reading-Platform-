import { NavLink } from "react-router-dom";

function Navbar() {
  return (
    <nav style={{ display: "flex", gap: "16px", padding: "16px", borderBottom: "1px solid #ddd" }}>
      <NavLink to="/">Home</NavLink>
      <NavLink to="/discover">Discover</NavLink>
      <NavLink to="/clubs">Book Clubs</NavLink>
      <NavLink to="/profile">Profile</NavLink>
      <NavLink to="/login">Login</NavLink>
    </nav>
  );
}

export default Navbar;