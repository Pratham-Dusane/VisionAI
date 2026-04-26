"""
Chart generation for PDF reports using Matplotlib.
Replaces Node.js/Satori/Sharp implementation.
"""

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from io import BytesIO


def generate_disparate_impact_chart(data: list[dict]) -> bytes:
    """
    Generate disparate impact snapshot chart as PNG.
    
    Args:
        data: List of dicts with keys: attribute, value (DI score), severity
              Example: [{"attribute": "gender", "value": 0.75, "severity": "HIGH"}]
    
    Returns:
        PNG image bytes (150 DPI)
    """
    if not data:
        # Return empty chart for no data
        fig, ax = plt.subplots(figsize=(10, 2))
        ax.text(0.5, 0.5, 'No data available', ha='center', va='center', fontsize=14)
        ax.axis('off')
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
        plt.close(fig)
        buf.seek(0)
        return buf.read()
    
    # Extract data
    attributes = [item['attribute'] for item in data]
    values = [item['value'] for item in data]
    
    # Map severity to colors
    severity_colors = {
        'CRITICAL': '#dc2626',  # red
        'HIGH': '#ea580c',      # orange
        'PASS': '#16a34a',      # green
    }
    colors = [severity_colors.get(item.get('severity', 'PASS'), '#16a34a') for item in data]
    
    # Create horizontal bar chart
    fig, ax = plt.subplots(figsize=(10, max(3, len(attributes) * 0.5)))
    ax.barh(attributes, values, color=colors, height=0.6)
    
    # Styling
    ax.set_xlabel('Disparate Impact Score', fontsize=11)
    ax.set_title('Disparate Impact Snapshot', fontsize=13, fontweight='bold', pad=15)
    ax.set_xlim(0, max(values) * 1.1 if values else 1.5)
    ax.grid(axis='x', alpha=0.3, linestyle='--')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    
    # Add value labels on bars
    for i, (attr, val) in enumerate(zip(attributes, values)):
        ax.text(val + 0.02, i, f'{val:.2f}', va='center', fontsize=9)
    
    plt.tight_layout()
    
    # Save to bytes
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf.read()
