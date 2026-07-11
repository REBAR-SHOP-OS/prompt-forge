# Prompt Forge — CLAUDE.md
# Agent: forge-agent | Branch: agent/forge-agent

## Purpose
AI video generation platform -- prompt building, job orchestration, credit management.
Integrates Wan/Flow providers for video generation and local LLM planning.

## Repo
Path: C:\Users\SattarEsmaeili\Documents\Codex\prompt-forge
GitHub: github.com/REBAR-SHOP-OS/prompt-forge
Live: prompt-forge.lovable.app
Stack: React + Vite + TypeScript + Supabase

## Modules
- admin-monitor -- system monitoring
- credit-management -- credit tracking and allocation
- external-api-adapter -- Wan/Flow provider integration
- generator-ui -- prompt builder, scenario writer UI
- job-orchestrator -- job lifecycle management and progress tracking
- video-library -- generated video storage and retrieval

## Agent responsibilities (forge-agent)
1. Monitor job queue -- pick up pending jobs and trigger generation
2. Credit validation -- check balance before job creation
3. Provider routing -- select Wan vs Flow based on job type
4. Error recovery -- retry failed jobs, surface errors to admin
5. Metadata indexing -- update video-library after successful generation

## Critical rules
- TSC must be clean before pushing
- Work on a scoped branch, run the repo checks, and open/update a DRAFT PR. Only
  Sattar may mark ready, approve, merge, or publish through Lovable Cloud.
- Do not touch credit ledger directly -- use credit-management module API
- Provider API keys are in Supabase secrets -- never hardcode

## Build commands
bun install && bun run dev
bun run tsc --noEmit
bun run build
