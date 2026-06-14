import pandas as pd
import numpy as np
from dowhy import CausalModel
import networkx as nx
import logging

logger = logging.getLogger("causal_fairness")

def build_causal_graph_from_gemini(
    column_names: list[str],
    protected_cols: list[str],
    label_col: str,
    domain: str,
    gemini_model,
) -> str:
    """
    Uses Gemini to propose a causal graph structure for the dataset.
    Falls back to Groq if Gemini fails or hits quota limits.
    Returns a DOT-format graph string for DoWhy.
    """
    non_protected_features = [c for c in column_names if c != label_col and c not in protected_cols]
    
    prompt = f"""
You are a causal inference expert. Given a dataset with the following columns in the domain of {domain}:

Protected attributes (potential causes of discrimination): {protected_cols}
Other features: {non_protected_features}
Outcome variable: {label_col}

Propose a plausible causal DAG (Directed Acyclic Graph) for this dataset.
Consider which features are likely caused by the protected attributes (mediators),
and which are independent of them (confounders or direct causes of the outcome).

Return ONLY a valid DOT format string representing the causal graph. Example:
"digraph {{ A -> B; A -> C; B -> D; C -> D; }}"

Rules:
1. Every protected attribute must be included as a source node
2. The outcome variable ({label_col}) must be the final sink node
3. Include plausible mediator paths (protected -> mediator -> outcome)
4. Include direct paths (protected -> outcome) where direct discrimination is possible
5. Maximum 15 edges for clarity
6. Return only the DOT string, no explanation
"""
    try:
        response = gemini_model.generate_content(prompt)
        dot_str = response.text.strip()
        
        # Strip code fences if present
        if dot_str.startswith("```"):
            lines = dot_str.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            dot_str = "\n".join(lines).strip()
            
        dot_str = dot_str.strip('"').strip("'").strip()
        return dot_str
    except Exception as e:
        logger.error(f"Gemini causal graph generation failed: {e}")
        
        # Attempt Groq Fallback
        import os
        groq_key = os.getenv("GROQ_API_KEY")
        if groq_key:
            try:
                from groq import Groq
                logger.info("[CAUSAL] Trying GROQ fallback for graph generation...")
                client = Groq(api_key=groq_key)
                response = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_completion_tokens=1024,
                )
                dot_str = response.choices[0].message.content.strip()
                if dot_str.startswith("```"):
                    lines = dot_str.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    dot_str = "\n".join(lines).strip()
                dot_str = dot_str.strip('"').strip("'").strip()
                logger.info("[CAUSAL] Groq fallback generated graph successfully.")
                return dot_str
            except Exception as groq_err:
                logger.error(f"Groq fallback causal graph generation failed: {groq_err}")
                
        raise


def parse_dot_to_networkx(dot_str: str) -> nx.DiGraph:
    """
    Parses a DOT graph string into a NetworkX DiGraph.
    Uses a robust regex fallback to prevent pydot/DLL dependency errors on Windows.
    """
    G = nx.DiGraph()
    import re
    
    # Try pydot if available
    try:
        import pydot
        graphs = pydot.graph_from_dot_data(dot_str)
        if graphs:
            pydot_g = graphs[0]
            # Convert pydot to networkx manually to avoid nx.drawing.nx_pydot issues
            for edge in pydot_g.get_edges():
                src = edge.get_source().strip('"').strip("'").strip()
                dst = edge.get_destination().strip('"').strip("'").strip()
                G.add_edge(src, dst)
            # Also add lone nodes if any
            for node in pydot_g.get_nodes():
                name = node.get_name().strip('"').strip("'").strip()
                if name and name not in ['graph', 'node', 'edge', 'digraph']:
                    G.add_node(name)
            if len(G.edges) > 0:
                return G
    except Exception as e:
        logger.warning(f"pydot parsing failed, using regex fallback: {e}")
        
    # Regex fallback
    pattern = r'(?:["\']([^"\']+)["\']|(\w+))\s*->\s*(?:["\']([^"\']+)["\']|(\w+))'
    matches = re.findall(pattern, dot_str)
    for m in matches:
        u = m[0] if m[0] else m[1]
        v = m[2] if m[2] else m[3]
        if u and v:
            G.add_edge(u.strip(), v.strip())
            
    if len(G.nodes) == 0:
        nodes = re.findall(r'["\']([^"\']+)["\']', dot_str)
        for node in nodes:
            if node.strip() and node.strip() not in ['graph', 'node', 'edge', 'digraph']:
                G.add_node(node.strip())
                
    return G


