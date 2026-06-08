"""One-shot script to clear causalFairness cache for a specific audit."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from core.firebase_init import get_firestore_client

def main():
    audit_id = sys.argv[1] if len(sys.argv) > 1 else "z3K6ImdLoX7wGmWnUUX1"
    db = get_firestore_client()
    from google.cloud.firestore_v1 import DELETE_FIELD
    db.collection("audits").document(audit_id).update({"causalFairness": DELETE_FIELD})
    print(f"Cleared causalFairness cache for {audit_id}")

if __name__ == "__main__":
    main()
