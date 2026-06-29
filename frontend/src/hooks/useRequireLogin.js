import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function useRequireLogin() {
  const navigate = useNavigate();
  const { isLoggedIn, loading, user } = useAuth();

  function requireLogin() {
    if (loading) return false;

    if (!isLoggedIn) {
      navigate("/login");
      return false;
    }

    return true;
  }

  return { requireLogin, isLoggedIn, loading, user };
}