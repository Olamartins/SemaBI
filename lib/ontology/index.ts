export interface OntologyConcept {
  key: string; // "<domain>.<concept>"
  domain: string;
  label: string;
  description: string;
  unit: string;
  requiredDimensions: string[];
  aliases: string[]; // used by fuzzy auto-suggest
  /** DAX template rendered when the bank has no measure for this concept (gap remediation). */
  daxGapTemplate: string;
}

export interface OntologyDomain {
  key: string;
  label: string;
  concepts: OntologyConcept[];
}

const C = (
  key: string,
  domain: string,
  label: string,
  description: string,
  unit: string,
  requiredDimensions: string[],
  aliases: string[],
  daxGapTemplate: string,
): OntologyConcept => ({ key, domain, label, description, unit, requiredDimensions, aliases, daxGapTemplate });

export const ONTOLOGY: OntologyDomain[] = [
  {
    key: "asset_quality",
    label: "Asset Quality",
    concepts: [
      C("asset_quality.npl_ratio", "asset_quality", "NPL ratio", "Non-performing loans / gross loans (CBN prudential basis).", "%", [], ["npl", "non performing loan", "impaired loan ratio"],
        "DIVIDE([Non-Performing Loans (NGN)], [Gross Loans (NGN)], 0) * 100"),
      C("asset_quality.npl_by_segment", "asset_quality", "NPL by segment", "NPL ratio decomposed by business segment.", "%", ["segment"], ["npl segment", "npl by segment", "segment npl"],
        "VAR Loans = CALCULATE([Gross Loans (NGN)], ALLEXCEPT(Loans, Loans[Segment]))\nVAR NPL = CALCULATE([Non-Performing Loans (NGN)], ALLEXCEPT(Loans, Loans[Segment]))\nRETURN DIVIDE(NPL, Loans, 0) * 100"),
      C("asset_quality.stage2_ratio", "asset_quality", "Stage 2 ratio", "IFRS 9 Stage 2 loans / gross loans (significant increase in credit risk).", "%", [], ["stage 2", "sicr", "stage2"],
        "DIVIDE(CALCULATE([Loan Balance], Loans[IFRS9 Stage] = \"Stage 2\"), [Gross Loans (NGN)], 0) * 100"),
      C("asset_quality.stage_migration", "asset_quality", "Stage migration (pp)", "Net Stage 1->2 migration contribution to NPL movement, percentage points.", "pp", ["from_stage", "to_stage"], ["migration", "stage migration"],
        "VAR Mig = SUMX(Loans, IF(Loans[Prev Stage] = \"Stage 1\" && Loans[IFRS9 Stage] = \"Stage 2\", Loans[Exposure], 0))\nRETURN DIVIDE(Mig, [Gross Loans (NGN)], 0) * 100"),
      C("asset_quality.reclassified_forborne", "asset_quality", "Reclassified forborne (pp)", "NPL movement from post-forbearance reclassification (regulatory noise, not new defaults).", "pp", [], ["forborne", "reclassified", "covid moratorium"],
        "VAR Reclass = SUMX(Loans, IF(Loans[Forborne Flag] = \"Y\" && Loans[Reclassified Date] >= MIN(Period[Date]), Loans[Exposure], 0))\nRETURN DIVIDE(Reclass, [Gross Loans (NGN)], 0) * 100"),
      C("asset_quality.watchlist_growth", "asset_quality", "Watchlist growth (pp)", "New watchlist entries as contribution to NPL movement, percentage points.", "pp", [], ["watchlist", "watch list"],
        "VAR WL = SUMX(Loans, IF(Loans[Watchlist Date] >= MIN(Period[Date]), Loans[Exposure], 0))\nRETURN DIVIDE(WL, [Gross Loans (NGN)], 0) * 100"),
      C("asset_quality.cost_of_risk", "asset_quality", "Cost of risk", "Annualised impairment charge / average gross loans.", "%", [], ["impairment", "ecl charge", "provision"],
        "DIVIDE([Impairment Charge (NGN)] * 12 / COUNTROWS(Period), AVERAGE([Gross Loans (NGN)]), 0) * 100"),
      C("asset_quality.provision_coverage", "asset_quality", "Provision coverage", "ECL allowance / NPL stock.", "%", [], ["coverage", "ecl coverage", "allowance ratio"],
        "DIVIDE([ECL Allowance (NGN)], [Non-Performing Loans (NGN)], 0) * 100"),
      C("asset_quality.vintage_default_curves", "asset_quality", "Vintage default curves", "Default rate by origination cohort (vintage).", "%", ["cohort"], ["vintage", "cohort default", "origination vintage"],
        "DIVIDE(CALCULATE([Defaults (NGN)], ALLEXCEPT(Loans, Loans[Cohort])), CALCULATE([Gross Loans (NGN)], ALLEXCEPT(Loans, Loans[Cohort])), 0) * 100"),
      C("asset_quality.new_defaults", "asset_quality", "New defaults (pp)", "Genuine new defaults as contribution to NPL movement, percentage points.", "pp", [], ["new default", "fresh default"],
        "VAR ND = SUMX(Loans, IF(Loans[Default Date] >= MIN(Period[Date]) && Loans[Forborne Flag] <> \"Y\", Loans[Exposure], 0))\nRETURN DIVIDE(ND, [Gross Loans (NGN)], 0) * 100"),
    ],
  },
  {
    key: "capital",
    label: "Capital",
    concepts: [
      C("capital.car", "capital", "CAR", "Capital adequacy ratio: qualifying capital / RWA.", "%", [], ["capital adequacy", "car"],
        "DIVIDE([Qualifying Capital (NGN)], [Risk-Weighted Assets (NGN)], 0) * 100"),
      C("capital.cet1_ratio", "capital", "CET1 ratio", "Common Equity Tier 1 / RWA.", "%", [], ["cet1", "tier 1 common"],
        "DIVIDE([CET1 Capital (NGN)], [Risk-Weighted Assets (NGN)], 0) * 100"),
      C("capital.capital_consumption_run_rate", "capital", "Capital consumption run-rate (pp/qtr)", "Quarterly capital consumption from ECL and RWA growth.", "pp", [], ["capital consumption", "capital burn"],
        "VAR Prev = CALCULATE([Qualifying Capital (NGN)] - [Risk-Weighted Assets (NGN)] * 0.10, DATEADD(Period[Date], -3, MONTH))\nRETURN DIVIDE([Qualifying Capital (NGN)], [Risk-Weighted Assets (NGN)], 0) * 100 - Prev"),
      C("capital.rwa_growth", "capital", "RWA growth (QoQ %)", "Quarter-on-quarter risk-weighted asset growth.", "%", [], ["rwa growth"],
        "DIVIDE([Risk-Weighted Assets (NGN)], CALCULATE([Risk-Weighted Assets (NGN)], DATEADD(Period[Date], -3, MONTH)), 0) * 100 - 100"),
    ],
  },
  {
    key: "liquidity",
    label: "Liquidity & Funding",
    concepts: [
      C("liquidity.liquidity_ratio", "liquidity", "Liquidity ratio", "Liquid assets / total deposits (CBN minimum 30%).", "%", [], ["liquid assets", "liquidity"],
        "DIVIDE([Liquid Assets (NGN)], [Total Deposits (NGN)], 0) * 100"),
      C("liquidity.lcr", "liquidity", "LCR", "Liquidity coverage ratio (HQLA / net cash outflows 30d).", "%", [], ["lcr", "coverage ratio"],
        "DIVIDE([High Quality Liquid Assets (NGN)], [Net Cash Outflows 30d (NGN)], 0) * 100"),
      C("liquidity.crr_position", "liquidity", "CRR position", "Cash reserve requirement utilisation / position vs. CBN requirement.", "%", [], ["crr", "cash reserve"],
        "DIVIDE([CRR Debit Balance (NGN)], [Total Deposits (NGN)] * 0.275, 0) * 100"),
      C("liquidity.ldr", "liquidity", "LDR", "Loan-to-deposit ratio.", "%", [], ["ldr", "loan deposit ratio"],
        "DIVIDE([Gross Loans (NGN)], [Total Deposits (NGN)], 0) * 100"),
      C("liquidity.deposit_mix", "liquidity", "Deposit mix", "Deposit composition by type (demand / savings / term).", "%", ["deposit_type"], ["deposit mix", "funding mix", "casa"],
        "DIVIDE(CALCULATE([Total Deposits (NGN)], ALLEXCEPT(Deposits, Deposits[Deposit Type])), [Total Deposits (NGN)], 0) * 100"),
      C("liquidity.deposit_total", "liquidity", "Total deposits", "Total customer deposits.", "NGN bn", [], ["deposits", "total deposits"],
        "SUM(Deposits[Balance (NGN)]) / 1000000000"),
      C("liquidity.cost_of_deposits", "liquidity", "Cost of deposits", "Annualised deposit interest expense / average deposits.", "%", [], ["funding cost deposit", "deposit cost"],
        "DIVIDE([Deposit Interest Expense (NGN)] * 12 / COUNTROWS(Period), AVERAGE([Total Deposits (NGN)]), 0) * 100"),
    ],
  },
  {
    key: "profitability",
    label: "Profitability",
    concepts: [
      C("profitability.nim", "profitability", "NIM", "Net interest margin.", "%", [], ["nim", "net interest margin"],
        "DIVIDE([Net Interest Income (NGN)] * 12 / COUNTROWS(Period), AVERAGE([Interest-Earning Assets (NGN)]), 0) * 100"),
      C("profitability.asset_yield", "profitability", "Asset yield", "Interest income / average interest-earning assets.", "%", [], ["yield", "asset yield"],
        "DIVIDE([Interest Income (NGN)] * 12 / COUNTROWS(Period), AVERAGE([Interest-Earning Assets (NGN)]), 0) * 100"),
      C("profitability.funding_cost", "profitability", "Funding cost", "Interest expense / average interest-bearing liabilities.", "%", [], ["cost of funds", "funding cost"],
        "DIVIDE([Interest Expense (NGN)] * 12 / COUNTROWS(Period), AVERAGE([Interest-Bearing Liabilities (NGN)]), 0) * 100"),
      C("profitability.cost_to_income", "profitability", "Cost-to-income", "Operating expenses / operating income.", "%", [], ["cir", "cost income", "efficiency"],
        "DIVIDE([Operating Expenses (NGN)], [Operating Income (NGN)], 0) * 100"),
      C("profitability.non_interest_income_share", "profitability", "Non-interest income share", "Fees & commissions / total income.", "%", [], ["fee income", "non interest"],
        "DIVIDE([Non-Interest Income (NGN)], [Total Income (NGN)], 0) * 100"),
    ],
  },
  {
    key: "concentration",
    label: "Concentration",
    concepts: [
      C("concentration.top10_obligor_share", "concentration", "Top-10 obligor share", "Top 10 obligors / total credit exposure.", "%", [], ["top 10", "top10", "large exposure"],
        "VAR Top10 = TOPN(10, SUMMARIZE(Obligors, Obligors[Obligor ID], \"E\", [Exposure (NGN)]), [E], DESC)\nRETURN DIVIDE(SUMX(Top10, [E]), [Total Credit Exposure (NGN)], 0) * 100"),
      C("concentration.single_obligor_pct", "concentration", "Single obligor % of funds", "Largest single obligor exposure / shareholders' funds (CBN limit 20%, insiders 5%).", "%", [], ["single obligor", "largest exposure"],
        "DIVIDE(MAXX(Obligors, [Exposure (NGN)]), [Shareholders Funds (NGN)], 0) * 100"),
      C("concentration.sector_concentration", "concentration", "Sector concentration", "Exposure share by industry sector.", "%", ["sector"], ["sector exposure", "industry concentration"],
        "DIVIDE(CALCULATE([Exposure (NGN)], ALLEXCEPT(Obligors, Obligors[Sector])), [Total Credit Exposure (NGN)], 0) * 100"),
    ],
  },
];

export const ALL_CONCEPTS: OntologyConcept[] = ONTOLOGY.flatMap((d) => d.concepts);

export function conceptByKey(key: string): OntologyConcept | undefined {
  return ALL_CONCEPTS.find((c) => c.key === key);
}

export function domainByKey(key: string): OntologyDomain | undefined {
  return ONTOLOGY.find((d) => d.key === key);
}
