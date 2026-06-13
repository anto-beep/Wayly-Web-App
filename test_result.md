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

