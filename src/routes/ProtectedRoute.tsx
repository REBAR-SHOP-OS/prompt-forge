import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";
import LoadingScreen from "@/components/system/LoadingScreen";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
