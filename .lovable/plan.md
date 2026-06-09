## Goal
Create a new user account so `sattar@rebar.shop` can sign in immediately.

## What I'll do
1. Use the backend admin API to create the auth user with:
   - Email: `sattar@rebar.shop`
   - Password: `Ilovers2025@$$`
   - Email auto-confirmed (so no verification email is needed and they can log in right away).
2. The existing `handle_new_user` database trigger will automatically:
   - Create the matching row in `core_user_profiles`.
   - Assign the default `user` role in `user_roles`.
3. Verify the account exists and the profile/role rows were created.

## Notes
- No code or schema changes are required — this is a one-time data action against the auth system.
- If you also want this user to be an **admin**, tell me and I'll add the `admin` role after creation.
