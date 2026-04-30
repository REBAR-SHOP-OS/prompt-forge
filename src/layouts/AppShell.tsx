import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/core/auth/AuthProvider";
import UserBadge from "@/core/ui/UserBadge";

export default function AppShell() {
  const { signOut, profile } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/app" className="font-semibold tracking-tight">Prompt → Video</Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <NavLink to="/app" className={({ isActive }) => isActive ? "text-foreground" : "hover:text-foreground"}>
                Dashboard
              </NavLink>
              {profile?.role === "admin" && (
                <NavLink to="/admin" className={({ isActive }) => isActive ? "text-foreground" : "hover:text-foreground"}>
                  Admin
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <UserBadge />
            <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
