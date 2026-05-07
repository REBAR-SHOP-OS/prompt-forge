import { useAuth } from "@/core/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";

export default function UserBadge() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-foreground">{profile.email}</span>
      <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
        {profile.role}
      </Badge>
    </div>
  );
}