def networkx_to_dot(G: nx.DiGraph) -> str:
    """
    Generates a clean DOT string from a NetworkX DiGraph.
    """
    edges_str = " ".join([f'"{u}" -> "{v}";' for u, v in G.edges])
    return f"digraph {{ {edges_str} }}"


def run_causal_analysis(
    df: pd.DataFrame,
    protected_cols: list[str],
    label_col: str,
    positive_label,
    domain: str,
    gemini_model,
) -> dict:
    """
    Runs DoWhy causal analysis on binned dataset.
    """
    df = df.copy()
    
    # Cast label to binary numeric (flexible comparison to handle type mismatch)
    try:
        val_float = float(positive_label)
        df[label_col] = (df[label_col].astype(float) == val_float).astype(int)
    except Exception:
        df[label_col] = (df[label_col].astype(str).str.strip().str.lower() == str(positive_label).strip().lower()).astype(int)
    
    # Label encode all categorical columns except the label column
    df_encoded = df.copy()
    cat_cols = df_encoded.select_dtypes(include=['object', 'category']).columns.tolist()
    for col in cat_cols:
        if col != label_col:
            df_encoded[col] = pd.factorize(df_encoded[col])[0]
            
    # Cast boolean dummy columns to int for regression
    for col in df_encoded.columns:
        if df_encoded[col].dtype == bool:
            df_encoded[col] = df_encoded[col].astype(int)
            
    try:
        dot_graph = build_causal_graph_from_gemini(
            df.columns.tolist(), protected_cols, label_col, domain, gemini_model
        )
    except Exception:
        # Fallback to direct path only
        edges = " ".join([f'"{p}" -> "{label_col}";' for p in protected_cols])
        dot_graph = f"digraph {{ {edges} }}"
        
    # Validate and normalize the graph structure using NetworkX
    G_nx = parse_dot_to_networkx(dot_graph)
    
    if not G_nx.has_node(label_col):
        G_nx.add_node(label_col)
        
    for p in protected_cols:
        if not G_nx.has_node(p):
            G_nx.add_node(p)
        if not nx.has_path(G_nx, p, label_col):
            G_nx.add_edge(p, label_col)
            
    dot_graph = networkx_to_dot(G_nx)
    
    results = {}
    
    for protected_col in protected_cols:
        # Find encoded columns representing the protected attribute
        encoded_protected = [c for c in df_encoded.columns if c == protected_col or c.startswith(f"{protected_col}_")]
        if not encoded_protected:
            continue
        treatment_col = encoded_protected[0]
        
        try:
            # 1. Estimate Total Effect
            model = CausalModel(
                data=df_encoded,
                treatment=treatment_col,
                outcome=label_col,
                graph=dot_graph,
            )
            
            identified_estimand = model.identify_effect(proceed_when_unidentifiable=True)
            estimate_total = model.estimate_effect(
                identified_estimand,
                method_name="backdoor.linear_regression",
            )
            total_effect = float(estimate_total.value) if estimate_total.value is not None else 0.0
            
            # 2. Parse paths using networkx (from pre-built G_nx)
            try:
                all_paths = list(nx.all_simple_paths(G_nx, source=protected_col, target=label_col))
            except Exception as nx_err:
                logger.error(f"NetworkX path extraction failed: {nx_err}")
                all_paths = [[protected_col, label_col]]
                
            direct_paths = [p for p in all_paths if len(p) == 2]
            indirect_paths = [p for p in all_paths if len(p) > 2]
            
            mediators = list(set(
                node for path in indirect_paths for node in path[1:-1]
            ))
            
            # 3. Estimate Direct Effect (hold mediators to mean)
            if mediators:
                df_mediation = df_encoded.copy()
                for med in mediators[:3]:
                    if med in df_mediation.columns:
                        df_mediation[med] = df_mediation[med].mean()
                    else:
                        # Dummy encoded features matching mediator
                        for col in df_mediation.columns:
                            if col.startswith(f"{med}_"):
                                df_mediation[col] = df_mediation[col].mean()
                
                model_direct = CausalModel(
                    data=df_mediation,
                    treatment=treatment_col,
                    outcome=label_col,
                    graph=dot_graph,
                )
                est_direct = model_direct.estimate_effect(
                    model_direct.identify_effect(proceed_when_unidentifiable=True),
                    method_name="backdoor.linear_regression",
                )
                direct_effect = float(est_direct.value) if est_direct.value is not None else 0.0
            else:
                direct_effect = total_effect
            
            indirect_effect = total_effect - direct_effect
            discrimination_type = classify_discrimination(direct_effect, indirect_effect)
            
            results[protected_col] = {
                "total_causal_effect": round(total_effect, 4),
                "direct_effect": round(direct_effect, 4),
                "indirect_effect": round(indirect_effect, 4),
                "mediators": mediators[:5],
                "direct_paths": [" -> ".join(p) for p in direct_paths[:3]],
                "indirect_paths": [" -> ".join(p) for p in indirect_paths[:3]],
                "discrimination_type": discrimination_type,
                "legal_implication": get_legal_implication(discrimination_type),
                "recommended_intervention": get_causal_intervention(discrimination_type, mediators),
            }
        
        except Exception as e:
            logger.error(f"Causal estimation failed for attribute {protected_col}: {e}")
            results[protected_col] = {
                "error": str(e),
                "fallback_note": "Causal analysis failed for this attribute. Check graph structure.",
            }
    
    return {
        "causal_graph_dot": dot_graph,
        "per_attribute": results,
    }


