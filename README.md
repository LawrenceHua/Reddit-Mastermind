# Reddit Mastermind 🎯

A production-grade Reddit content operations planner that generates authentic, value-first content calendars with AI-powered multi-persona thread planning.

## 🌐 Live Demo

**[https://reddit-mastermind.vercel.app](https://reddit-mastermind.vercel.app)**

> Login with email magic link (no password required)

---

## 📋 Quick Start (Local Development)

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/RedditMastermind.git
cd RedditMastermind

# Install dependencies
npm install

# Set up environment variables (see below)
cp .env.example .env.local

# Run development server
npm run dev

# Open http://localhost:3000
```

### Environment Variables

Create `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
```

---

## ✨ Features

### Content Calendar Generation
- **Weekly Planning**: Generate 3-10 posts per week with AI
- **Smart Scheduling**: Deterministic slot assignment using seeded randomization
- **Subreddit Limits**: Respects max posts per subreddit per week
- **Persona Rotation**: Ensures natural distribution across personas

### Multi-Persona Thread Planning
- **OP Posts**: Value-first questions (not promotional)
- **Coordinated Comments**: 2+ comments from different personas with realistic timing
- **OP Replies**: Grateful, brief acknowledgments
- **Comment Intents**: `add_example`, `agree`, `personal_experience`, etc.

### AI Content Generation
- **GPT-4o Integration**: JSON Schema structured outputs
- **Few-Shot Learning**: Uses top-rated past content in prompts
- **Quality Scoring**: 10-point scale with heuristic + LLM evaluation
- **Risk Flag Detection**: Vote manipulation, spam, undisclosed affiliation

### Continuous Learning System
- **User Feedback**: 1-5 star ratings, "I posted this" tracking
- **Reddit Performance**: Track upvotes and post URLs
- **Auto-Promotion**: 5-star posted content becomes training examples
- **Fine-Tuning Export**: Generate JSONL for OpenAI model fine-tuning

### Team Collaboration
- **Multi-tenant**: Organization-based access control
- **Audit Logs**: Full activity tracking
- **Role Management**: Admin and member roles

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API ROUTES                                  │
│  /api/projects/[id]/weeks/generate                              │
│  /api/content-assets/[id]/feedback                              │
│  /api/ai/suggest-personas, subreddits, topics                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CORE BUSINESS LOGIC                           │
│  lib/planner/    - Slot generation, assignment                  │
│  lib/generation/ - Content generation, quality scoring          │
│  lib/validators/ - Reddit policy compliance                     │
│  lib/learning/   - Few-shot examples, fine-tuning export       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
│  Supabase (PostgreSQL + Auth + RLS + Realtime)                  │
│                                                                  │
│  Tables: orgs, projects, personas, subreddits, topic_seeds,     │
│          calendar_weeks, calendar_items, content_assets,         │
│          generation_runs, prompt_examples, audit_logs           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing

### Run All Tests

```bash
# Unit tests (Vitest)
npm run test:run

# Watch mode
npm run test

# E2E tests (Playwright)
npm run test:e2e
```

### Test Coverage

| Category | Tests | Description |
|----------|-------|-------------|
| **Planner** | 29 | Slot generation, subreddit/persona assignment |
| **Use Cases** | 21 | Full calendar generation, thread planning, edge cases |
| **Validators** | 36 | Vote manipulation, spam, disclosure detection |
| **Quality** | 13 | Heuristic scoring, penalties, bonuses |
| **LLM** | 13 | OpenAI integration, JSON Schema, retries |
| **Generation** | 10 | Quality scoring algorithm |
| **API** | 35+ | Request validation, content rules, learning system |

**Total: 157+ tests** ✅

### Testing Approach (8/10)

**Strengths:**
1. **Comprehensive unit tests** for all core business logic (planner, validators, quality scoring)
2. **Use-case driven tests** that validate real-world scenarios (weekly calendar, thread conversations)
3. **Edge case coverage** (overposting, persona spacing, minimum personas)
4. **Mocked external dependencies** (OpenAI, Supabase) for fast, reliable tests
5. **Integration tests** for API request/response validation

**Areas for Improvement:**
- Could add more E2E tests with Playwright for full user flows
- Could add visual regression testing for UI components

---

## 📁 Project Structure

```
RedditMastermind/
├── app/                      # Next.js App Router pages
│   ├── api/                  # API routes
│   ├── projects/[id]/        # Project pages (setup, calendar, learning)
│   └── dashboard/            # Dashboard
├── components/               # React components
│   ├── shell/                # App layout (sidebar, topbar)
│   ├── feedback/             # Feedback panel
│   └── ui/                   # shadcn/ui components
├── lib/                      # Core business logic
│   ├── planner/              # Calendar planning algorithms
│   ├── generation/           # Content generation
│   ├── validators/           # Reddit policy validators
│   ├── learning/             # Continuous learning system
│   ├── llm/                  # OpenAI integration
│   └── supabase/             # Database client
├── supabase/
│   └── migrations/           # Database schema
└── tests/                    # Test files (co-located with lib/)
```

---

## 🔐 Security & Compliance

### Reddit Policy Compliance
- ✅ **No vote manipulation language** detection
- ✅ **Transparent affiliation** disclosure requirements
- ✅ **Anti-spam** link and pattern detection
- ✅ **Subreddit rule** validation

### Security Features
- 🔒 **Row Level Security (RLS)** on all tables
- 🔒 **Service role** functions for privileged operations
- 🔒 **PKCE authentication** flow
- 🔒 **Input validation** with Zod schemas

---

## 🚀 Deployment

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/RedditMastermind)

1. Click the button above
2. Connect your Supabase project
3. Add environment variables
4. Deploy!

### Manual Deployment

```bash
# Build for production
npm run build

# Start production server
npm start
```

---

## 📊 Content Quality Rating (8/10)

**Strengths:**
1. **Value-first approach**: Posts are genuine questions, not promotional
2. **Natural language**: Short, casual posts like real Reddit users
3. **Multi-persona threads**: Realistic comment timing and intents
4. **Quality scoring**: Comprehensive 10-point evaluation

**Sample Generated Content:**

> **Title:** "Best AI Presentation Maker?"
> 
> **Body:** "Just like it says in the title, what is the best AI Presentation Maker? I'm looking for something that makes high quality slides I can edit afterwards. Any help appreciated."
>
> **Quality Score:** 8.5/10

**Areas for Improvement:**
- Could fine-tune prompts for even more natural voice
- Could add A/B testing for prompt variations

---

## 📝 How It Works (Technical Deep Dive)

### 1. Calendar Generation Flow

```
User clicks "Generate Week" 
    → API validates project setup
    → buildPostSlots() creates time slots (seeded random)
    → assignSubreddits() respects limits
    → assignPersonas() distributes fairly
    → buildThreadPlan() creates OP + comments structure
    → generatePostContent() calls GPT-4o with few-shot examples
    → calculateQualityScore() evaluates output
    → Insert to database with metadata
    → Return to UI
```

### 2. Content Validators

Each generated piece runs through:
- `validateNoVoteManipulationLanguage()` - Detects "upvote this", "downvote competitors"
- `validateNoSpamLinks()` - Detects URL shorteners, affiliate links
- `validateNoUndisclosedAffiliationClaims()` - Detects fake "unbiased" claims
- `validateDisclosurePresent()` - Checks for proper affiliation disclosure

### 3. Learning Loop

```
Generate → User Rates → Auto-Promote Top Examples → Include in Next Prompt
    ↑                                                        │
    └────────────── Few-Shot Learning Improves Output ───────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Frontend** | Next.js 16 (App Router) | Server components, streaming, best DX |
| **Styling** | Tailwind + shadcn/ui | Rapid, consistent UI development |
| **Database** | Supabase (PostgreSQL) | RLS, Auth, Realtime, hosted Postgres |
| **AI** | OpenAI GPT-4o | JSON Schema mode for reliable outputs |
| **Testing** | Vitest + Playwright | Fast unit tests + E2E coverage |
| **Deployment** | Vercel | One-click deploy, edge functions |

---

## 📈 Future Improvements

1. **Reddit API Integration**: Direct posting (with user consent)
2. **Analytics Dashboard**: Track post performance over time
3. **Team Collaboration**: Comments, approvals, version history
4. **Custom Fine-Tuned Model**: Train on top-performing content
5. **A/B Testing**: Compare prompt variations

---

## 📄 License

MIT

---

## 👤 Author

Lawrence Hua
- GitHub: [@LawrenceHua](https://github.com/LawrenceHua)
- Email: lawrencehua2@gmail.com

---

Built with ❤️ for The Reddit Mastermind challenge
