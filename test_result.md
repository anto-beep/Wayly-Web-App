#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: |
  Fix the hard-coded part Age Pension contribution rates in the Statement
  Decoder and Contribution Estimator. The correct Support at Home structure
  uses bands (5%-25% Independence, 17.5%-25% Everyday Living for part Age
  Pension; 5%-50% / 17.5%-80% for CSHC) instead of single exact rates. The
  old hard-code (17.5% / 50%) caused false-positive Rule 9 anomalies and
  ~50% overstatement of part-pensioner cost projections.

backend:
  - task: "Rule 9 pension band check + RULE_9_INCONSISTENT_RATE cross-line consistency"
    implemented: true
    working: true
    file: "/app/backend/agents.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          _PENSION_RATES rewritten to map cohort+stream to a (min, max) band.
          Exact-rate cohorts keep the original dollar variance check.
          Band cohorts (part Age Pension, CSHC, part_or_cshc_unconfirmed)
          flag a line only when implied_rate is outside [min - 0.5pp, max + 0.5pp].
          New RULE_9_INCONSISTENT_RATE fires when two non-cancelled lines in the
          same stream imply rates more than 0.5 percentage points apart.
          Headlines and detail copy now say "outside the X% to Y% range that
          applies to a <cohort> participant" for band breaches.

  - task: "HEADER_EXTRACTOR_SYSTEM pension detection rewrite"
    implemented: true
    working: true
    file: "/app/backend/agents.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Detection now: explicit text in the statement (e.g. "(part Age
          Pension)", "(CSHC)") overrides rate inference. Without explicit
          text: Independence 5% AND Everyday Living 17.5% → full_age_pension;
          Independence 50% AND Everyday Living 80% → self_funded; any other
          combination → part_or_cshc_unconfirmed. Rule 9 then validates
          part_or_cshc_unconfirmed against the widest applicable band.

  - task: "AUDITOR_SYSTEM Rule 9 reference table updated"
    implemented: true
    working: true
    file: "/app/backend/agents.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Rule 9 documentation block now lists each cohort with min-max
          bands, mentions RULE_9_INCONSISTENT_RATE, and clarifies the
          band tolerance. Auditor still must NOT emit Rule 9.

  - task: "Contribution Estimator: cshc cohort + band midpoint estimate + rate_basis field"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          PENSION_RATES converted to (min, max) tuples. POST
          /api/public/contribution-estimator now accepts pension_status
          "cshc" in addition to "full"/"part"/"self". When the cohort has a
          band, the route returns rate_basis="band_midpoint_estimate" plus
          per-stream rate_band_pct + is_band; exact cohorts return
          rate_basis="exact_rate". Lifetime cap and years_to_cap behaviour
          unchanged. Full route redesign deferred per spec.

  - task: "New regression suite test_pension_rates.py"
    implemented: true
    working: true
    file: "/app/backend/tests/test_pension_rates.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Covers: (1) part-pension Independence at 12% silent, (2) Independence
          at 30% flags exactly one mismatch citing 5%-25% band, (3) 12% + 19%
          fires RULE_9_INCONSISTENT_RATE (no mismatch), (4) full-pension
          exact-rate behaviour preserved (silent when correct, flags 9%),
          (5) header extractor prompt invariants + part_or_cshc_unconfirmed
          fallback, (5b) unknown pension still produces the skip note,
          plus structural invariants and a live API check for the new
          rate_basis field. 10 passed, 1 skipped (only because the existing
          per-user 5/hour rate-limit on /api/public/* was already exhausted
          by an earlier price-checker test). All other decoder fixture
          tests (Okafor, Beverley, Dorothy) unchanged.

frontend:
  - task: "Contribution Estimator UI: surface band + rate_basis"
    implemented: false
    working: "NA"
    file: "/app/frontend/src/pages/tools/ContributionEstimatorTool.jsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Backend now returns rate_band_pct + is_band + rate_basis. UI not
          updated in this pass (spec says the full route redesign — including
          the "next prompt" CSHC selector + band slider — comes later).
          Existing UI will render the midpoint rate transparently because
          the API still returns rate_pct.

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Rule 9 pension band check + RULE_9_INCONSISTENT_RATE cross-line consistency"
    - "HEADER_EXTRACTOR_SYSTEM pension detection rewrite"
    - "Contribution Estimator: cshc cohort + band midpoint estimate + rate_basis field"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Pension-rates correctness fix complete. Backend tables, Rule 9
      deterministic check, AUDITOR_SYSTEM doc, HEADER_EXTRACTOR prompt and
      Contribution Estimator route all updated. New band cohort
      part_or_cshc_unconfirmed introduced for the rate-inference fallback.
      test_pension_rates.py passes 10/10 deterministic cases (plus a live
      API case that skips when rate-limited). Existing decoder fixture
      tests still pass — the two unrelated failures
      (test_iter15_rules::test_budget_calc_unauth and
      test_iter21_beverley_may::test_duplicate_transport_05_may_high) are
      pre-existing and reproduce on the un-patched main branch (verified
      via git stash). Frontend Contribution Estimator UI redesign is
      explicitly deferred per the user's prompt.


backend:
  - task: "Rollover cap computes against GROSS quarterly budget (not post-CM)"
    implemented: true
    working: true
    file: "/app/backend/budget.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          rollover_cap() now uses classification_annual(c) / 4.0 as the
          gross quarterly base before applying the 10% rollover percentage.
          The previous implementation called quarterly_budget() which already
          deducts the 10% care-management slice, understating the rollover
          cap for Levels 6/7/8. Level 8 now returns the correct $1,952.65
          (vs the bug's $1,757.39). quarterly_budget() semantics unchanged.
          agents.py Rule 13 deterministic rollover_cap calc verified — it
          reads quarterly_budget_total from the extracted statement header,
          which providers print as the GROSS figure, so the existing
          0.10 * quarterly_total math is already correct; added an explanatory
          comment to prevent future drift. Frontend BudgetCalculatorTool and
          Reports pages already consume API-returned rollover figures, so the
          fix flows through without any frontend code change.

  - task: "New regression suite test_rollover_cap.py"
    implemented: true
    working: true
    file: "/app/backend/tests/test_rollover_cap.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          8 cases — Level 1 / Level 4 hit the $1,000 floor; Level 6 / Level 7
          assertions are formula-based (classification_annual(c)/4 * 0.10) so
          they remain correct if the seeded L6/L7 annuals are revised later;
          Level 8 pins the canonical $1,952.65 number from the bug report and
          a sanity guard ensures we never return the old buggy $1,757.39;
          rollover_cap >= $1,000 invariant verified for every classification;
          quarterly_budget() post-CM contract verified unchanged.

agent_communication:
  - agent: "main"
    message: |
      Rollover-cap fix shipped. budget.py rollover_cap() now uses the gross
      quarterly base. Verified no regression on:
        - tests/test_pension_rates.py (10 pass, 1 skip - rate-limit)
        - tests/test_price_caps_removed.py (6 pass)
        - tests/test_rollover_cap.py (8 pass)
        - tests/test_iter17_okafor.py (cached - pass)
      Combined: 40 passed, 1 skipped. agents.py Rule 13 reads gross
      quarterly from the statement header — added a clarifying code comment
      but no maths change required. No frontend code change needed; the
      Budget Calculator and Reports pages already display API-returned
      rollover figures.


backend:
  - task: "F5: Contribution Estimator uses gross annual base (classification_annual)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          /api/public/contribution-estimator now sets
          annual_service = budget_lib.classification_annual(c) instead of
          quarterly_budget(c) * 4 — old base was 10% low.

  - task: "F6: cshc cohort + optional user-supplied rates + band_range output"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Pension status pattern now accepts full|part|cshc|self.
          Optional independence_rate_pct + everyday_rate_pct fields validated
          against the cohort band (400 with helpful message if outside).
          Response shape: exact cohorts return scalar annual/quarterly_contribution
          and rate_basis='exact_rate'/'user_supplied'; band cohorts without user
          rates return annual_contribution=null + annual_contribution_low/high +
          rate_basis='band_range' + a Services Australia caveat. years_to_cap
          mirrors the same convention (years_to_cap_low/high).

  - task: "F9: Budget Calculator labels — quarterly_gross + care_management_quarterly + quarterly_usable (with quarterly_total alias)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          /api/public/budget-calc and /api/budget/current both expose
          quarterly_gross (annual/4), care_management_quarterly (gross-usable),
          quarterly_usable (post-CM). quarterly_total kept as a deprecated
          alias of quarterly_usable for one release with TODO marker.

  - task: "test_contribution_estimator.py (6 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_contribution_estimator.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Covers (1) gross annual base + exact-rate path, (2) band_range
          output for part with no user rates, (3) user_supplied with exact
          rates, (4) 400 when user rate outside band, (5) cshc band wider
          than part, (6) mix !=100% returns 400.

  - task: "test_budget_calc_labels.py (3 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_budget_calc_labels.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Parametrized over classifications 1, 4 and 8: quarterly_gross ==
          round(annual/4, 2); care_management_quarterly == round(gross*0.10, 2);
          quarterly_usable == round(gross*0.90, 2); quarterly_total alias.

frontend:
  - task: "Contribution Estimator UI: CSHC option + optional rate inputs + band_range / caveat rendering"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/tools/ContributionEstimator.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Pension grid now 4 options (Full, Part, CSHC with Services Australia
          help text, Self-funded). Part / CSHC reveal two optional rate inputs
          (data-testid ce-independence-rate, ce-everyday-rate). Result block
          switches to range display when rate_basis === 'band_range', shows
          range for annual + quarterly + per-stream, and renders the caveat
          (data-testid ce-caveat) explaining Services Australia sets the
          exact rate. years_to_cap shows a span when only low/high is
          available. ce-error testid surfaces 400 detail.

  - task: "Budget Calculator UI: gross / care management / usable three-card layout"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/tools/BudgetCalculatorTool.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Top result row replaced with a three-card grid: bc-quarterly-gross,
          bc-care-management, bc-quarterly-usable. Annual total moved to a
          compact summary strip. UI falls back to the legacy quarterly_total
          alias when the API hasn't rolled out yet.

agent_communication:
  - agent: "main"
    message: |
      Iteration 42 shipped F5/F6/F9. Combined regression: 32 passed, 2 skipped
      (skips are the existing pension band + estimator integration cases when
      the per-IP 5/hour rate-limit is exhausted). Test scripts clear the
      tools_* Redis buckets between runs to keep CI stable. Frontend pages
      hot-reloaded; blocked-state screenshot confirmed the gated branch still
      renders correctly. Existing CaregiverDashboard continues to read
      quarterly_total (kept as a deprecated alias) without any frontend change.


backend:
  - task: "Stream allocations labelled indicative + use statement header when present"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          /api/public/budget-calc — every entry in streams[] now carries
          indicative:true and the response adds allocation_source='program_average'
          + streams_note ("Indicative split only..."). /api/budget/current scans
          the household's statements for the most recent one with non-empty
          header_stream_budgets; when found, the per-stream allocations come
          from the statement (allocation_source='statement', indicative:false,
          streams_note references the statement period). Otherwise it falls
          back to the program-average split. The decoder schema now extracts
          header_stream_budgets and the statement upload persists it on the
          db.statements document.

  - task: "test_stream_allocation_source.py (3 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_stream_allocation_source.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          (1) Public budget-calc marks streams indicative + allocation_source
          program_average + Note copy contains 'individualised budget'.
          (2) Dashboard /api/budget/current falls back to program_average when
          a household statement carries no header_stream_budgets.
          (3) Dashboard uses statement figures + allocation_source 'statement'
          when a recent statement has header_stream_budgets, and the streams
          array matches the persisted figures.

frontend:
  - task: "Budget Calculator + Dashboard: indicative badge / statement-source banner"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/tools/BudgetCalculatorTool.jsx, /app/frontend/src/pages/CaregiverDashboard.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          BudgetCalculatorTool — per-stream card now shows a pill badge
          (bc-streams-source data-testid) reading either "Indicative split"
          (amber) or "From your latest statement" (sage) and renders
          streams_note below the rows. Dashboard's stream grid gains a
          dashboard-streams-note disclaimer with the same source badge.

agent_communication:
  - agent: "main"
    message: |
      Iteration 43 — stream-allocation labelling shipped. Backend exposes
      allocation_source + indicative flags + streams_note on both /budget-calc
      and /budget/current. Decoder schema/prompt extracts header_stream_budgets
      and the statement upload pipeline persists it on db.statements so the
      dashboard can switch from MVP averages to the participant's actual
      allocation. Combined regression: 51 passed, 2 skipped (per-IP rate limit).


backend:
  - task: "Statement Anomaly model: persist rule, dollar_impact, evidence, raw_severity"
    implemented: true
    working: true
    file: "/app/backend/models.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Anomaly model extended with rule (Optional[str]), dollar_impact
          (Optional[float]), evidence (List[str], default factory []), and
          raw_severity (Optional[str] — decoder's high/medium/low before the
          display map). model_config extra='ignore' + safe defaults mean old
          Mongo docs load unchanged. Statement model gains
          anomaly_dollar_impact_total (float, default 0.0) and
          informational_notes (List[dict], default []).

  - task: "_run_upload_job: copy decoder metadata + aggregates onto Statement"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Anomaly mapping pulls rule, dollar_impact, evidence and raw_severity
          off each audit anomaly. anomaly_dollar_impact_total sums every
          non-negative dollar_impact (clamped at 0). informational_notes
          copied verbatim from audit.informational_notes (dict entries only).
          Statement detail endpoints already return the full Statement model
          and the only field exclusion is file_b64 — new fields flow through.

  - task: "tests/test_anomaly_persistence.py (3 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_anomaly_persistence.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          (1) Audit dict → Anomaly mapping carries rule, dollar_impact (None
          when zero), evidence, raw_severity; anomaly_dollar_impact_total
          rolls up correctly. (2) Statement.model_dump() round-trips the
          new aggregates and per-anomaly keys. (3) Legacy doc without
          rule/dollar_impact/evidence/raw_severity/anomaly_dollar_impact_total
          loads cleanly with safe defaults.

frontend:
  - task: "StatementDetail anomaly card: dollar impact + rule key + evidence"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/StatementDetail.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Anomaly card now shows a header pill with total potential impact
          (anomalies-total-impact testid), per-row "Potential impact: $X"
          when dollar_impact > 0, an expandable "Why was this flagged?"
          section listing evidence entries, and a small monospaced rule
          caption (anomaly-rule-<id> testid) at the bottom of each row.

agent_communication:
  - agent: "main"
    message: |
      Iteration 44 — decoder metadata now lives on persisted statements.
      54 passed, 2 skipped across the cross-iteration regression suite.
      Old Mongo documents continue to load cleanly via Pydantic defaults.


backend:
  - task: "Public chat tool rebranded to Aged Care Q&A + system prompt hardening"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          New canonical route POST /api/public/aged-care-chat backed by the
          extracted handler _aged_care_qa_handler. Legacy
          /public/family-coordinator-chat remains as a deprecation alias
          calling the same handler. _require_paid_plan label updated to
          "Aged Care Q&A". System prompt extended with explicit data-boundary
          instructions: model has no household data, must not invent dollar
          figures, must route household-specific questions to the in-app
          assistant. CHAT_SYSTEM_TEMPLATE (authenticated /api/chat) untouched
          — confirmed via git log.

  - task: "tests/test_aged_care_qa_chat.py (4 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_aged_care_qa_chat.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Live API: (1) new /aged-care-chat returns a non-empty reply,
          (2) legacy /family-coordinator-chat alias still returns a reply,
          (3) "what is mum's budget" returns a reply containing NO dollar
          regex match AND containing one of the redirect keywords
          (sign in / signed in / in-app / household etc),
          (4) static check on server.AGED_CARE_QA_SYSTEM prompt asserts
          "no access" + "household" + "signed-in/in-app" present and the
          old "Family Care Coordinator" brand is absent.

frontend:
  - task: "Sweep tool name 'Family Coordinator' → 'Aged Care Q&A'"
    implemented: true
    working: true
    file: |
      /app/frontend/src/pages/tools/FamilyCoordinator.jsx,
      /app/frontend/src/seo/pageConfig.js,
      /app/frontend/src/pages/AIToolsIndex.jsx,
      /app/frontend/src/pages/Features.jsx,
      /app/frontend/src/pages/Pricing.jsx,
      /app/frontend/src/components/CommandPalette.jsx,
      /app/frontend/src/data/{seoToolArticles,toolArticles2026,guides,articlePillars}.js,
      /app/frontend/src/App.js
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Tool page header, blocked-state ToolGate label, hero copy, hero
          subtext ("can't see your account…") all updated. Public API call
          switched to /public/aged-care-chat. SEO config + 8-tools index +
          Features + Pricing comparison + CommandPalette all renamed. Long
          SEO articles that referred to the Family-plan coordination feature
          were updated to call that feature "Wayly Family Hub" so the Q&A
          tool name + the Family-plan feature stay distinct. New
          /ai-tools/aged-care-qa route registered (renders the same component);
          /ai-tools/family-coordinator stays live as the legacy slug for SEO.
          Repo grep confirms no user-facing "Family Coordinator" string left.

agent_communication:
  - agent: "main"
    message: |
      Iteration 45 — public chat rebranded to "Aged Care Q&A". Authenticated
      /api/chat handler + CHAT_SYSTEM_TEMPLATE untouched. Combined
      regression: 39 passed, 5 skipped (skips are the per-IP 5-uses/hour
      rate-limit collisions when the LLM chat suite + the older estimator
      suite run back-to-back). Each test handles 429 explicitly.


backend:
  - task: "F10: Care Plan Reviewer six structured checks + deterministic numeric post-pass"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          PublicCarePlanBody now accepts optional classification (1-8) and
          quarterly_budget (float). System prompt rewritten to emit a strict
          JSON shape with a "checks" array (budget_fit, care_management_cap,
          service_list, stream_alignment, review_date, goals_alignment) plus
          the existing coverage/gaps/questions_to_raise sections. Server
          normalises the checks array to always contain all six canonical
          keys in order with status in {pass,flag,unknown}.
          Deterministic post-pass (mirrors the decoder's Rule 9 pattern):
          (a) care_management_cap — extracts a "care management ... X%"
          figure from the plan and overrides verdict to pass/flag against the
          10% Support at Home ceiling.
          (b) budget_fit — when quarterly_budget supplied, computes monthly
          $ via a regex over "$X per hour/week/fortnight/month/visit/session"
          lines, derives quarterly = monthly × 3, flags when above 90% of the
          supplied budget. Both checks fall back to "unknown" when no
          numbers were parsed.

  - task: "F13: Reassessment Letter Generator — three letter types"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          PublicReassessmentBody now carries letter_type with pattern
          ^(classification_reassessment|rcp_assessment|care_plan_amendment)$
          (default = classification_reassessment, so existing callers stay
          unchanged) plus optional hospital_name + discharge_date (used by
          the RCP letter only). _LETTER_TYPE_SYSTEM maps each type to a
          dedicated system prompt sharing the existing 250-400 word,
          gender-neutral, no-diagnosis, no-claimed-outcome rules. The
          rcp_assessment prompt is required to: use the words "Restorative
          Care Pathway"; reference the recent hospital discharge when given;
          describe the functional decline; ask for the assessment to be
          scheduled inside 14 days; and include a single line stating that
          RCP funding is separate from the participant's quarterly budget.
          Response now also returns letter_type for clients to display.

  - task: "tests/test_careplan_checks.py (5 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_careplan_checks.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          (1) care_management at 12% with quarterly_budget supplied returns
          status='flag' citing 12% and the 10% cap.
          (2) care_management at 8% returns status='pass'.
          (3) Plan with services exceeding 90% of the supplied quarterly
          budget returns budget_fit status='flag' with detail noting the
          exceedance.
          (4) Omitting quarterly_budget + classification leaves the checks
          well-formed (status in {pass,flag,unknown}).
          (5) All six canonical check keys always present in canonical order.

  - task: "tests/test_letter_types.py (4 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_letter_types.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          (1) rcp_assessment letter contains the exact phrase "Restorative
          Care Pathway", references the supplied hospital, and includes the
          "separate / does not reduce / not deducted" line about RCP funding
          being separate from the quarterly budget.
          (2) care_plan_amendment letter references "care plan".
          (3) Invalid letter_type returns HTTP 422 via Pydantic.
          (4) Default letter_type stays classification_reassessment with no
          regression in word_count.

frontend:
  - task: "Care Plan Reviewer + Reassessment Letter UI: optional context, six-check card, letter-type selector + RCP hospital fields"
    implemented: true
    working: true
    file: |
      /app/frontend/src/pages/tools/CarePlanReviewer.jsx,
      /app/frontend/src/pages/tools/ReassessmentLetter.jsx
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          CarePlanReviewer: form gains a "Classification level" select and
          "Quarterly budget ($)" input (data-testids cp-classification,
          cp-quarterly-budget). Result renders a new "Six structured checks"
          card (data-testid cp-checks) with one row per check, pass/flag/
          unknown coloured pill, friendly label and the note from the
          backend.
          ReassessmentLetter: top-of-form letter-type selector with three
          radio-style cards (data-testids rl-type-<type>), conditional
          hospital_name + discharge_date inputs that only appear for the
          rcp_assessment type (data-testid rl-rcp-fields). API payload
          strips the RCP-only fields for the other two letter types.

agent_communication:
  - agent: "main"
    message: |
      Iteration 46 — Care Plan Reviewer rebuilt around the six structured
      checks with a deterministic post-pass for the two arithmetic checks
      (budget fit + care management cap). Reassessment Letter Generator now
      drafts three letter types (classification reassessment, RCP, care
      plan amendment) with conditional context fields. 9/9 new tests pass
      (run takes ~3 min because of the LLM calls). UI updates verified via
      screenshot — gated state still renders cleanly.


backend:
  - task: "Phase 2 — H: rollover_cap reverted to post-CM quarterly × 10%"
    implemented: true
    working: true
    file: "/app/backend/budget.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          rollover_cap() now uses the post-care-management quarterly_budget()
          * 10% with $1,000 floor, rounded to 2 dp. This matches Aged Care
          Rules 2025 section 193-5: "10% × base individual daily amount ×
          days in the quarter". The brief gross-base version was a misread
          of the section and has been reverted. test_rollover_cap.py
          rewritten — L8 returns $1,757.39, L1/L4 hit the $1,000 floor,
          L6/L7 assertions remain formula-based.

  - task: "Phase 2 — I: authoritative classification figures (Aged Care Rules 2025)"
    implemented: true
    working: true
    file: "/app/backend/seed_program_reference.py, /app/backend/budget.py, /app/backend/program_reference.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Seed now carries the daily_base_individual + daily_base_provider +
          daily_total + classification_annual for all eight classifications,
          sourced from Aged Care Rules 2025 sections 194-5(2) and 238-5.
          Corrected annuals: L2=$16,034, L3=$21,966, L5=$39,697, L6=$48,114,
          L7=$58,148 (L1/L4/L8 unchanged). _FALLBACK_ANNUAL updated to match.
          A new apply_reseed_for_authoritative_keys() startup hook overwrites
          existing rows where the seed value disagrees, with an audit trail
          in program_reference_history.

  - task: "Phase 2 — J: transitional HCP figures + budget-calc routing"
    implemented: true
    working: true
    file: "/app/backend/seed_program_reference.py, /app/backend/budget.py, /app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Seeded transitional_hcp.{1-4}.{daily_base_individual,
          daily_base_provider, daily_total, annual_aud} per Aged Care Rules
          2025 section 194-5(3). New budget helpers
          classification_annual_transitional() and
          quarterly_budget_transitional() with safe fallbacks.
          /api/public/budget-calc accepts transitional_classification (1-4)
          override; otherwise routes to transitional figures when
          is_grandfathered=True AND classification in 1-4. L5+ with
          is_grandfathered raises HTTP 400 with a clear explanation.
          Response now includes is_transitional_hcp flag.

  - task: "Phase 2 — K: short-term pathways + assistance dog tier"
    implemented: true
    working: true
    file: "/app/backend/seed_program_reference.py, /app/backend/program_reference.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Seeded pathway.restorative_care.* ($53.67/day × 112 days, 2 max
          episodes) and pathway.end_of_life.* ($298.04/day × 84 days) per
          Aged Care Rules 2025 section 194-10(2). Assistance dog tier
          ($2,000/year, no rollover) seeded under athm.assistance_dog.*.
          New helpers program_reference.get_pathway() and
          public_snapshot() now includes pathways + assistance_dog_tier
          + athm_tiers + supplements blocks.

  - task: "Phase 2 — L: AT-HM tiers + Rule 11B"
    implemented: true
    working: true
    file: "/app/backend/seed_program_reference.py, /app/backend/agents.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Full AT-HM tier table seeded — low $500, medium $2,000, high
          $15,000 (one per lifetime, exceedance allowed with evidence),
          duration 12 months + 12-month extension with evidence, MM6/MM7
          50% remote supplement loading. New RULE_11B_ATHM_AMOUNT_EXCEEDS_TIER
          deterministic post-pass flags AT-HM line items > $15,000 when
          provider_notes_raw does NOT contain "exceedance approved".

  - task: "Phase 2 — M: six primary supplements + helpers"
    implemented: true
    working: true
    file: "/app/backend/seed_program_reference.py, /app/backend/program_reference.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Seeded oxygen ($14.66/day), enteral_bolus ($23.25/day),
          enteral_non_bolus ($26.11/day), veterans (11.5% of base individual
          daily), dementia_cognition (11.5%, grandfathered HCP only),
          eachd_top_up ($3.45/day, grandfathered), and
          care_management_provider ($3.95/day, provider-only). New
          program_reference.get_supplement() and list_supplements() helpers.

  - task: "Phase 2 — N: supplements wired into budget calc + decoder + Ask Wayly"
    implemented: true
    working: true
    file: "/app/backend/server.py, /app/backend/agents.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          /api/public/budget-calc accepts applicable_supplements: list[str].
          Per-supplement: skips when unrecognised, when provider-only
          (care_management_provider), or when grandfathered-only and
          is_grandfathered=False. Computes annual_supplements_total +
          annual_total_with_supplements + applied_supplements array
          + supplement_warnings. Decoder schema gains "supplement" stream;
          extractor prompt instructs the LLM to extract supplement line
          items with stream=supplement and lower-snake-case service_code.
          New RULE_16_SUPPLEMENT_AMOUNT_VARIANCE deterministic post-pass
          flags supplement line items whose daily rate differs from the
          seeded value by more than $0.50. Ask Wayly CHAT_SYSTEM_TEMPLATE
          documents all six supplements + two pathways with rule-section
          citations. Care-management computation (RULE_1B) now excludes
          stream=supplement lines from the monthly gross.

  - task: "Phase 2 — new pytest suite test_phase2_authoritative.py (17 cases)"
    implemented: true
    working: true
    file: "/app/backend/tests/test_phase2_authoritative.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Live API + Mongo coverage of prompts H–N: classification annual
          corrections, transitional HCP routing + L5 rejection, pathway
          + assistance dog snapshot, AT-HM tier helper, Rule 11B fire +
          silent paths, supplement helpers + grandfathered/provider
          filtering, budget-calc supplement maths, decoder Rule 16
          silent/flagged paths, Ask Wayly template documents supplements.
          17 passed.

agent_communication:
  - agent: "main"
    message: |
      Phase 2 (prompts H–N) landed. Combined regression — phase 2 suite +
      rollover + pension + caps + stream allocation + decoder metadata +
      budget labels + contribution estimator + Okafor decoder fixture: 63
      passed, 9 skipped (rate-limit collisions in older suites that don't
      auto-clear buckets — none of those skips are this iteration's
      responsibility).


backend:
  - task: "Iteration 48 — drop quarterly_total alias + drop /public/family-coordinator-chat alias"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          /api/public/budget-calc and /api/budget/current no longer return
          the deprecated quarterly_total alias. Existing consumers
          (CaregiverDashboard, BudgetCalculatorTool, backend_test.py) all
          migrated to quarterly_usable. Legacy POST
          /api/public/family-coordinator-chat removed — the
          test_aged_care_qa_chat suite now asserts the route returns 404/405.

  - task: "Iteration 48 — eligible-pathways endpoint + dashboard tile"
    implemented: true
    working: true
    file: "/app/backend/server.py, /app/frontend/src/pages/CaregiverDashboard.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          New GET /api/budget/eligible-pathways. Scans the household's
          recent statements + life-event fields for RCP triggers
          (hospital discharge, rehab, stroke, fall, fracture, transfer
          assistance, mobility decline, functional decline) and EoL
          triggers (palliative, prognosis, comfort care, advance care
          directive, 3 months). When a trigger fires, returns the seeded
          pathway figures plus reason copy + Aged Care Rules section
          citation + a next_step deeplink into the Reassessment Letter
          Generator with letter_type=rcp_assessment pre-selected.
          CaregiverDashboard loads /budget/eligible-pathways in parallel
          and renders a dashboard-pathways tile beneath the streams
          disclaimer (data-testids dashboard-pathway-<name>,
          dashboard-pathway-cta-<name>). Returns 200 with empty list +
          friendly disclaimer when no household is linked.

  - task: "Iteration 48 — refactor: extract tool constants + helpers into lib.tool_helpers"
    implemented: true
    working: true
    file: "/app/backend/lib/__init__.py, /app/backend/lib/tool_helpers.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          First-step server.py refactor — ~210 lines moved out into
          backend/lib/tool_helpers.py: PRICE_BENCHMARKS, PENSION_RATES,
          CARE_PLAN_CHECK_KEYS, parse_care_management_pct,
          try_parse_monthly_total, estimate_monthly_total_from_plan_text.
          server.py re-imports under their existing private names so all
          external callers keep working. Foundation laid for the upcoming
          route-by-route split.

frontend:
  - task: "Iteration 48 — applicable_supplements multi-select in Budget Calculator"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/tools/BudgetCalculatorTool.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          New "Applicable supplements (optional)" picker with six
          checkboxes (oxygen, enteral bolus, enteral non-bolus, veterans,
          dementia_cognition, eachd_top_up — data-testids
          bc-supplement-<value>). Selected supplements forwarded to the
          API; result block renders a new "Supplements" card
          (data-testid bc-supplements-result) with per-supplement annual
          values, a combined annual_total_with_supplements line and a
          terracotta-coloured supplement_warnings list when the backend
          filters out provider-only or grandfathered-only entries.
          Existing fallback values updated to the Aged Care Rules 2025
          authoritative annuals.

agent_communication:
  - agent: "main"
    message: |
      Iteration 48 — Phase 2 follow-ups landed. quarterly_total alias and
      legacy family-coordinator-chat route removed (callers migrated).
      Pathway eligibility surface live end-to-end (API + dashboard tile).
      Budget Calculator UI now consumes applicable_supplements. server.py
      refactor: lib/tool_helpers.py created with ~210 lines extracted —
      no regressions. The full route-split refactor is teed up but kept
      as its own focused iteration so it doesn't ship alongside three
      product surfaces. Combined regression: 47 passed, 9 skipped (older
      suite rate-limit collisions).


## INV-1 Parity v1 (Invoice Checker → Statement-Decoder-grade, web + mobile)
backend:
  - task: "Invoice download/export endpoints: GET /invoices/{id}/download?kind=original|report, GET /invoices/{id}/export.csv"
    implemented: true
    working: true
    file: "/app/backend/routes/invoices.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          New endpoints stream the original uploaded invoice (kind=original,
          inline), the Wayly check-report PDF (kind=report, via
          services.inv1_check_report_pdf), and a CSV of the decoded invoice
          (header + line items + issue register). Verified via curl on
          cathy@example.com invoice 2acaf9f3-...: CSV 200 + correct filename,
          report PDF 20642 bytes, original PDF 9435 bytes. /findings/{i}/letter
          bridge returns editor_path (source-aware LF-1 entry).
frontend:
  - task: "Web Invoice Checker result: collapsible High/Med/Low issue groups + charges (line items) table + download/compare bar + source-aware draft-letter"
    implemented: true
    working: true
    file: "/app/frontend/src/components/invoices/InvoiceResultView.jsx, /app/frontend/src/pages/InvoiceDetail.jsx, /app/frontend/src/pages/tools/InvoiceCheckerTool.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          InvoiceIssueRegister rebuilt into collapsible severity bands
          (High/Medium/Low) mirroring the Decoder SeverityGroup, per-issue
          Draft letter (now POSTs /invoices/{id}/findings/{i}/letter →
          navigates to LF-1 editor, source-aware), refund + line hints. New
          InvoiceChargesTable (collapsible line-item table), InvoiceDownloadBar
          (Original / CSV / PDF), InvoiceCompareView (original PDF side-by-side
          with decoded charges). Wired into InvoiceDetail + InvoiceCheckerTool.
          Smoke-verified via authenticated screenshot: banner, download bar
          (Compare/Original/CSV/PDF), 3 severity groups, charges table render.
  - task: "Mobile Invoice Checker parity: collapsible groups + charges + download bar + draft-letter"
    implemented: true
    working: "NA"
    file: "/app/mobile/src/components/invoices/InvoiceResultView.tsx, /app/mobile/app/invoice/[id].tsx, /app/mobile/src/components/tools/InvoiceChecker.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Mirrored web: collapsible High/Med/Low SeverityGroup, IssueCard with
          Draft letter (POST /findings/{i}/letter → Alert → /correspondence),
          InvoiceChargesTable (per-line cards), InvoiceDownloadBar
          (Original/CSV/PDF via downloadAndShare). Lint clean. Not yet runtime-
          verified on Expo preview.

agent_communication:
  - agent: "main"
    message: |
      Phase 2 (Invoice Checker → Statement-Decoder parity) built on web + mobile.
      Please test BOTH platforms. Test creds cathy@example.com / testpass123
      (Family). Web route /app/invoices/{id} and tool /ai-tools/invoice-checker;
      mobile /invoice/{id} and /tool/invoice-checker. Existing seeded invoices
      for cathy include 2acaf9f3-0190-47e7-b9c7-c939c579b49b (Glorious Services,
      18 findings, 29 lines). Verify: collapsible High/Med/Low groups toggle;
      charges/line-item table shows; downloads (Original/CSV/PDF) succeed;
      per-issue Draft letter creates an LF-1 entry (web navigates to editor,
      mobile shows confirm + routes to /correspondence); web Compare shows the
      original PDF beside decoded charges. Parity across surfaces.

## Letters Parity + Invoice Filters + Draft-All (iter 233, web + mobile)
backend:
  - task: "POST /api/invoices/{id}/letter — draft ONE LF-1 letter covering all findings"
    implemented: true
    working: true
    file: "/app/backend/routes/invoices.py"
    status_history:
      - working: true
        agent: "main"
        comment: "Verified curl: returns entry_id, situation_id, issue_count=18, editor_path. Aggregates all findings into source_import.issues."
frontend:
  - task: "Web Letters Mailbox rebuilt on LF-1 (parity with mobile): 'Draft a new letter' button → /ai-tools/letters-and-follow-ups, LF-1 entries list → editor, overdue/upcoming follow-ups; legacy LF-2 chains kept below"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/LettersMailbox.jsx"
  - task: "Web Invoices list filters (search + provider + period + status) matching Statements"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/InvoicesList.jsx, /app/frontend/src/components/invoices/InvoiceFilters.jsx"
    status_history:
      - working: true
        agent: "main"
        comment: "Smoke screenshot confirms filter bar (search/provider/period/status + result count) renders on /app/invoices."
  - task: "Web + mobile 'Draft one letter for all issues' button in Issue Register"
    implemented: true
    working: "NA"
    file: "InvoiceResultView.jsx/.tsx, InvoiceDetail.jsx, tools/InvoiceCheckerTool.jsx, mobile invoice/[id].tsx, tools/InvoiceChecker.tsx"
  - task: "Mobile Invoices list filters (search + status chips + provider chips)"
    implemented: true
    working: "NA"
    file: "/app/mobile/app/invoices.tsx"
agent_communication:
  - agent: "main"
    message: |
      iter 233 batch. Test BOTH platforms. Creds cathy@example.com/testpass123.
      1) Letters Mailbox web (/app/letters): 'Draft a new letter' (testid letters-new-btn)
         opens /ai-tools/letters-and-follow-ups; LF-1 entries (letter-{id}) link to
         /tools/letters-and-follow-ups/{id}; follow-ups cards. Confirm parity with
         mobile /letters (letters-new button → /tool/letters-and-follow-ups).
      2) Invoice filters web (/app/invoices): invoices-search-input, invoices-provider-filter,
         invoices-period-filter, invoices-status-filter, invoices-clear-filters,
         invoices-result-count, invoices-list-no-results. Mobile /invoices:
         invoices-search-input, invoices-status-{all|issues|all_clear}, provider chips,
         invoices-clear-filters, invoices-list-no-results.
      3) Draft-all: inv1-draft-all-btn appears when >1 finding on both invoice detail
         and the tool result (web → navigates to letter editor; mobile → Alert →
         /correspondence). Backend POST /api/invoices/{id}/letter.
      Do not re-test the iter232 invoice result view internals (already passed) beyond
      confirming the new draft-all button.

## Parity items 4-6 (iter 234): decode-message parity, Contribution Position nav, Reports catalog
frontend:
  - task: "Decode-in-progress message parity — statement shows 'Reading the statement…' on web + mobile; invoice shows 'Reading your invoice…' on web + mobile"
    implemented: true
    working: "NA"
    file: "/app/mobile/app/upload.tsx, /app/frontend/src/pages/tools/InvoiceCheckerTool.jsx (web StatementUpload already correct)"
  - task: "Web Contribution Position discoverable in nav (Money & Statements → Contribution Position → /app/contribution-position, resolves active participant)"
    implemented: true
    working: true
    file: "/app/frontend/src/components/Layout.jsx, /app/frontend/src/App.js, /app/frontend/src/pages/ContributionPosition.jsx"
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshot: /app/contribution-position loads CE-3 page with lifetime cap ($800 of $137,917), no id in URL — falls back to active participant."
  - task: "Mobile Reports catalog visible upfront (report cards with name/desc/best-for + Generate) matching web, instead of hidden behind 'Generate a report' picker"
    implemented: true
    working: "NA"
    file: "/app/mobile/app/reports.tsx"
agent_communication:
  - agent: "main"
    message: |
      iter234. Test BOTH platforms. Creds cathy@example.com/testpass123.
      4) Decode message: mobile /upload during statement decode shows 'Reading the statement…'
         (upload-submit-button label + upload-decoding-note); invoice tool 'Reading your invoice…'.
         Web statement upload already 'Reading the statement…'; web invoice tool button 'Reading your invoice…'.
         Just confirm wording matches across surfaces.
      5) Web nav: Money & Statements group has 'Contribution Position' → /app/contribution-position
         (data-testid ce3-contribution-position-page loads, resolves active participant, no ce3-error).
      6) Mobile /reports: catalog (reports-catalog with report-card-{TYPE} x8, each generate-{TYPE} button)
         is visible upfront on load WITHOUT tapping a Generate button first; 'Your reports' history below.
         Confirm parity with web /app/reports catalog (report-card-{TYPE}, generate-{TYPE}).

## CHSP-TOOLS-1 WS-1 per-unit Fee Check + WS-3 Access/Hardship (iter 235, web + mobile, behind chsp_tools_v1 flag)
backend:
  - task: "WS-1 per-unit Fee Check engine lib/chsp1/fee_check.py + golden pytest (CHSP-FIX-1..5 + boundary + directionality)"
    implemented: true
    working: true
    file: "/app/backend/lib/chsp1/fee_check.py, /app/backend/tests/test_chsp_fee_check_golden.py"
    status_history:
      - working: true
        agent: "main"
        comment: "7/7 golden pytest pass. Decimal half-up; rate bands max(2%,$0.50)/max(10%,$2.00) per unit; units within/minor(<1)/material(>=1); directionality guards; 90-day staleness → provisional; degraded (no agreed rate) → no_verdict + prompt_add_agreed_rate."
  - task: "Endpoints: GET /api/chsp1/config (flag), POST /api/chsp1/fee-check/preview (WS-1), POST /api/chsp1/letter (WS-3 service_continuity/hardship → LF-1 editor_path)"
    implemented: true
    working: true
    file: "/app/backend/routes/chsp1.py"
    status_history:
      - working: true
        agent: "main"
        comment: "Verified curl: config chsp_tools_v1=true; preview material (verdict material, per_unit 10.00, delta 4.00, dispute true) + degraded (prompt_add_agreed_rate true); letter returns editor_path."
frontend:
  - task: "Web CHSP Tools WS-1 fee check form + result (verdict/per-unit/expected/delta/rate+units tier), degraded state, staleness prompt, WS-3 Access & Hardship card (hardship emphasised on material)"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/ChspTools.jsx"
    status_history:
      - working: true
        agent: "main"
        comment: "Screenshot at /app/chsp/tools: FIX-2 inputs → Material verdict, Difference $4.00, billed/unit $10.00, expected $6.00, rate Material/units Within; hardship card emphasised with material hint."
  - task: "Mobile CHSP Tools WS-1 + WS-3 parity"
    implemented: true
    working: "NA"
    file: "/app/mobile/app/chsp-tools.tsx"
agent_communication:
  - agent: "main"
    message: |
      iter235 CHSP WS-1/WS-3. Behind flag chsp_tools_v1 (GET /api/chsp1/config
      → {chsp_tools_v1:true} in this env). Creds cathy@example.com/testpass123
      (has a CHSP profile; the fee-check form only shows once a profile exists).
      Web route /app/chsp/tools; mobile /tool/chsp-tools (chsp-tools.tsx).
      Test the WS-1 engine via golden cases through the UI:
        FIX-1 agreed 6 / recv 4 / billed 4 / amount 24 → Within, no dispute.
        FIX-2 agreed 6 / 1 / 1 / 10 → Material, diff $4.00, dispute, hardship emphasised.
        FIX-3 agreed 6 / recv 4 / billed 5 / amount 30 → units Material, diff $6.00.
        FIX-4 no agreed rate / 4 / 4 / 24 → degraded, prompt to add rate, no verdict.
        FIX-5 agreed 6 effective 01/01/2026, period start 01/07/2026, 4/4/24 → Within but provisional (181 days).
      testIDs: chsp-ws1-fee-check, chsp-ws1-agreed-rate, chsp-ws1-units-billed,
      chsp-ws1-units-received, chsp-ws1-billed, chsp-ws1-rate-date,
      chsp-ws1-period-start, chsp-ws1-submit, chsp-ws1-result, chsp-ws1-verdict,
      chsp-ws1-degraded, chsp-ws1-staleness, chsp-access-hardship,
      chsp-service-continuity-letter, chsp-hardship-letter, chsp-hardship-hint.
      WS-3: service continuity + hardship buttons create an LF-1 draft (web
      navigates to editor; mobile Alert → /correspondence).

## CHSP WS-2/WS-5/WS-6 + DD/MM/YYYY + dropdown capitalisation + agreed-rate prefill (iter 236, web + mobile)
backend:
  - task: "WS-6 canonical fixture set + CI runner; golden suite now 8/8 (adds test_canonical_fixture_set)"
    implemented: true
    working: true
    file: "/app/backend/tests/fixtures/chsp_fee_check_fixtures.json, /app/backend/tests/test_chsp_fee_check_golden.py, /app/backend/scripts/ci_chsp.sh"
    status_history:
      - working: true
        agent: "main"
        comment: "8/8 pass; ci_chsp.sh runs golden + WS-1 API suites."
frontend:
  - task: "WS-2 reframe: headline 'Check your CHSP billing.', two-sided step 2, Transition walkthrough demoted behind 'Is CHSP still the right fit?' self-check, not-advice disclaimer (web + mobile)"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/ChspTools.jsx, /app/mobile/app/chsp-tools.tsx"
    status_history:
      - working: true
        agent: "main"
        comment: "Web screenshot: new headline, self-check present, walkthrough hidden until chsp-needs-change ticked (0→1), disclaimer present."
  - task: "WS-5 date+enum sweep: DD/MM/YYYY on CHSP dates (display + inputs), capitalised dropdown labels (serviceTypeLabel/chspStatusLabel), 'Transitioning to Support at Home'. Shared labels util web+mobile"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/lib/labels.js, /app/mobile/src/utils/labels.ts, ChspTools.jsx, chsp-tools.tsx"
  - task: "Agreed Rate Schedule prefill: selecting a saved service entry pre-fills agreed_rate + rate_effective_date so the degraded state clears (web + mobile)"
    implemented: true
    working: "NA"
    file: "ChspTools.jsx, chsp-tools.tsx"
agent_communication:
  - agent: "main"
    message: |
      iter236. Test web (auth injectable) + backend; mobile is a mirror.
      Creds cathy@example.com/testpass123 (has CHSP profile). Web /app/chsp/tools.
      Verify: (WS-2) headline 'Check your CHSP billing.'; chsp-fit-self-check present;
      chsp-transition-walkthrough hidden until chsp-needs-change checkbox ticked;
      tw-two-sided note in step 2; chsp-disclaimer present. (WS-5) CHSP service-type
      dropdown options are capitalised ('Domestic assistance' etc.); status option
      'Transitioning to Support at Home'; profile summary date renders DD/MM/YYYY;
      WS-1 date fields accept DD/MM/YYYY text. (Agreed rate) picking a service entry
      in chsp-ws1-service-entry prefills chsp-ws1-agreed-rate. Do NOT re-run the
      iter235 WS-1 golden verdicts (unchanged) beyond a sanity check.
