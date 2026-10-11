# blind-speech

Anonymous, company-verified workplace discussion. Post, comment, and join communities without ever revealing who you are.

**Live:** [blind-speech-self.vercel.app](https://blind-speech-self.vercel.app)

## What it is

blind-speech is an anonymous discussion platform for working professionals. It gives people a place to talk openly about what actually happens at work (hiring practices, hierarchy, toxic culture, pay, company problems) without fear of being identified or facing retaliation.

## The problem

Employees often can't speak honestly about their workplace. Public platforms tie posts to real names, and fully anonymous ones fill up with spam and fake claims. Either way, people stay silent, and job seekers and colleagues lose out on honest information.

## How blind-speech solves it

- **Verified, but anonymous.** You prove you work at a company with a work-email OTP. The email is hashed, salted and encrypted, and never stored, so nobody (including us) can trace a post back to you.
- **Credible by default.** Only company-verified users can post, so every post carries a company name and a username, which makes it trustworthy without exposing who wrote it.
- **Organised like Reddit.** Conversations live in communities (per company or per topic like cybersecurity), with threaded comments, voting and hashtags, so discussions stay easy to follow.
- **Open to read, verified to write.** Anyone can browse as a visitor; only verified users can post, comment, or vote.

## How it fits with BlindHire

blind-speech is the public, community-facing half of one unified platform. Its sibling, **BlindHire**, handles anonymous hiring. Both share one login and one database, but your posting identity and hiring identity are deliberately kept apart and can never be linked, even at the database level. Nothing you post can be connected to your job applications, and vice versa.

## Features

- **Verified-only posting**: work-email OTP verification; the email is hashed/salted/encrypted and never stored
- **Persistent anonymous identity**: posts show only your company name and username
- **Communities**: Reddit-style channels (company or topic based) that users can join or create; owners are anonymous too
- **Threaded comments**: nested replies with upvote/downvote, deep threads collapse into "show more replies"
- **Hashtags**: auto-parsed from content, plus an optional manual tag field
- **Visitor mode**: browse communities, posts, and comments without logging in (no posting, voting, or commenting)
- **Mobile-first** UI, text-only posts and comments
- **Shared login** with BlindHire, plus a "Get Hired" link to the BlindHire dashboard

## Privacy model

- No correlation between a user's posts and their hiring activity
- Posting identity and hiring identity cannot be joined, even at the database level
- Searching a username never reveals a real identity
- Work emails are never stored

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | TanStack Start (Vinxi) |
| Backend | Node.js |
| Database | PostgreSQL + Prisma (shared with BlindHire) |
| Email | Resend (OTP) |
| Hosting | Vercel (frontend), Render (backend) |

## Project structure

```
blind-speech/
├── frontend/   # TanStack Start app
└── backend/    # API server + Prisma schema
```

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL (or access to the shared BlindHire database)
- A [Resend](https://resend.com) API key

### Setup

```bash
git clone <repo-url>
cd blind-speech

# Backend
cd backend
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run dev

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Environment variables

**backend/.env**

```
DATABASE_URL=
RESEND_API_KEY=
JWT_SECRET=
HASH_SALT=
ENCRYPTION_KEY=
FRONTEND_URL=
```

**frontend/.env**

```
VITE_API_URL=
```

> Variable names are placeholders; match them to your actual config.

## Deployment

- **Frontend:** Vercel, root directory `frontend`
- **Backend:** Render, root directory `backend`, with the environment variables above set in the dashboard

## Roadmap

- Image/video support (skipped for now due to infra cost)

## License

TBD
