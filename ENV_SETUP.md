# Environment Variables Setup Guide

This document describes all environment variables needed to run the Reddit Ops Planner.

## Quick Start

1. Create a `.env.local` file in the project root
2. Copy the variables below and fill in your values
3. For Supabase Edge Functions, set secrets in the Supabase Dashboard

## Required Environment Variables

### Supabase (Client-Side)

These are exposed to the browser and are safe to commit (if using public anon key):

```bash
# Public URL of your Supabase project
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co

# Public anon key (safe to expose in client-side code)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Where to find:**
- Supabase Dashboard → Project Settings → API → Project URL
- Supabase Dashboard → Project Settings → API → Project API keys → `anon` `public`

### Supabase (Server-Side)

These are server-only and **NEVER** exposed to the browser:

```bash
# Service role key (NEVER expose in client-side code)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Where to find:**
- `SUPABASE_URL`: Same as `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API → Project API keys → `service_role` `secret`

⚠️ **Security Warning:** The service role key bypasses Row Level Security (RLS). Only use it in server-side code and Edge Functions.

### OpenAI

Required for content generation and quality scoring:

```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**Where to find:**
- https://platform.openai.com/api-keys → Create new secret key

**Cost Note:** The app uses GPT-4o for generation. Monitor usage in your OpenAI dashboard.

## Optional Environment Variables

### Application URL

```bash
# Base URL of your application (defaults to http://localhost:3000)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**When to set:**
- Production: Set to your actual domain (e.g., `https://reddit-planner.example.com`)
- Development: Can be omitted (defaults to `http://localhost:3000`)

### Node Environment

```bash
# Usually set automatically by Next.js/Vercel
NODE_ENV=development
```

**Values:** `development`, `test`, or `production`

### Database URL (Optional)

Only needed if you're using direct Postgres connections outside Supabase:

```bash
# Usually not needed - Supabase client handles connections
DATABASE_URL=postgresql://user:password@host:port/database
```

## Supabase Edge Function Secrets

Edge Functions have their own secrets managed in the Supabase Dashboard. These are **NOT** set in `.env.local`.

### Required for `worker_tick` Function

Set these in: **Supabase Dashboard → Edge Functions → worker_tick → Settings → Secrets**

1. **SUPABASE_URL** (usually set automatically)
   - Value: `https://your-project-ref.supabase.co`

2. **SUPABASE_SERVICE_ROLE_KEY** (usually set automatically)
   - Value: Your service role key from API settings

3. **OPENAI_API_KEY** (you must set this manually)
   - Value: Same as your `OPENAI_API_KEY` from `.env.local`

### Optional Security

4. **CRON_SECRET** (optional, for extra security)
   - Value: A random secure string (e.g., `openssl rand -hex 32`)
   - If set, the Edge Function will require this in the Authorization header
   - Update `supabase/cron_examples.sql` to include it in the cron job headers

## Environment Variable Validation

The app validates environment variables on startup using Zod schemas:

- **Client vars:** `lib/env/client.ts` - Validates `NEXT_PUBLIC_*` variables
- **Server vars:** `lib/env/server.ts` - Validates server-only variables

If validation fails, the app will show clear error messages indicating which variables are missing or invalid.

## Setup Checklist

### Local Development

- [ ] Create `.env.local` file
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Set `SUPABASE_URL` (same as above)
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Set `OPENAI_API_KEY`
- [ ] Run `npm run dev` and verify no env errors

### Supabase Edge Function Deployment

- [ ] Deploy Edge Function: `supabase functions deploy worker_tick`
- [ ] Set `OPENAI_API_KEY` secret in Edge Function settings
- [ ] (Optional) Set `CRON_SECRET` for extra security
- [ ] Verify function works: Check Supabase Dashboard → Edge Functions → Logs

### Production Deployment (Vercel)

- [ ] Add all `.env.local` variables to Vercel project settings
- [ ] Set `NEXT_PUBLIC_APP_URL` to your production domain
- [ ] Set `NODE_ENV=production`
- [ ] Verify Edge Function secrets are set in Supabase Dashboard
- [ ] Test the application end-to-end

## Troubleshooting

### "Invalid server environment variables" Error

Check that all required variables are set:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

### "Invalid client environment variables" Error

Check that all required variables are set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Edge Function Not Processing Jobs

1. Check Edge Function logs in Supabase Dashboard
2. Verify `OPENAI_API_KEY` is set in Edge Function secrets
3. Verify cron job is scheduled (run `SELECT * FROM cron.job;` in SQL Editor)
4. Check that `SUPABASE_SERVICE_ROLE_KEY` is set in Edge Function secrets

### OpenAI API Errors

1. Verify `OPENAI_API_KEY` is valid and has credits
2. Check OpenAI dashboard for rate limits or errors
3. Verify the key has access to GPT-4o model

## Security Best Practices

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Never expose service role key** - Only use in server-side code
3. **Use different keys for dev/staging/prod** - Create separate Supabase projects
4. **Rotate keys regularly** - Especially if exposed or compromised
5. **Use Edge Function secrets** - Don't hardcode secrets in function code
6. **Monitor API usage** - Set up alerts for OpenAI and Supabase usage

## Example `.env.local` File

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://abcdefghijkl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI
OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

## Related Documentation

- [Supabase Environment Variables](https://supabase.com/docs/guides/getting-started/local-development#environment-variables)
- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [OpenAI API Keys](https://platform.openai.com/api-keys)

