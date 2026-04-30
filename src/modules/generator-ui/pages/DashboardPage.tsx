import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/core/auth/AuthProvider";
import RoutePreviewCard from "@/modules/generator-ui/components/RoutePreviewCard";

export default function DashboardPage() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome, {profile?.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credit balance</CardTitle>
            <CardDescription>Used by future generation jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{profile?.credits_balance ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generation</CardTitle>
            <CardDescription>Generation modules ship in later phases.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon: prompt → video pipeline, library, downloads.</p>
          </CardContent>
        </Card>
      </div>

      <RoutePreviewCard />
    </div>
  );
}
