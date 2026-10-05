# Architecture decisions

Engineers call these architecture decision records. I'm using a simplified version so anyone curious about the reasoning, developer or marketer, can follow it.

Each entry covers one choice: what I decided, what I considered instead, and what would make me revisit it.

## Why one workflow, not several sub-workflows

**Decision:** Everything runs in a single n8n workflow. No sub-workflows.

**Context:** The canvas is wide enough that you need to scroll to see it end to end. It also has two blocks of repeated logic: five steps that pull a file from GitHub and decode it, and five that update a file and push it back. On paper, both are textbook reasons to split into sub-workflows.

**Why I kept it as one:** Each of those five fetch steps targets a different file with a different role in the prompt (product facts, page template, site memory, and so on). Splitting them into a shared sub-workflow would save a few lines of duplicated node config, not real complexity. n8n's own guidance on this backs that read: it treats "can't see the whole canvas without scrolling" as one early signal, but flags sub-workflows as the answer once you also see actual duplication *across* workflows, debugging that outlasts building, or several people needing to edit different parts at once. None of that applies here. I'm the only one building this, and each branch is still simple enough to trace end to end in a few seconds.

**What would change my mind:** If I reused the same fetch or commit logic in a second workflow, or if changing how one file gets pulled from GitHub meant editing it in five or six places by hand, that's the point where extracting a sub-workflow would start paying for itself.

## Why one API call handles both the decision and the writing

**Decision:** A single Claude call takes the keyword in and returns either a skip/duplicate verdict with reasoning, or a full page.

**Context:** I could have split this into two calls: a cheap triage step that only decides create, skip or duplicate, then a second call that writes the page only once the first one says yes.

**Why I kept it as one:** The duplicate check needed to get stronger than a keyword-and-intent comparison (see below). Judging whether a new page would actually overlap with an existing one works better when the model reasons about what the page would say, not just what it's nominally about. Keeping the decision and the writing in the same call means that reasoning stays available in the same context, instead of getting recreated in a second, disconnected prompt. Confirmed in practice: a skip or duplicate verdict returns a short reasoning block, not a full page: output tokens for those calls run in the low hundreds, against several thousand for a published page.

**Trade-off:** A two-step version would very likely be cheaper on keywords that get rejected early, since it wouldn't spend tokens writing a page that never ships.

**What would change my mind:** If skip and duplicate outcomes started dominating the keyword list and token cost became the binding constraint, a cheap triage call before a full generation call would be the natural fix.

## Why a static site, no framework

**Decision:** Plain HTML and CSS, no build step, deployed straight to Cloudflare Pages.

**Context:** A static site generator, or a JS framework, would have given me templating and component reuse.

**Why I kept it simple:** The automation writes HTML directly into the repo through a GitHub PR. Adding a build step means one more thing that can break between "Claude wrote a page" and "the page is live," in a chain that already has several moving parts. Every generated page starts from one file, `page-shell.html`, which holds the shared header, footer and scripts, so a new page never has to rebuild them.

**Trade-off:** A page inherits the shell at the moment it's generated, not afterward. Once published, it's a standalone copy, and so are the four core pages that never go through the shell (`index.html`, `trial.html`, `resources.html`, `404.html`). Any later change to the shared block has to be applied to every published page as well as to the shell. In practice that's a grouped search-and-replace across all pages, checked by match count before anything is replaced. I learned this the hard way: after adding a menu entry, 21 older pages kept the old navigation until I caught it.

**What would change my mind:** If the site grew into hundreds of pages, or if changes to the shared block became frequent enough that keeping every copy in sync turned into routine work, a static site generator or a build step that injects the shell would start paying for its own complexity.

## Why a truncated response is flagged, not retried

**Decision:** If a Claude response gets cut off before completion, nothing is published and the keyword is flagged for manual review. It isn't retried automatically.

**Context:** This came out of a real failure during testing, not a decision made on paper in advance.

**Why I chose stop over retry:** A cut-off response usually means the content for that keyword ran past the token budget, not that the call randomly failed. Retrying blind spends another full generation call without addressing why it happened, and risks the same cutoff again. Flagging it puts a person in the loop to decide the actual fix: raise the token limit, narrow the angle of the page, or accept a shorter one.

**Trade-off:** Nothing here self-heals. Every truncation needs a manual look before that keyword can move forward.

**What would change my mind:** If truncation turned out to have one dependable fix, like always doubling the token budget once, an automatic retry could replace the manual flag for that specific failure mode.

**Update:** The flag did its job on the first scheduled run. The response was cut off at the 16,000-token limit, and nothing shipped. The cause wasn't the page itself: about two thirds of the output was Claude copying back the whole site memory file. That led to the change described in "Why Claude returns new entries only". Since then, a truncated keyword no longer stops the run: it's marked Failed and the batch moves on (see "Why one failed keyword doesn't stop the batch").

## Why duplicate detection compares function, not just topic

