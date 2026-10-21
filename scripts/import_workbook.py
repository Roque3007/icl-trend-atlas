#!/usr/bin/env python3
"""Build the web app's data bundle from an ICL master extraction workbook."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook


PATTERN_LABELS = {
    "monotonic_improvement": "Monotonic improvement",
    "monotonic_decline": "Monotonic decline",
    "improve_then_decline": "Improve then decline",
    "decline_then_recover": "Decline then recover",
    "mixed_nonmonotonic": "Mixed / non-monotonic",
    "flat_or_stable": "Flat / stable",
    "two_point_improvement": "Two-point improvement",
    "two_point_decline": "Two-point decline",
    "insufficient_points": "Insufficient points",
}

# Increment this value whenever grouping rules change. The version is written to
# atlas.json so analyses can state which taxonomy produced their categories.
TAXONOMY_VERSION = 4


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def rows_for(sheet):
    rows = sheet.iter_rows(values_only=True)
    headers = [str(value) if value is not None else "" for value in next(rows)]
    return [
        {header: clean(value) for header, value in zip(headers, row) if header}
        for row in rows
        if any(value is not None for value in row)
    ]


def pipeline_counts(workbook_path: Path):
    """Read paper-screening progress when the workbook lives inside the research project."""
    research_dir = next(
        (parent for parent in workbook_path.parents if (parent / "acl_multishot_high_precision.csv").exists()),
        None,
    )
    if research_dir is None:
        return {}

    def csv_rows(path: Path):
        if not path.exists():
            return []
        with path.open(newline="", encoding="utf-8-sig") as stream:
            return list(csv.DictReader(stream))

    candidates = csv_rows(research_dir / "acl_multishot_high_precision.csv")
    reviewed = {}
    review_files = sorted(research_dir.glob("batch_processor_output/batch_*/batch_paper_review.csv"))
    review_files += sorted(research_dir.glob("compact_processor_output/batch_*/batch_paper_review.csv"))
    review_files += sorted(research_dir.glob("coverage_processor_output/batch_*/batch_paper_review.csv"))
    for review_file in review_files:
        for row in csv_rows(review_file):
            paper_id = row.get("paper_id")
            if paper_id and row.get("status") in {"include", "exclude", "uncertain"}:
                reviewed[paper_id] = row

    compact_manifest = csv_rows(research_dir / "local_pipeline_output/compact_review_5000/compact_manifest.csv")
    ready_queue_count = sum(row.get("anthology_id") not in reviewed for row in compact_manifest)
    status_counts = {
        status: sum(row.get("status") == status for row in reviewed.values())
        for status in ("include", "exclude", "uncertain")
    }
    return {
        "candidatePaperCount": len(candidates),
        "reviewedPaperCount": len(reviewed),
        "remainingPaperCount": max(0, len(candidates) - len(reviewed)),
        "readyQueueCount": ready_queue_count,
        "screeningStatusCounts": status_counts,
    }


def metric_group(metric):
    text = str(metric or "").lower()
    if "cat attentiveness" in text:
        return "Attentiveness"
    if "accuracy" in text or text.startswith("acc@"):
        return "Accuracy"
    if "entity-level f1" in text or text == "f1":
        return "F1"
    if any(token in text for token in ("spbleu", "chrf", "comet", "bleurt")):
        return "Machine translation quality"
    if "rouge" in text or "bertscore" in text:
        return "Text generation similarity"
    if any(
        token in text
        for token in (
            "ca-score",
            "clipscore",
            "longest common",
            "kendall",
            "distance",
            "minimum swap",
        )
    ):
        return "Procedural ordering / similarity"
    return "Other"


def model_taxonomy(model_name, model_type):
    """Return non-competing model dimensions while preserving the raw fields.

    Papers mix vendor families, architectures, prompting methods, and complete
    pipelines inside ``model_type``. Keeping family and architecture separate
    prevents labels such as "LLM" and "decoder-only LLM" from appearing as if
    they were different model families in the evidence explorer.
    """
    name = str(model_name or "").strip()
    kind = str(model_type or "").strip()
    text = f"{name} {kind}".lower()

    composite = (
        "+" in name
        or " within " in name.lower()
        or "two-stage" in name.lower()
        or "pipeline" in kind.lower()
    )
    if composite:
        family = "Composite pipeline"
    elif any(token in text for token in ("gpt-neo", "gpt-j")):
        family = "GPT-Neo / GPT-J"
    elif any(token in text for token in ("chatgpt", "gpt", "davinci")):
        family = "OpenAI GPT"
    elif "llama" in text:
        family = "Meta Llama"
    elif any(token in text for token in ("mistral", "ministral", "voxtral")):
        family = "Mistral"
    elif "qwen" in text:
        family = "Qwen"
    elif "gemini" in text:
        family = "Google Gemini"
    elif "gemma" in text:
        family = "Google Gemma"
    elif any(token in text for token in ("flan", "t5", "tk-instruct", "ul2")):
        family = "T5 / FLAN"
    elif any(token in text for token in ("roberta", "bert")):
        family = "BERT / RoBERTa"
    elif "claude" in text:
        family = "Anthropic Claude"
    elif "pythia" in text:
        family = "Pythia"
    elif "eurollm" in text:
        family = "EuroLLM"
    elif "dolly" in text:
        family = "Dolly"
    elif any(token in text for token in ("flamingo", "re-vilm")):
        family = "Flamingo / Re-ViLM"
    elif "nllb" in text:
        family = "NLLB"
    elif not name:
        family = "Unspecified"
    else:
        family = "Other named model"

    if composite or any(token in kind.lower() for token in ("pipeline", "filtering", "approach")):
        architecture = "Composite pipeline"
    elif any(token in text for token in ("audio-language", "voxtral")):
        architecture = "Audio-language model"
    elif any(token in text for token in ("multimodal", "vision-language", "visual language", "flamingo", "re-vilm")):
        architecture = "Multimodal model"
    elif any(token in text for token in ("masked language", "roberta", "bert")):
        architecture = "Encoder-only model"
    elif any(token in text for token in ("encoder-decoder", "nmt", "flan", "t5", "nllb")):
        architecture = "Encoder-decoder model"
    elif any(
        token in text
        for token in (
            "decoder-only",
            "causal language",
            "gpt",
            "llama",
            "mistral",
            "qwen",
            "gemini",
            "gemma",
            "claude",
            "pythia",
            "dolly",
        )
    ):
        architecture = "Decoder-only model"
    elif "language model" in text or kind.lower() == "llm":
        architecture = "Unspecified language model"
    else:
        architecture = "Other / unclear"

    return {"modelFamily": family, "modelArchitecture": architecture}


def reported_model_parameters(model_name, model_family):
    """Extract a parameter count only when the model label states one.

    This intentionally does not look up or infer sizes for aliases such as
    ``T5-base`` or proprietary model names. Composite pipelines also remain
    unassigned because one component's size would not describe the full system.
    """
    if model_family == "Composite pipeline":
        return {
            "modelParameterMillions": None,
            "modelParameterLabel": None,
            "modelParameterGroup": "Not reported",
            "modelParameterSource": "not_reported",
        }

    matches = re.findall(
        r"(?i)(?<![\w.])(\d+(?:\.\d+)?)\s*([bm])\b",
        str(model_name or ""),
    )
    values = {
        float(number) * (1000 if unit.lower() == "b" else 1)
        for number, unit in matches
    }
    if len(values) != 1:
        return {
            "modelParameterMillions": None,
            "modelParameterLabel": None,
            "modelParameterGroup": "Not reported",
            "modelParameterSource": "not_reported",
        }

    millions = values.pop()
    if millions < 1000:
        label = f"{millions:g}M"
        group = "Under 1B"
    else:
        label = f"{millions / 1000:g}B"
        if millions < 7000:
            group = "1B–<7B"
        elif millions < 13000:
            group = "7B–<13B"
        elif millions < 30000:
            group = "13B–<30B"
        elif millions < 70000:
            group = "30B–<70B"
        else:
            group = "70B and above"

    return {
        "modelParameterMillions": millions,
        "modelParameterLabel": label,
        "modelParameterGroup": group,
        "modelParameterSource": "explicit_model_label",
    }


def task_taxonomy(task):
    """Classify task shape separately from the semantic operation it performs."""
    text = str(task or "").lower()

    if "inference time" in text or text == "inference":
        return {
            "inputType": "Model input",
            "outputType": "Scalar measurement",
            "semanticOperation": "System efficiency",
            "taskSubtype": "Inference latency",
            "semanticScope": "System-level",
        }
    if "audio question answering" in text:
        return {
            "inputType": "Audio + question",
            "outputType": "Answer",
            "semanticOperation": "Question answering",
            "taskSubtype": "Audio question answering",
            "semanticScope": "Cross-modal / compositional",
        }
    if "image captioning" in text:
        return {
            "inputType": "Image",
            "outputType": "Text",
            "semanticOperation": "Grounded generation",
            "taskSubtype": "Image captioning",
            "semanticScope": "Cross-modal / compositional",
        }
    if "table question answering" in text:
        return {
            "inputType": "Table + question",
            "outputType": "Answer",
            "semanticOperation": "Question answering",
            "taskSubtype": "Table question answering",
            "semanticScope": "Context-grounded",
        }
    if "line graph-to-text" in text:
        return {
            "inputType": "Graph",
            "outputType": "Text",
            "semanticOperation": "Grounded generation",
            "taskSubtype": "Graph-to-text generation",
            "semanticScope": "Cross-modal / compositional",
        }
    if "market comment generation" in text:
        return {
            "inputType": "Structured data",
            "outputType": "Text",
            "semanticOperation": "Grounded generation",
            "taskSubtype": "Market commentary generation",
            "semanticScope": "Context-grounded",
        }
    if "summarization" in text:
        return {
            "inputType": "Conversation" if "dialogue" in text else "Text",
            "outputType": "Text",
            "semanticOperation": "Summarization",
            "taskSubtype": "Medical dialogue summarization" if "medical dialogue" in text else "Summarization",
            "semanticScope": "Context-grounded",
        }
    if "visual step" in text or "cross-modal step" in text:
        return {
            "inputType": "Visual sequence",
            "outputType": "Ordered sequence",
            "semanticOperation": "Procedural reasoning",
            "taskSubtype": "Visual step ordering",
            "semanticScope": "Cross-modal / compositional",
        }
    if "empathetic dialogue" in text:
        return {
            "inputType": "Conversation",
            "outputType": "Text",
            "semanticOperation": "Open-ended generation",
            "taskSubtype": "Empathetic dialogue",
            "semanticScope": "Context-grounded",
        }
    if "named entity recognition" in text:
        return {
            "inputType": "Text",
            "outputType": "Span(s)",
            "semanticOperation": "Span labeling / extraction",
            "taskSubtype": "Named entity recognition",
            "semanticScope": "Local / span",
        }
    if "negation-scope" in text or "semantic-role annotation" in text:
        return {
            "inputType": "Text",
            "outputType": "Span label(s)",
            "semanticOperation": "Span labeling / extraction",
            "taskSubtype": "Negation scope resolution" if "negation" in text else "Semantic-role annotation",
            "semanticScope": "Local / span",
        }
    if "information extraction" in text or "properties extraction" in text:
        return {
            "inputType": "Text",
            "outputType": "Structured record(s)",
            "semanticOperation": "Structured extraction",
            "taskSubtype": "Scientific information extraction",
            "semanticScope": "Context-grounded",
        }
    if "intervention extraction" in text:
        return {
            "inputType": "Text",
            "outputType": "Span(s)",
            "semanticOperation": "Span labeling / extraction",
            "taskSubtype": "Intervention extraction",
            "semanticScope": "Local / span",
        }
    if "translation" in text or "post-editing" in text:
        return {
            "inputType": "Text",
            "outputType": "Text",
            "semanticOperation": "Translation / transformation",
            "taskSubtype": "Machine translation",
            "semanticScope": "Context-grounded",
        }
    if "post-asr correction" in text:
        return {
            "inputType": "Text",
            "outputType": "Text",
            "semanticOperation": "Translation / transformation",
            "taskSubtype": "ASR correction",
            "semanticScope": "Context-grounded",
        }
    if "argument claim clarification" in text:
        return {
            "inputType": "Text",
            "outputType": "Text",
            "semanticOperation": "Rewriting / transformation",
            "taskSubtype": "Claim clarification",
            "semanticScope": "Context-grounded",
        }
    if "definition modeling" in text:
        return {
            "inputType": "Term + context",
            "outputType": "Text",
            "semanticOperation": "Definition generation",
            "taskSubtype": "Definition modeling",
            "semanticScope": "Context-grounded",
        }
    if "word-level autocompletion" in text:
        return {
            "inputType": "Text prefix",
            "outputType": "Text",
            "semanticOperation": "Completion",
            "taskSubtype": "Word-level autocompletion",
            "semanticScope": "Local / span",
        }
    if "logical parsing" in text:
        return {
            "inputType": "Text",
            "outputType": "Structured representation",
            "semanticOperation": "Semantic parsing",
            "taskSubtype": "Logical parsing",
            "semanticScope": "Compositional",
        }
    if any(
        token in text
        for token in (
            "arithmetic reasoning",
            "commonsense reasoning",
            "word-problem solving",
            "mathematics problem solving",
            "linear-function arithmetic",
            "reasoning with scratchpad",
            "constraint programming model generation",
        )
    ):
        return {
            "inputType": "Problem text",
            "outputType": "Answer",
            "semanticOperation": "Reasoning / problem solving",
            "taskSubtype": str(task or "Reasoning"),
            "semanticScope": "Compositional",
        }
    if "entailment" in text and "explanation" in text:
        return {
            "inputType": "Text pair",
            "outputType": "Label + text",
            "semanticOperation": "Inference + explanation",
            "taskSubtype": "Entailment with explanation",
            "semanticScope": "Relational",
        }
    if "natural language inference" in text or "entailment" in text:
        return {
            "inputType": "Text pair",
            "outputType": "Label",
            "semanticOperation": "Inference / verification",
            "taskSubtype": "Natural language inference",
            "semanticScope": "Relational",
        }
    if "fact verification" in text:
        return {
            "inputType": "Claim + evidence",
            "outputType": "Label",
            "semanticOperation": "Inference / verification",
            "taskSubtype": "Fact verification",
            "semanticScope": "Relational",
        }
    if "paraphrase" in text:
        return {
            "inputType": "Text pair",
            "outputType": "Label",
            "semanticOperation": "Similarity / matching",
            "taskSubtype": "Paraphrase detection",
            "semanticScope": "Relational",
        }
    if "conditional semantic textual similarity" in text:
        return {
            "inputType": "Text pair + condition",
            "outputType": "Scalar score",
            "semanticOperation": "Similarity / matching",
            "taskSubtype": "Conditional semantic textual similarity",
            "semanticScope": "Relational",
        }
    if "question answering" in text:
        return {
            "inputType": "Question + context",
            "outputType": "Answer",
            "semanticOperation": "Question answering",
            "taskSubtype": "Question answering",
            "semanticScope": "Context-grounded",
        }
    if "explanation generation" in text:
        return {
            "inputType": "Text",
            "outputType": "Text",
            "semanticOperation": "Open-ended generation",
            "taskSubtype": "Explanation generation",
            "semanticScope": "Context-grounded",
        }
    if "short answer scoring" in text or "llm-as-a-judge" in text:
        return {
            "inputType": "Answer + evaluation context",
            "outputType": "Score",
            "semanticOperation": "Evaluation / scoring",
            "taskSubtype": "Short answer scoring" if "short answer" in text else "LLM-as-a-judge evaluation",
            "semanticScope": "Context-grounded",
        }
    if "multiple-choice evaluation" in text:
        return {
            "inputType": "Question + choices",
            "outputType": "Answer",
            "semanticOperation": "Question answering",
            "taskSubtype": "Multiple-choice evaluation",
            "semanticScope": "Instance-level",
        }
    if "average across" in text or "nlu (average" in text:
        return {
            "inputType": "Mixed benchmark tasks",
            "outputType": "Aggregate score",
            "semanticOperation": "Benchmark aggregate",
            "taskSubtype": str(task or "Benchmark aggregate"),
            "semanticScope": "Suite-level",
        }
    if "moral foundation" in text:
        return {
            "inputType": "Text",
            "outputType": "Label(s)",
            "semanticOperation": "Classification",
            "taskSubtype": "Moral foundation identification",
            "semanticScope": "Instance-level",
        }
    if "metaphor" in text:
        return {
            "inputType": "Text",
            "outputType": "Label",
            "semanticOperation": "Classification",
            "taskSubtype": "Metaphor intention classification",
            "semanticScope": "Instance-level",
        }
    if any(token in text for token in ("classification", "sentiment", "topic")):
        subtype = "Sentiment analysis" if "sentiment" in text else "Text classification"
        return {
            "inputType": "Text",
            "outputType": "Label",
            "semanticOperation": "Classification",
            "taskSubtype": subtype,
            "semanticScope": "Instance-level",
        }
    if any(token in text for token in ("smishing detection", "news categorization")):
        return {
            "inputType": "Text",
            "outputType": "Label",
            "semanticOperation": "Classification",
            "taskSubtype": "Smishing detection" if "smishing" in text else "News categorization",
            "semanticScope": "Instance-level",
        }
    return {
        "inputType": "Text",
        "outputType": "Other",
        "semanticOperation": "Other",
        "taskSubtype": str(task or "Unspecified task"),
        "semanticScope": "Unspecified",
    }


def evidence_tier(number_of_conditions):
    count = int(number_of_conditions or 0)
    if count >= 3:
        return "3+ points"
    if count == 2:
        return "2 points"
    return "Insufficient"


def pick(record, *keys):
    return {key: record.get(source) for key, source in keys}


def build_bundle(workbook_path: Path):
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    trajectories = rows_for(workbook["Trajectories"])
    results = rows_for(workbook["All Results"])
    tests = rows_for(workbook["Statistical Tests"])

    results_by_trajectory = {}
    for row in results:
        trajectory_id = str(row.get("trajectory_id") or "")
        if not trajectory_id:
            continue
        point = pick(
            row,
            ("shotCount", "shot_count"),
            ("rawScoreReported", "raw_score_reported"),
            ("rawScore", "raw_score_numeric"),
            ("analysisScore", "analysis_score"),
            ("changeFromBaseline", "change_from_baseline"),
            ("percentChangeFromBaseline", "percent_change_from_baseline"),
            ("stepChange", "step_change"),
            ("standardDeviation", "standard_deviation"),
            ("standardError", "standard_error"),
            ("confidenceIntervalLower", "confidence_interval_lower"),
            ("confidenceIntervalUpper", "confidence_interval_upper"),
            ("confidenceLevel", "confidence_level"),
        )
        results_by_trajectory.setdefault(trajectory_id, []).append(point)

    for points in results_by_trajectory.values():
        points.sort(key=lambda point: (point.get("shotCount") is None, point.get("shotCount") or 0))

    tests_by_trajectory = {}
    for row in tests:
        trajectory_id = str(row.get("trajectory_id") or "")
        if not trajectory_id:
            continue
        test = pick(
            row,
            ("baselineShot", "comparison_baseline_shot"),
            ("targetShot", "comparison_target_shot"),
            ("pValue", "p_value"),
            ("adjustedPValue", "adjusted_p_value"),
            ("posteriorProbability", "posterior_probability"),
            ("statisticallySignificant", "statistically_significant"),
            ("effectSizeName", "effect_size_name"),
            ("effectSizeValue", "effect_size_value"),
            ("confidenceIntervalLower", "confidence_interval_lower"),
            ("confidenceIntervalUpper", "confidence_interval_upper"),
            ("confidenceLevel", "confidence_level"),
            ("testName", "statistical_test_name"),
            ("testType", "statistical_test_type"),
            ("sidedness", "test_sidedness"),
            ("significanceLevel", "significance_level"),
            ("multipleComparisonCorrection", "multiple_comparison_correction"),
            ("correctionMethod", "correction_method"),
            ("description", "statistical_test_description"),
            ("interpretation", "statistical_test_interpretation"),
            ("table", "statistical_table"),
            ("tableLink", "statistical_table_link"),
            ("notes", "notes"),
        )
        tests_by_trajectory.setdefault(trajectory_id, []).append(test)

    web_trajectories = []
    for row in trajectories:
        trajectory_id = str(row.get("trajectory_id") or "")
        pattern = str(row.get("numerical_pattern") or "insufficient_points")
        taxonomy = task_taxonomy(row.get("task"))
        model = model_taxonomy(row.get("model_name"), row.get("model_type"))
        parameters = reported_model_parameters(row.get("model_name"), model["modelFamily"])
        normalized_change = row.get("normalized_endpoint_change")
        if normalized_change is None:
            endpoint_outcome = "Unknown"
        elif normalized_change > 0:
            endpoint_outcome = "Improved"
        elif normalized_change < 0:
            endpoint_outcome = "Declined"
        else:
            endpoint_outcome = "No change"

        web_trajectories.append(
            {
                "trajectoryId": trajectory_id,
                "paperId": row.get("paper_id"),
                "paperTitle": row.get("paper_title"),
                "task": row.get("task"),
                "taskGroup": taxonomy["semanticOperation"],
                "inputType": taxonomy["inputType"],
                "outputType": taxonomy["outputType"],
                "ioFamily": f"{taxonomy['inputType']} → {taxonomy['outputType']}",
                "semanticOperation": taxonomy["semanticOperation"],
                "taskSubtype": taxonomy["taskSubtype"],
                "semanticScope": taxonomy["semanticScope"],
                "dataset": row.get("dataset"),
                "modelName": row.get("model_name"),
                "modelType": row.get("model_type"),
                "modelTypeRaw": row.get("model_type"),
                "modelFamily": model["modelFamily"],
                "modelArchitecture": model["modelArchitecture"],
                "modelParameterMillions": parameters["modelParameterMillions"],
                "modelParameterLabel": parameters["modelParameterLabel"],
                "modelParameterGroup": parameters["modelParameterGroup"],
                "modelParameterSource": parameters["modelParameterSource"],
                "metric": row.get("metric"),
                "metricGroup": metric_group(row.get("metric")),
                "metricDirection": row.get("metric_direction"),
                "metricDescription": row.get("metric_description"),
                "metricScale": row.get("metric_scale_or_range"),
                "metricInterpretation": row.get("metric_interpretation"),
                "numberOfConditions": row.get("number_of_conditions"),
                "lowestShot": row.get("lowest_tested_shot"),
                "highestShot": row.get("highest_tested_shot"),
                "baselineRawScore": row.get("baseline_raw_score"),
                "endpointRawScore": row.get("endpoint_raw_score"),
                "normalizedEndpointChange": normalized_change,
                "endpointOutcome": endpoint_outcome,
                "bestShotCount": row.get("best_shot_count"),
                "maxDrawdown": row.get("max_drawdown"),
                "pattern": pattern,
                "category": PATTERN_LABELS.get(pattern, pattern.replace("_", " ").title()),
                "evidenceTier": evidence_tier(row.get("number_of_conditions")),
                "numericalDegradation": bool(row.get("numerical_degradation")),
                "statisticallySupportedDegradation": bool(row.get("statistically_supported_degradation")),
                "statisticalTestUsed": row.get("statistical_test_used"),
                "resultTable": row.get("result_table"),
                "resultTableLink": row.get("result_table_link"),
                "verificationStatus": row.get("verification_status"),
                "notes": row.get("notes"),
                "results": results_by_trajectory.get(trajectory_id, []),
                "statisticalTests": tests_by_trajectory.get(trajectory_id, []),
            }
        )

    paper_ids = {row["paperId"] for row in web_trajectories if row.get("paperId")}
    progress = pipeline_counts(workbook_path)
    return {
        "meta": {
            "schemaVersion": 2,
            "taxonomyVersion": TAXONOMY_VERSION,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceFile": workbook_path.name,
            "paperCount": len(paper_ids),
            "trajectoryCount": len(web_trajectories),
            "resultCount": sum(len(row["results"]) for row in web_trajectories),
            "verificationNotice": "All current trajectories require source-table verification before publication.",
            **progress,
        },
        "trajectories": web_trajectories,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path, help="Path to the master extraction workbook")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("app/data/atlas.json"),
        help="Destination JSON file",
    )
    args = parser.parse_args()
    bundle = build_bundle(args.workbook.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {args.output}: {bundle['meta']['paperCount']} papers, "
        f"{bundle['meta']['trajectoryCount']} trajectories, {bundle['meta']['resultCount']} shot results"
    )


if __name__ == "__main__":
    main()