def classify_discrimination(direct_effect: float, indirect_effect: float) -> str:
    if abs(direct_effect) < 0.01 and abs(indirect_effect) < 0.01:
        return "NO_CAUSAL_EFFECT"
    elif abs(direct_effect) > abs(indirect_effect) * 2:
        return "DIRECT_DISCRIMINATION"
    elif abs(indirect_effect) > abs(direct_effect) * 2:
        return "INDIRECT_DISCRIMINATION"
    else:
        return "MIXED_DISCRIMINATION"


def get_legal_implication(discrimination_type: str) -> str:
    implications = {
        "DIRECT_DISCRIMINATION": (
            "HIGH LEGAL RISK: Direct discrimination is explicitly prohibited under EU AI Act Article 5, "
            "US Civil Rights Act Title VII, and India's DPDP Act. Immediate remediation required."
        ),
        "INDIRECT_DISCRIMINATION": (
            "MEDIUM LEGAL RISK: Indirect (disparate impact) discrimination may be permissible if "
            "business necessity can be demonstrated. Document the justification under EU AI Act Article 9."
        ),
        "MIXED_DISCRIMINATION": (
            "HIGH LEGAL RISK: Both direct and indirect discrimination are present. "
            "The direct component is immediately actionable. Address both."
        ),
        "NO_CAUSAL_EFFECT": (
            "LOW LEGAL RISK: No significant causal effect detected. "
            "Observed statistical disparity may be due to confounding, not discrimination."
        ),
    }
    return implications.get(discrimination_type, "")


def get_causal_intervention(discrimination_type: str, mediators: list[str]) -> str:
    if discrimination_type == "DIRECT_DISCRIMINATION":
        return "Remove the protected attribute from model features. Apply adversarial debiasing during training."
    elif discrimination_type == "INDIRECT_DISCRIMINATION":
        return (
            f"Address the root cause in mediating features: {', '.join(mediators[:3])}. "
            "These features encode protected attribute information. "
            "Consider fairness-aware feature engineering or structural intervention."
        )
    elif discrimination_type == "MIXED_DISCRIMINATION":
        return (
            "Two-step intervention required: (1) Remove direct path by excluding protected attribute. "
            f"(2) Address indirect path through mediators: {', '.join(mediators[:3])}."
        )
    return "No intervention required based on causal analysis."
