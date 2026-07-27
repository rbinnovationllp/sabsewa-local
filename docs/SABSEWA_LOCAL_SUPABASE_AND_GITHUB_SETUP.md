# SabSewa-Local Supabase And GitHub Setup

## Supabase Decision

Use a separate Supabase project named **SabSewa-Local**.

The current local code had been pointing to the old combined Supabase project ref:

```text
fpzvqnlbxegwebjvzjgz
```

That ref is shared with the old `C:\Users\HP\sabsewa\mobile` combined app and should not be used for the independent SabSewa Local production database.

## Supabase Steps

1. Open Supabase Dashboard.
2. Under the `rbinnovationllp` account, create a new project named `SabSewa-Local`.
3. Copy the new project ref, URL, anon key, and service-role key.
4. From PowerShell:

```powershell
cd C:\Users\HP\SabSewa-Local
supabase login
supabase link --project-ref YOUR_NEW_SABSEWA_LOCAL_PROJECT_REF
supabase db push
```

5. Update:

```text
C:\Users\HP\SabSewa-Local\mobile\.env
C:\Users\HP\SabSewa-Local\mobile\server\.env
```

6. Confirm the new dashboard contains only SabSewa Local tables.

## GitHub Decision

Create a GitHub repository named:

```text
SabSewa-Local
```

Do not create a repository/account named:

```text
SabSewa-Alert
```

I cannot create a new GitHub user account from here. If you already have a GitHub account, create a repository named `SabSewa-Local`, then run:

```powershell
cd C:\Users\HP\SabSewa-Local
git init
git add .
git commit -m "Initial SabSewa Local mobile app"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/SabSewa-Local.git
git push -u origin main
```

Before pushing, make sure real `.env` files are ignored and not committed.
