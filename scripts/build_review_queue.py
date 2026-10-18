#!/usr/bin/env python3
"""Build an auditable manual-review queue from the master screening records.

The queue does not change paper decisions. It makes unresolved work explicit by
separating papers that have not been reviewed from papers whose extraction was
ambiguous, then records the evidence gap and the next manual action.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import openpyxl


OUTPUT_FIELDS = [
    "priority_rank",
    "priority_score",
    "queue_type",
    "reason_category",
    "paper_id",
    "paper_title",
    "pdf_url",
    "current_reason",
    "recommended_action",
    "reviewer_decision",
    "reviewer_notes",
    "source_table_or_figure",
    "verified_at",
]


def clean(value) -> str:
    return "" if value is None else str(value).strip()


def classify_uncertainty(reason: str, pdf_found: bool, error: str) -> tuple[str, str, int]:
    """Map an extraction explanation to a specific, reviewable evidence gap."""
    text = f"{reason} {error}".lower()
    if error or not pdf_found:
        return (
            "source_or_extraction_issue",
            "Open the source PDF and resolve the download, parsing, or extraction error before reassessing eligibility.",
            360,
        )
    if any(token in text for token in ("header", "truncated", "fragment", "table structure", "mapping")):
        return (
            "incomplete_table_context",
            "Open the cited table and recover its headers, row labels, shot counts, metrics, and exact values without guessing.",
            340,
        )
    if any(token in text for token in ("plot", "plotted", "graphically", "figure")):
        return (
            "figure_only_results",
            "Check the paper, appendix, and supplementary files for an exact numeric table; do not estimate values from the plot.",
            300,
        )
    if any(token in text for token in ("training", "fine-tun", "support set", "adaptation", "not the number of demonstrations")):
        return (
            "prompt_scope_unclear",
            "Determine whether the varied count is demonstrations inserted into the evaluated prompt while other conditions remain fixed.",
            220,
        )
    if any(token in text for token in ("different setup", "confound", "not comparable", "changes both", "changes the")):
        return (
            "configuration_comparability_unclear",
            "Confirm that shot count is the only relevant experimental variable before extracting a trajectory.",
            200,
        )
    return (
        "exact_results_not_recovered",
        "Inspect the full results section and appendix for two or more exact scores under a fixed task, dataset, model, metric, and method.",
        260,
    )


def read_candidates(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def read_reviews(path: Path) -> list[dict[str, object]]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Paper Review"]
    rows = sheet.iter_rows(values_only=True)
    headers = [clean(value) for value in next(rows)]
    return [dict(zip(headers, row)) for row in rows]


def build_queue(workbook_path: Path, candidates_path: Path) -> list[dict[str, object]]:
    candidates = read_candidates(candidates_path)
    reviews = read_reviews(workbook_path)
    candidate_by_id = {clean(row.get("anthology_id")): row for row in candidates}
    reviewed_ids = {clean(row.get("paper_id")) for row in reviews}
    queue: list[dict[str, object]] = []

    for review in reviews:
        if clean(review.get("status")).lower() != "uncertain":
            continue
        paper_id = clean(review.get("paper_id"))
        reason = clean(review.get("decision_reason"))
        pdf_found = bool(review.get("pdf_found"))
        error = clean(review.get("error"))
        category, action, score = classify_uncertainty(reason, pdf_found, error)
        queue.append(
            {
                "priority_score": score,
                "queue_type": "uncertain_decision",
                "reason_category": category,
                "paper_id": paper_id,
                "paper_title": clean(review.get("paper_title")),
                "pdf_url": clean(review.get("pdf_url")) or clean(candidate_by_id.get(paper_id, {}).get("pdf_url")),
                "current_reason": reason or error,
                "recommended_action": action,
            }
        )

    for candidate in candidates:
        paper_id = clean(candidate.get("anthology_id"))
        if paper_id in reviewed_ids:
            continue
        # The prior high-precision score is used only to order untouched
        # candidates. It does not alter their eligibility or final decision.
        extracted_priority = int(float(clean(candidate.get("refined_best_score")) or 0))
        queue.append(
            {
                "priority_score": 100 + extracted_priority,
                "queue_type": "not_reviewed",
                "reason_category": "screening_pending",
                "paper_id": paper_id,
                "paper_title": clean(candidate.get("title")),
                "pdf_url": clean(candidate.get("pdf_url")),
                "current_reason": "No paper-level decision is present in the master extraction workbook.",
                "recommended_action": "Review the full paper for an author-run experiment with exact comparable scores at two or more prompt shot counts.",
            }
        )

    queue.sort(key=lambda row: (-int(row["priority_score"]), str(row["paper_id"])))
    for rank, row in enumerate(queue, start=1):
        row["priority_rank"] = rank
        row["reviewer_decision"] = ""
        row["reviewer_notes"] = ""
        row["source_table_or_figure"] = ""
        row["verified_at"] = ""
    return queue


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Master extraction workbook")
    parser.add_argument("candidates", type=Path, help="Candidate paper CSV")
    parser.add_argument("--output", type=Path, required=True, help="Output review queue CSV")
    args = parser.parse_args()

    queue = build_queue(args.workbook, args.candidates)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(queue)

    counts: dict[str, int] = {}
    for row in queue:
        counts[str(row["queue_type"])] = counts.get(str(row["queue_type"]), 0) + 1
    print(f"Wrote {args.output}: {len(queue)} papers ({counts})")


if __name__ == "__main__":
    main()
