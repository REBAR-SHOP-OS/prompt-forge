import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/core/auth/AuthProvider";
import LoadingScreen from "@/core/ui/LoadingScreen";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
