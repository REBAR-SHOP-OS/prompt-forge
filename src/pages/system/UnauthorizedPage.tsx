import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view this page.
        </p>
        <Button asChild variant="outline"><Link to="/app">Back to dashboard</Link></Button>
      </div>
    </div>
  );
}