**Decision:** Before generating a page, Claude checks whether it would functionally overlap with an existing one, not just whether the keyword or search intent looks similar.

**Context:** The first version only compared keywords and search intent. It let a page through that restated an existing feature page under a different angle.

**Why I changed it:** Two pages can target different keywords and still tell a user to do the exact same thing. A keyword-level check can't catch that. Comparing what the page would actually let a user do closed that gap.

**Trade-off:** This kind of check is fuzzier than a keyword match. It depends on the model's judgment of functional similarity, which is harder to unit-test or explain in one line than "these two keywords are 90% the same string."

**What would change my mind:** Not something I'd revert. If a new kind of overlap slipped through later (say, across a playbook and a case study written for different audiences but covering the same workflow), that would be the next refinement to make.

**Update:** That gap showed up sooner than expected, just not in the form I'd guessed. A test keyword came back `create` even though the page it generated overlapped in substance with one of the hand-authored `/solutions/` pages, a part of the site the overlap check didn't cover yet, since it only compared against feature and use-case pages. Extended the check to include `/solutions/` pages too, with an explicit instruction to flag a conflict in positioning, not just a duplicated capability. Same lesson as the original decision: the failure mode that gets caught is the one you thought to check for.

## Why a custom domain over the free pages.dev subdomain

**Decision:** Bought `funnelsight.dev` and pointed the site there, with the old `pages.dev` subdomain redirecting to it. Renamed the GitHub repo to match.

**Context:** Cloudflare Pages gives every project a free `*.pages.dev` subdomain, which is enough to have a live site. The sitemap had been stuck at "couldn't fetch" in Search Console for weeks despite two separate fixes for two separate suspected causes (a content bug that had emptied the file, then a cache-control header change), and neither one was confirmed to work.

**Why I made the change:** The cost was negligible (a few dollars a year, prepaid for several years) against the expected upside, and a domain of its own seemed more likely to be treated as a first-party site by Google than a subdomain shared with every other project hosted on the same platform. It also made the GitHub repo easier to find on its own: searching the product name plus "github" now surfaces it, which it didn't before under the old name.

**Result:** The sitemap was fetched successfully right after the move, with no further changes needed. Five pages submitted for indexing, three already showing up in search within hours.

**Trade-off:** I can't cleanly separate how much of the fix was the new domain itself versus simply starting over with a domain that has no prior crawl history. The header change from a few days earlier is confirmed not to have worked on the old domain, so at least one hypothesis is ruled out, but the exact mechanism behind the old domain's block is still unconfirmed.

**What would change my mind:** Nothing to revisit here. If a future project hits the same "sitemap won't fetch" symptom on a `pages.dev` subdomain, this is now a data point worth checking early rather than last.

## Why prompt caching uses a 5-minute window, not the 1-hour one

**Decision:** Enabled prompt caching (`cache_control: ephemeral`) on the static block of the generation prompt (instructions, page template, page shell, product facts, site memory), with the default 5-minute TTL rather than the 1-hour option.

**Context:** Every call resends that same static block, roughly 20k tokens, alongside the few hundred tokens that actually vary per keyword. Caching it is close to a free win on cost. The only real decision is which cache lifetime to pay for: 5 minutes is cheaper to write, 1 hour costs more upfront but tolerates a longer gap between calls that reuse it.

**Why I chose the shorter window:** I checked the actual shape of the workflow instead of assuming. There's no queue that holds a keyword until a human finishes reviewing the previous one before starting the next. Every keyword in a run reaches the generation call back-to-back, one after another, gated only by API latency (60-100 seconds observed per call), never by how long a Slack review takes. That gap sits comfortably inside a 5-minute window even if the monthly keyword count grows somewhat from today's volume, so paying more upfront for a 1-hour window wasn't buying anything yet.

**Trade-off:** If the batch grows large enough that the time between the first and last call exceeds 5 minutes, the later calls in that batch would miss the cache and pay the full write cost again, the exact cost the caching was meant to avoid.

**What would change my mind:** If the keyword volume per run grows past what a 5-minute window reliably covers, switch to the 1-hour cache option. It's a one-line change, not a redesign.

**Update:** The reasoning above no longer holds as written. Keywords now go through one at a time, and each one waits for its human reviews before the next starts (see below). After a page is created, the next call usually comes long after the cache has expired, and the site memory has changed anyway, so the cache would miss even with a 1-hour window. The 5-minute cache still pays off where it matters most: when several skip or duplicate decisions come one after another, with no review in between. In testing, a second consecutive duplicate read the whole static block from cache and cost $0.01 instead of $0.06. So the decision stays, for a different reason than the original one.

## Why keywords are processed one at a time

**Decision:** The monthly keyword list goes through a loop, one keyword at a time. Each keyword runs to the end (generation, content review, pull request, publish confirmation) before the next one starts.

