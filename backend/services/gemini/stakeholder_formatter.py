"""
Stakeholder Mode Formatter — PRD §8.4
Generate and cache narratives for all three stakeholder types.
"""

import os
from typing import Dict, Any, Optional
from firebase_admin import firestore
from .narrative_generator import generate_audit_narrative


async def generate_all_stakeholder_narratives(
    audit_id: str,
    audit_results: dict,
    domain: str,
) -> Dict[str, str]:
    """
    Generate narratives for all three stakeholder types and cache in Firestore.
    
    Args:
        audit_id: Firestore audit document ID
        audit_results: Full audit results dictionary
        domain: Application domain
    
    Returns:
        Dictionary with keys: technical, executive, legal
    """
    db = firestore.client()
    narratives = {}
    
    stakeholder_types = ['technical', 'executive', 'legal']
    
    for stype in stakeholder_types:
        # Check cache first
        cached = await get_cached_narrative(audit_id, stype)
        if cached:
            narratives[stype] = cached
            continue
        
        # Generate new narrative
        try:
            narrative = await generate_audit_narrative(audit_results, domain, stype)
            narratives[stype] = narrative
            
            # Cache in Firestore
            await cache_narrative(audit_id, stype, narrative)
        
        except Exception as e:
            print(f"[STAKEHOLDER] Error generating {stype} narrative: {e}")
            narratives[stype] = f"Error generating narrative: {str(e)}"
    
    return narratives


async def get_cached_narrative(audit_id: str, stakeholder_type: str) -> Optional[str]:
    """
    Retrieve cached narrative from Firestore.
    
    Args:
        audit_id: Firestore audit document ID
        stakeholder_type: One of "technical", "executive", "legal"
    
    Returns:
        Cached narrative text or None if not found
    """
    try:
        db = firestore.client()
        doc_ref = db.collection("audits").document(audit_id).collection("narratives").document(stakeholder_type)
        doc = doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict()
            return data.get("text")
        
        return None
    
    except Exception as e:
        print(f"[STAKEHOLDER] Error retrieving cached narrative: {e}")
        return None


async def cache_narrative(audit_id: str, stakeholder_type: str, narrative: str) -> None:
    """
    Cache generated narrative in Firestore.
    
    Args:
        audit_id: Firestore audit document ID
        stakeholder_type: One of "technical", "executive", "legal"
        narrative: Generated narrative text
    """
    try:
        from datetime import datetime
        
        db = firestore.client()
        doc_ref = db.collection("audits").document(audit_id).collection("narratives").document(stakeholder_type)
        
        doc_ref.set({
            "text": narrative,
            "stakeholder_type": stakeholder_type,
            "generated_at": datetime.utcnow().isoformat(),
        })
    
    except Exception as e:
        print(f"[STAKEHOLDER] Error caching narrative: {e}")


def generate_all_stakeholder_narratives_sync(
    audit_id: str,
    audit_results: dict,
    domain: str,
) -> Dict[str, str]:
    """Synchronous wrapper for generate_all_stakeholder_narratives."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(
        generate_all_stakeholder_narratives(audit_id, audit_results, domain)
    )


def get_cached_narrative_sync(audit_id: str, stakeholder_type: str) -> Optional[str]:
    """Synchronous wrapper for get_cached_narrative."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(
        get_cached_narrative(audit_id, stakeholder_type)
    )
