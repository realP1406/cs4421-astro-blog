# Bondwell

Bondwell is a bond portfolio dashboard built with Astro. Sign in to keep track of your bonds, projected coupon income, and upcoming payments.

This app is part of the Block 1 Scrum/DevOps coursework for the ISE course at UL, alongside the project's weekly notes.

## Getting started

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Run `supabase/schema.sql` in your Supabase project and enable email/password authentication.
4. Start the local development server with `npm run dev`.

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run check` | Check Astro and TypeScript |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the site into `dist/` |
| `npm run preview` | Preview the production build locally |