**Context:** The first version assumed n8n would pass every keyword through the flow in a single run. It didn't. A limit step meant to avoid fetching the context files several times also let only the first keyword through, silently. Fixing that wasn't enough either: a test with two items showed that Slack's send-and-wait step sends a single review form and resumes on a single answer. The second keyword would have been generated, paid for, and then lost.

**Why a loop:** It solves both problems, plus a third one. The context files are re-read from the repo at every iteration, so each keyword is judged against the pages published earlier in the same batch. That's what prevents a new page from overwriting the previous one's entry in the site memory, and what lets the duplicate check see a page created ten minutes earlier.

**Trade-off:** A batch takes longer. The reviewer gets one proposal at a time, not all of them at once, and the next generation waits until the previous page is live. For a monthly cadence of 4 to 8 keywords, that's acceptable. It also means keywords inside the same batch are compared against each other only once each one is published: avoiding overlap within a batch stays the SEO specialist's job.

**What would change my mind:** If review time per batch became the bottleneck, I'd separate generation from publication: generate all proposals first, review them as a set, then publish in sequence.

## Why Claude returns new entries only

**Decision:** For a new page, Claude returns the page, one new line for the site memory, and a resource card. The workflow builds everything else (the sitemap entry, the internal linking record, the return-link flags on other pages, the page counts) and inserts it into the existing files.

**Context:** Until then, Claude rewrote the whole site memory file and the whole sitemap on every call, and the workflow replaced both files with that output. On the first scheduled run, about 62% of the output was a copy of a file that already existed, and the response hit the token limit before the end. Rewriting full files also had a quieter cost: a link Claude had once claimed on an existing page had never existed in its HTML, and stayed in the memory for a week.

**Why:** Anything that can be computed from the real source shouldn't be written by the model. The links a page contains are in its HTML, and a sitemap entry follows from the filename. Code does that exactly, every time. Claude now writes only what needs judgment. Output per page dropped from about 16,000 tokens (truncated) to about 6,000, and the cost of a page went from $0.23 to $0.11 for the same keyword. The workflow also checks Claude's output before anything is published: valid filename, no existing page at that address, no leftover template placeholder, every internal link pointing to a real page, exactly one read-next card.

**Trade-off:** More logic lives in the workflow's code nodes, and those are harder to read for a non-developer than a rule in the prompt.

**What would change my mind:** Nothing I'd revert. If the site memory itself became too large to send with every call, the next step would be sending only the relevant part of it.

## Why one failed keyword doesn't stop the batch

**Decision:** Every step that calls an outside service or can fail (the Claude API, the output checks, each GitHub write) has an error route. A failing keyword is marked Failed, the batch moves on to the next one.

**Context:** In the first version, any error stopped the whole run, and nobody was told. With one keyword per run, that was tolerable. With a monthly batch, one bad keyword would block all the others.

**Why:** The error route does four things. It logs the cost of the API call if one was billed, so no spending goes unrecorded. It deletes the GitHub branch if one was already created, so a failure never leaves a half-finished state behind. It alerts the person who maintains the workflow on Slack, with the failing step and the error. And it marks the row Failed, which the workflow never picks up again on its own: a person sets it back to New once the cause is fixed. To make this reliable, the GitHub writes now run one after another instead of in parallel: with parallel branches, a single failing write could still let the pull request open with files missing.

**Trade-off:** More nodes, and an error route has to be tested on purpose: in normal use, it never runs. Testing it meant forcing a truncation with a deliberately low token limit.

**What would change my mind:** If one specific failure turned out to be frequent and to have a reliable fix, it could get an automatic retry instead of a manual reset.

## Why analytics only loads after consent, and fonts are self-hosted

**Decision:** Google Analytics' script only loads once a visitor clicks Accept, and fonts are served from the site itself instead of Google Fonts.

**Context:** The site already used Google Consent Mode v2, with analytics storage denied by default. Checking the browser's network tab showed what that meant in practice: Google's script still loaded for every visitor, and cookieless requests still went out to Google before any choice was made. Fonts were also loaded from Google's servers on every page view, which shares each visitor's IP address with Google, again without consent.

**Why I changed it:** The consent banner tells visitors nothing is collected without their choice. Consent Mode's advanced setup is accepted by Google, but its GDPR footing is debated in Europe, and a German court ruled against loading Google Fonts remotely in 2022. The basic setup removes the question entirely: no request reaches Google until someone accepts. It's also lighter. Visitors who don't accept never download a 180 KB script, and self-hosting dropped one font weight the site never used. A "Cookie settings" link in the footer lets visitors withdraw consent at any time, which also clears the analytics cookies.

**Trade-off:** Visitors who decline become invisible to Google Analytics, and Google can no longer model them statistically. At this site's traffic level that modeling never kicked in anyway, so nothing visible was lost. Search Console, which covers search traffic, doesn't depend on the banner at all.

**What would change my mind:** If I needed reliable traffic volumes that include visitors who decline, I'd add a cookieless analytics tool rather than go back to loading Google's script before consent.
