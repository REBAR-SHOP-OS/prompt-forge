import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listJobsTool from "./tools/list-jobs";
import getJobTool from "./tools/get-job";
import listVideosTool from "./tools/list-videos";
import getCreditBalanceTool from "./tools/get-credit-balance";

// The OAuth issuer MUST be the direct Supabase host, built from the project ref
// (never from SUPABASE_URL, which may be a proxy host). Vite inlines this literal
// at build time, keeping the entry import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "prompt-forge-mcp",
  title: "Prompt Forge MCP",
  version: "0.1.0",
  instructions:
    "Tools for Prompt Forge, an AI video generation platform. Read the signed-in user's generation jobs, generated videos, and credit balance. Use list_jobs and get_job to inspect job status, list_videos for finished assets, and get_credit_balance for quota usage.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listJobsTool, getJobTool, listVideosTool, getCreditBalanceTool],
});
