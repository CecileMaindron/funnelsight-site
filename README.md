# Funnelsight

![Live site](https://img.shields.io/badge/live_site-funnelsight.dev-372F72)
![Stack](https://img.shields.io/badge/stack-n8n_%2B_Claude_API-D9A441)
![Status](https://img.shields.io/badge/status-fictional_company-14161F)

Funnelsight is a fictional growth analytics platform for marketing and revenue teams. It's built around a product-led growth motion, self-serve or hybrid with product-led sales.

It isn't a real product. It's the practical half of a certification project (RS7424, AI-driven transformation of work processes) on using AI to change how a piece of marketing work actually gets done, not just generate text faster.

**Live site:** [funnelsight.dev](https://funnelsight.dev)

![Funnelsight homepage: "Know what really brings in revenue, and when", with a leads vs new revenue by source dashboard](assets/funnelsight-homepage.png)

## The problem

SEO content production breaks down the same way in most small marketing teams. No dedicated writer. Output split across whoever has an hour free. No shared template, no consistent quality bar.

The pages that come out aren't bad. They're inconsistent. And once tone and structure vary from page to page, nobody can explain why one underperforms, because nothing about how it was made was ever standardized.

## The solution

A single, auditable pipeline: a monthly list of keywords in, a decision for each, human review before anything ships. n8n orchestrates it. For every keyword, Claude decides whether it deserves a new page, a better version of an existing one, or nothing at all, and then does the writing. Nothing reaches GitHub without a person approving it first. The SEO specialist no longer writes pages. Their job is to pick the keywords and review what comes out, and the person who maintains the workflow only steps in when something fails.

I'm a B2B growth marketer, not a software engineer. The engineering I don't have professional depth in (GitHub API calls, workflow orchestration) is where I worked with Claude as a collaborator. The process design, the editorial and brand constraints, the quality checks, and every call on what to automate versus keep manual: that part is mine.

### Architecture

```mermaid
flowchart LR
    L[Monthly keyword list] --> A[Next keyword]
    A --> B[Claude API call<br/>skip / duplicate / edit / create]
    B -->|skip or duplicate| C[Logged, no page changed]
    B -->|edit| P[Second call reads the target page<br/>up to 4 targeted changes]
    P -->|nothing worth adding| C
    P -->|changes proposed| V
    B -->|create| V[Automated output checks]
    V -->|check fails| X[Marked Failed<br/>alert, branch cleaned up]
    V -->|checks pass| D[Slack review<br/>full page, or before/after for an edit]
    D -->|rejected, with comment| R[Needs Rework<br/>regenerated next run]
    D -->|approved| E[GitHub PR<br/>page + memory + sitemap + logs]
    E --> F[Human merge]
    F --> G[Live on Cloudflare Pages]
    C --> A
    X --> A
    R --> A
    G --> A
```
See [`docs/architecture-decisions.md`](docs/architecture-decisions.md) for the reasoning behind these choices, and the trade-offs I'd reconsider if the project grew.

The actual n8n canvas, for scale:

![n8n workflow canvas](assets/n8n-canvas.png)

*Click the image to open it at full size.*

The canvas is split into seven colored zones:

| Zone | What happens there |
|---|---|
| 1 · Intake (blue) | Monthly trigger or manual run. Reads the Keywords sheet and checks required fields. |
| 2 · Loop and context (purple) | One keyword at a time. Re-reads the context files from GitHub at each iteration. |
| 3 · Generation and checks (yellow) | One Claude call per keyword, output checks, cost logging. |
| 4 · Content review (green) | Slack review of the full page. Skip and duplicate decisions are logged. |
| 5 · Publication (orange) | Five files written to a branch one after another, pull request, human merge. |
| 6 · Error path (red) | Cost logged, branch cleaned up, alert, row marked Failed, batch continues. |
| 7 · Page edits (grey) | Second Claude call on the target page, change checks, before/after review, pull request. |

Zone 7 up close: the edit branch, from the second Claude call to the pull request.

![Edit branch of the n8n workflow](assets/n8n-canvas-edit-zone.png)

## Site structure

```
/                           homepage
/trial                      trial signup page (disabled)
/resources                  guides and articles hub
/playbooks/                 use-case SEO pages
/features/                  product feature SEO pages
/glossary/                  educational / GEO SEO pages
/case-studies/              illustrative case study SEO pages
/solutions/                 audience-specific pages (hand-authored, outside the automated flow below)
/404.html                   error page
/styles.css                 single site-wide stylesheet
/fonts/                     self-hosted fonts (Inter, Space Grotesk) and their licenses
/sitemap.xml                sitemap submitted to Google Search Console
/content-memory.md          internal reference memory (see below)
/token-usage-log.md         API token consumption log, one line per published page or edit
```

## Stack

Static site, plain HTML and CSS. No framework, no build step. Deployed on Cloudflare Pages.

JavaScript stays minimal: a submit-prevention safeguard on the (disabled) trial form, a Google Analytics 4 tag (manual `gtag.js` install, not Google Tag Manager, since a single tag doesn't need the extra layer), and a lightweight consent banner. Google's script only loads after a visitor explicitly accepts: until then, no request reaches Google. The choice is stored in `localStorage`, a "Cookie settings" link in the footer reopens the banner, and withdrawing consent clears the analytics cookies. Fonts are self-hosted for the same reason.

Both the tag and the banner live in `page-shell.html`, so every new page starts with them. Pages already published keep the version they were generated with, so any change to this block is also applied to every published page, and to the four core pages (`index.html`, `trial.html`, `resources.html`, `404.html`) that don't go through the shell.

## SEO content production

Pages under `/playbooks/`, `/features/`, `/glossary/` and `/case-studies/` go through a flow combining n8n and the Claude API. Once a month, the workflow takes the new keywords from a Google Sheet and processes them one at a time: each keyword goes all the way to publication, or to a documented decision not to publish, before the next one starts. A first API call per keyword makes the decision and, for a new page, writes it. A human validates before anything publishes.

Claude writes only what needs judgment: the page, one new line for the site memory, and a resource card. The workflow builds the rest from the page's actual HTML (internal links, sitemap entry, return-link flags on the pages it links to) and inserts it into the existing files, in the same pull request. No file is ever rewritten in full.

Cost was a design constraint from the start. The model is chosen for the balance between writing quality and price, not because it's the most capable one available. Each call has a capped output length, the reference files that don't change from one keyword to the next are cached, and the API account runs under a spending cap. Letting code build what Claude used to rewrite in full roughly halved the cost of a page. Token use is logged for every call, and the monthly report puts what each page cost next to what it earned.

The prompt is where I spent the most time. It sets explicit brand and editorial constraints: no invented statistics, no named competitors, no AI-sounding phrasing. It also runs a structured decision process to avoid duplicate or cannibalizing content, and a self-check step that verifies internal links and FAQ content actually match the generated page before it ships. It works alongside a short set of reference files, re-read before every keyword: product facts Claude isn't allowed to contradict, the page templates, and the site memory.

The duplicate-detection logic went through a real iteration. An early version compared keywords and search intent only, and let a page through that restated an existing feature under a different angle. It now also compares what the page would actually let a user do. That catches functional overlap a keyword-level check misses.

### Better pages, not more pages

As the site grew, new pages started to look more and more alike. Even without exact duplicates, a site full of close variations ends up competing with itself in search, and gives readers little they haven't already seen. So the workflow now asks a different question before writing anything: could an existing page answer this keyword better than a new one?

The decisions are checked in a fixed order. Is the keyword already covered? Would a new page compete with an existing one? Could an existing page be improved instead? Creating a new page only comes last.

An edit only touches supporting pages, never the pillar and hub pages that structure the site. The first call picks the page and the reader's question it should answer. A second call then reads that page as it is actually published, and proposes at most four targeted changes, or none if the page already answers the question well.

The workflow checks every proposed change before a person sees it. Each passage to replace has to exist exactly once in the page. The title, the call to action, the FAQ and the read-next block stay untouched, and an edit can't add more than 250 words. The SEO specialist then reviews a before/after version, and the change ships through the same pull request and human merge as a new page.

Several reliability guardrails were added after real failures, not designed in from day one:
- a response that gets cut off is never published: the keyword is marked Failed for manual review instead of being retried
- Claude's output is checked before review: valid filename, no existing page at that address, no leftover template placeholder, no link to a page that doesn't exist
- a failing keyword doesn't stop the batch: it's marked Failed, the cost of the call is logged, any GitHub branch already created is deleted, the maintainer gets a Slack alert, and the next keyword starts

## Human oversight and governance

Nothing reaches the live site without a human decision at two points.

Claude can only propose `skip`, `duplicate`, `edit` or `create`. It never publishes directly. A new page or an edit goes to a Slack review before anything is written to GitHub. If it's rejected, the reviewer's notes feed automatically into the next generation pass, instead of starting over from a blank prompt.

Once approved, everything ships together in a single pull request: the new or edited page, plus the matching updates to the internal memory, the sitemap and the logs. The automation opens the PR. A person merges it, then confirms in Slack that the page is live. If the page can't be published as is, the reviewer says why, and the keyword goes back for a new generation with that comment.

The merge step is a real review, not a formality. On the first edit that went live, one redundant sentence in Claude's proposal was rewritten by hand before merging. The automated checks catch what would break a page. Judging whether a sentence earns its place is still a human call.

![Slack review, decision reasoning and token cost on a merged PR](assets/github-pr-detail.png)

The repo's `main` branch is protected. No direct pushes are possible, a PR is required every time, and that rule can't be bypassed even by an admin token. The human review step is a structural guarantee, not a convention that could slip under deadline pressure.

A separate log records every keyword the system processes, published or not: the decision, the reasoning, and the full generated text where relevant. Over time, that log shows which kinds of keywords get skipped, flagged as duplicates or turned into edits, and how often a first draft needs rework, not just the pages that made it to publication.

`content-memory.md`, at the repo root, is the reference memory used to avoid duplicate content and keep internal linking consistent from page to page. The prompts, page templates and product facts the workflows read live in a separate private repository, and the test and iteration log in a Claude project. Every prompt change is run first on a fixed set of keywords whose right answer is already known, so a regression shows up before it reaches a real run.

## Monthly performance report

A second workflow closes the loop. Search Console says what a page earned. Only the workflow knows what it cost to make: API spend, dates, keywords rejected along the way. Once a month, the report puts the two side by side in a page inventory, in Google Sheets and Notion.

One Claude call then writes a short performance note: three points for leadership, a status for each page (Protect, Refresh or Too early) with the numbers behind it, and a few actions for the month, each with what to check the following month. The note also knows what the content workflow did on each page, for instance an edit made, or declined because the page already covered the question.

Same split as the generation flow: code computes, the model writes. Code decides which statuses each page is allowed to get, and the workflow rejects a note that breaks them before anything is saved. The note is a draft: the SEO specialist reviews it before it's shared with anyone.

One rule came from looking at the data rather than from the design. A click from France can simply be the team checking its own pages, so a page now needs at least one click from outside France to earn Protect. The cost is that real French visitors don't count toward that status either, which is acceptable for a site written in English.

Search Console access is read-only, and Claude only receives aggregated metrics per page, never data about individual visitors.
