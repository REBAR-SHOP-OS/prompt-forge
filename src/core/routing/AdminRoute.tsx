import { Navigate } from "react-router-dom";
import { useAuth } from "@/core/auth/AuthProvider";
import LoadingScreen from "@/core/ui/LoadingScreen";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== "admin") return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
