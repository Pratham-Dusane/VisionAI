"""
Regulatory Sync Engine - Dynamic AI Law Monitoring
Uses Gemini to search for new AI regulations and update compliance thresholds.
"""

import os
import json
import hashlib
from datetime import datetime, timedelta
from typing import Any
import logging

import google.generativeai as genai
from firebase_admin import firestore

logger = logging.getLogger("regulatory_sync")


class RegulatorySync:
    """
    Weekly cron job that:
    1. Uses Gemini to search for new AI regulations
    2. Parses legal text and extracts thresholds
    3. Stores in Firestore regulations collection
    4. Generates compliance alerts for affected organizations
    """
    
    def __init__(self):
        self.db = firestore.client()
        
        # Configure Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-2.5-flash")
        
        # Jurisdictions to monitor
        self.jurisdictions = [
            "United States",
            "European Union",
            "United Kingdom",
            "Canada",
            "Australia",
            "California",
            "New York",
            "Colorado",
        ]
    
    def run_sync(self) -> dict[str, Any]:
        """
        Main sync workflow.
        Returns summary of sync results.
        """
        logger.info("Starting regulatory sync")
        
        # Get last sync timestamp
        last_sync = self._get_last_sync_timestamp()
        logger.info(f"Last sync: {last_sync}")
        
        # Search for new regulations
        new_regulations = []
        for jurisdiction in self.jurisdictions:
            try:
                regs = self._search_regulations(jurisdiction, last_sync)
                new_regulations.extend(regs)
            except Exception as e:
                logger.error(f"Failed to search regulations for {jurisdiction}: {str(e)}")
        
        logger.info(f"Found {len(new_regulations)} potential new regulations")
        
        # Parse and store regulations
        stored_count = 0
        for reg in new_regulations:
            try:
                if self._store_regulation(reg):
                    stored_count += 1
            except Exception as e:
                logger.error(f"Failed to store regulation {reg.get('title')}: {str(e)}")
        
        logger.info(f"Stored {stored_count} new regulations")
        
        # Generate alerts for affected organizations
        alerts_generated = 0
        orgs_notified = set()
        
        for reg in new_regulations[:stored_count]:
            try:
                affected_orgs = self._find_affected_organizations(reg)
                for org_id in affected_orgs:
                    if self._create_alert(org_id, reg):
                        alerts_generated += 1
                        orgs_notified.add(org_id)
            except Exception as e:
                logger.error(f"Failed to generate alerts for regulation {reg.get('title')}: {str(e)}")
        
        logger.info(f"Generated {alerts_generated} alerts for {len(orgs_notified)} organizations")
        
        # Update last sync timestamp
        self._update_last_sync_timestamp()
        
        return {
            "new_regulations_count": stored_count,
            "alerts_generated": alerts_generated,
            "orgs_notified": len(orgs_notified),
            "sync_timestamp": datetime.utcnow().isoformat(),
        }
    
    def _get_last_sync_timestamp(self) -> str:
        """Get the last sync timestamp from Firestore system collection."""
        try:
            doc = self.db.collection("system").document("regulatory_sync").get()
            if doc.exists:
                data = doc.to_dict() or {}
                return data.get("last_sync", "2024-01-01T00:00:00")
            return "2024-01-01T00:00:00"
        except Exception:
            return "2024-01-01T00:00:00"
    
    def _update_last_sync_timestamp(self) -> None:
        """Update the last sync timestamp in Firestore."""
        self.db.collection("system").document("regulatory_sync").set({
            "last_sync": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }, merge=True)
    
    def _search_regulations(self, jurisdiction: str, since: str) -> list[dict[str, Any]]:
        """
        Use Gemini to search for new AI regulations in a jurisdiction.
        
        Args:
            jurisdiction: Geographic area to search
            since: ISO timestamp of last sync
        
        Returns:
            List of regulation dictionaries
        """
        prompt = f"""You are a legal research assistant specializing in AI and algorithmic fairness law.

Search for NEW AI regulations, laws, or legal requirements passed in {jurisdiction} since {since}.

Focus on:
- Algorithmic fairness and bias requirements
- AI transparency and explainability mandates
- Protected class definitions
- Disparate impact thresholds
- Automated decision-making regulations
- AI audit requirements

For each regulation found, provide:
1. Official title and citation
2. Jurisdiction
3. Effective date
4. Key fairness thresholds (e.g., "disparate impact < 0.8")
5. Protected classes covered
6. Compliance requirements
7. Penalties for non-compliance

Return ONLY a JSON array of regulations. If no new regulations found, return empty array [].

Example format:
[
  {{
    "title": "Colorado SB24-205 - AI Bias Prevention Act",
    "citation": "Colorado Revised Statutes § 6-1-1701",
    "jurisdiction": "Colorado",
    "effective_date": "2025-02-01",
    "thresholds": {{
      "disparate_impact_min": 0.85,
      "statistical_parity_max": 0.10
    }},
    "protected_classes": ["race", "gender", "age", "disability"],
    "requirements": [
      "Annual bias audits required",
      "Public disclosure of fairness metrics"
    ],
    "penalties": "Up to $20,000 per violation",
    "summary": "Requires AI systems used in employment, housing, and credit decisions to maintain disparate impact ratio above 0.85"
  }}
]"""
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                )
            )
            
            text = response.text.strip()
            
            # Try to extract JSON from response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            
            regulations = json.loads(text)
            
            if not isinstance(regulations, list):
                logger.warning(f"Gemini returned non-list response for {jurisdiction}")
                return []
            
            # Add metadata
            for reg in regulations:
                reg["discovered_at"] = datetime.utcnow().isoformat()
                reg["source"] = "gemini_search"
            
            return regulations
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response for {jurisdiction}: {str(e)}")
            logger.error(f"Response text: {text[:500]}")
            return []
        except Exception as e:
            logger.error(f"Gemini search failed for {jurisdiction}: {str(e)}")
            return []
    
    def _store_regulation(self, regulation: dict[str, Any]) -> bool:
        """
        Store regulation in Firestore if it doesn't already exist.
        
        Args:
            regulation: Regulation dictionary
        
        Returns:
            True if stored (new), False if already exists
        """
        # Generate unique ID from title + jurisdiction
        reg_id = hashlib.sha256(
            f"{regulation.get('title', '')}:{regulation.get('jurisdiction', '')}".encode()
        ).hexdigest()[:16]
        
        # Check if already exists
        doc_ref = self.db.collection("regulations").document(reg_id)
        if doc_ref.get().exists:
            logger.info(f"Regulation {regulation.get('title')} already exists")
            return False
        
        # Store new regulation
        doc_ref.set({
            **regulation,
            "id": reg_id,
            "created_at": datetime.utcnow().isoformat(),
        })
        
        logger.info(f"Stored new regulation: {regulation.get('title')}")
        return True
    
    def _find_affected_organizations(self, regulation: dict[str, Any]) -> list[str]:
        """
        Find organizations that may be affected by this regulation.
        
        Args:
            regulation: Regulation dictionary
        
        Returns:
            List of organization IDs
        """
        jurisdiction = regulation.get("jurisdiction", "").lower()
        
        # Query organizations
        # For now, notify all orgs - in production, filter by org jurisdiction/location
        orgs = self.db.collection("organizations").stream()
        
        affected = []
        for org_doc in orgs:
            org_data = org_doc.to_dict() or {}
            
            # Check if org has any audits
            audits = self.db.collection("audits").where(
                "orgId", "==", org_doc.id
            ).limit(1).stream()
            
            if any(audits):
                affected.append(org_doc.id)
        
        return affected
    
    def _create_alert(self, org_id: str, regulation: dict[str, Any]) -> bool:
        """
        Create a regulatory alert for an organization.
        
        Args:
            org_id: Organization ID
            regulation: Regulation dictionary
        
        Returns:
            True if alert created successfully
        """
        try:
            # Check if alert already exists
            existing = self.db.collection("regulatory_alerts").where(
                "org_id", "==", org_id
            ).where(
                "regulation_id", "==", regulation.get("id")
            ).limit(1).stream()
            
            if any(existing):
                return False
            
            # Create alert
            alert = {
                "org_id": org_id,
                "regulation_id": regulation.get("id"),
                "regulation_title": regulation.get("title"),
                "jurisdiction": regulation.get("jurisdiction"),
                "effective_date": regulation.get("effective_date"),
                "severity": self._assess_severity(regulation),
                "message": self._generate_alert_message(regulation),
                "action_required": self._generate_action_items(regulation),
                "read": False,
                "created_at": datetime.utcnow().isoformat(),
            }
            
            self.db.collection("regulatory_alerts").add(alert)
            logger.info(f"Created alert for org {org_id}: {regulation.get('title')}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create alert for org {org_id}: {str(e)}")
            return False
    
    def _assess_severity(self, regulation: dict[str, Any]) -> str:
        """Assess severity of regulation impact."""
        # Check effective date
        effective_date = regulation.get("effective_date", "")
        try:
            eff_dt = datetime.fromisoformat(effective_date.replace("Z", "+00:00"))
            days_until = (eff_dt - datetime.utcnow()).days
            
            if days_until < 30:
                return "CRITICAL"
            elif days_until < 90:
                return "HIGH"
            elif days_until < 180:
                return "MEDIUM"
        except Exception:
            pass
        
        return "LOW"
    
    def _generate_alert_message(self, regulation: dict[str, Any]) -> str:
        """Generate user-friendly alert message."""
        title = regulation.get("title", "New AI regulation")
        jurisdiction = regulation.get("jurisdiction", "")
        effective_date = regulation.get("effective_date", "soon")
        summary = regulation.get("summary", "")
        
        message = f"New regulation detected: {title} ({jurisdiction}). "
        message += f"Effective {effective_date}. "
        
        if summary:
            message += summary
        
        return message
    
    def _generate_action_items(self, regulation: dict[str, Any]) -> list[str]:
        """Generate actionable compliance steps."""
        requirements = regulation.get("requirements", [])
        thresholds = regulation.get("thresholds", {})
        
        actions = []
        
        if requirements:
            actions.extend(requirements)
        
        if thresholds:
            for metric, value in thresholds.items():
                actions.append(f"Ensure {metric} meets threshold: {value}")
        
        if not actions:
            actions.append("Review regulation and assess compliance requirements")
        
        return actions
