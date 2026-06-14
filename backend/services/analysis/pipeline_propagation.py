"""
Pipeline Propagation Service — PRD v2 §3.3
Build multi-model DAGs and compute propagated fairness scores.
"""

import networkx as nx
from typing import Dict, List
import logging

logger = logging.getLogger("pipeline_propagation")


def build_pipeline_graph(nodes: list[dict], edges: list[dict]) -> nx.DiGraph:
    """
    Build a NetworkX DiGraph from pipeline node/edge definitions.
    Validates that the graph is a valid DAG (no cycles).
    """
    G = nx.DiGraph()
    for node in nodes:
        G.add_node(
            node["node_id"],
            audit_id=node["audit_id"],
            label=node["label"],
        )
    for edge in edges:
        G.add_edge(
            edge["from_node"],
            edge["to_node"],
            output_feature=edge.get("output_feature", ""),
            input_feature=edge.get("input_feature", ""),
        )

    if not nx.is_directed_acyclic_graph(G):
        raise ValueError("Pipeline graph contains a cycle. Pipelines must be DAGs.")

    return G


def propagate_fairness_scores(
    G: nx.DiGraph,
    audit_results: Dict[str, dict],
    protected_attrs: List[str],
) -> dict:
    """
    Traverse the DAG in topological order. At each node, compute the effective DI
    considering both the node's own DI and the DI it inherited from upstream.

    Propagation model:
    effective_DI(node) = node_DI * min(upstream_effective_DIs)
    """
    topo_order = list(nx.topological_sort(G))
    effective_di: Dict[str, Dict[str, float]] = {}
    results = {}

    for attr in protected_attrs:
        attr_results = {}

        for node_id in topo_order:
            node_audit = audit_results.get(node_id, {})

            # Try multiple paths to find the DI for this attribute
            node_di = _extract_node_di(node_audit, attr)

            predecessors = list(G.predecessors(node_id))
            if predecessors:
                upstream_dis = [
                    effective_di.get(pred, {}).get(attr, 1.0)
                    for pred in predecessors
                ]
                upstream_min = min(upstream_dis)
                eff_di = node_di * upstream_min
            else:
                eff_di = node_di

            effective_di.setdefault(node_id, {})[attr] = eff_di
            attr_results[node_id] = {
                "node_di": round(node_di, 4),
                "effective_di": round(eff_di, 4),
                "is_root": len(predecessors) == 0,
            }

        sink_nodes = [n for n in G.nodes if G.out_degree(n) == 0]
        final_di = min(
            effective_di.get(s, {}).get(attr, 1.0) for s in sink_nodes
        )
        root_nodes = [n for n in G.nodes if G.in_degree(n) == 0]
        initial_di = min(
            effective_di.get(r, {}).get(attr, 1.0) for r in root_nodes
        )

        propagation_path = " → ".join([
            str(round(attr_results[n]["effective_di"], 2))
            for n in topo_order
        ])

        results[attr] = {
            "node_scores": attr_results,
            "effective_di_at_output": round(final_di, 4),
            "initial_di": round(initial_di, 4),
            "amplification_factor": round(initial_di / final_di, 2) if final_di > 0 else None,
            "propagation_path": propagation_path,
            "verdict": "FAIL" if final_di < 0.8 else "PASS",
            "explanation": (
                f"A disparate impact of {initial_di:.2f} at the first model "
                f"compounds to an effective DI of {final_di:.2f} by the final output. "
                f"This represents a {((initial_di - final_di) / initial_di * 100):.0f}% "
                f"amplification of bias through the pipeline."
            ) if final_di < initial_di else (
                f"Bias does not compound significantly through this pipeline for {attr}."
            ),
        }

    return results


def _extract_node_di(audit_data: dict, attr: str) -> float:
    """
    Extract the disparate impact for a given protected attribute from audit data.
    Handles multiple possible data structures from VisionAI audits.
    """
    # Try dataBias -> attr -> metrics -> disparate_impact
    data_bias = audit_data.get("dataBias") or audit_data.get("data_bias") or {}
    if isinstance(data_bias, str):
        import json
        try:
            data_bias = json.loads(data_bias)
        except Exception:
            data_bias = {}

    attr_data = data_bias.get(attr, {})
    if isinstance(attr_data, dict):
        metrics = attr_data.get("metrics", {})
        di = metrics.get("disparate_impact")
        if di is not None:
            return float(di)

    # Try severity -> per_attribute (alternative structure)
    severity = audit_data.get("severity", {})
    if isinstance(severity, str):
        import json
        try:
            severity = json.loads(severity)
        except Exception:
            severity = {}
    per_attr = severity.get("per_attribute", {})
    attr_sev = per_attr.get(attr, {})
    di = attr_sev.get("disparate_impact")
    if di is not None:
        return float(di)

    return 1.0
