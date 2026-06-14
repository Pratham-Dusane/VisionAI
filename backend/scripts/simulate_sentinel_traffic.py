import requests
import time
import random
import sys

API_BASE = "http://localhost:8000"
# Use the organization ID from the development logs
ORG_ID = "fzeqCVdHwOQDwDPhczid"

def get_active_sentinels():
    try:
        resp = requests.get(f"{API_BASE}/api/sentinel/?orgId={ORG_ID}")
        resp.raise_for_status()
        sentinels = resp.json()
        active = [s for s in sentinels if s.get("status") == "ACTIVE"]
        return active
    except Exception as e:
        print(f"Error fetching sentinels: {e}")
        return []

def main():
    print("====================================================")
    print("    VisionAI Sentinel Proxy Traffic Simulator")
    print("====================================================")
    
    active_sentinels = get_active_sentinels()
    if not active_sentinels:
        print("No active Sentinel proxies found. Please create one on the dashboard first!")
        sys.exit(1)
        
    print("\nAvailable Active Sentinels:")
    for idx, s in enumerate(active_sentinels):
        print(f"[{idx}] {s['model_name']} ({s['sentinel_id']}) -> Gateway: {s.get('sentinel_url')}")
        
    # Pick the most recent one or let user choose if multiple
    if len(active_sentinels) == 1:
        selected = active_sentinels[0]
    else:
        try:
            choice = input(f"\nSelect Sentinel index (0-{len(active_sentinels)-1}) [default 0]: ").strip()
            idx = int(choice) if choice else 0
            selected = active_sentinels[idx]
        except (ValueError, IndexError):
            print("Invalid choice, defaulting to index 0.")
            selected = active_sentinels[0]
            
    sentinel_id = selected["sentinel_id"]
    sentinel_url = selected["sentinel_url"]
    min_decisions = selected["config"].get("min_decisions_before_trip", 50)
    di_threshold = selected["config"].get("di_threshold", 0.8)
    
    print(f"\nTargeting Sentinel: {selected['model_name']} ({sentinel_id})")
    print(f"Proxy URL: {sentinel_url}")
    print(f"Evaluation starts after: {min_decisions} decisions")
    print(f"Disparate Impact Threshold: {di_threshold}")
    print("----------------------------------------------------")
    print("Starting traffic loop... Press CTRL+C to stop.")
    print("----------------------------------------------------")
    
    count = 0
    while True:
        # Generate random inputs: gender (Male/Female)
        # We want to send a mix of unprivileged (Female) and privileged (Male)
        # Females will get a 30% approval rate in mock-predict, Males will get 90%
        # This will quickly trip the circuit breaker.
        gender = "Female" if random.random() < 0.5 else "Male"
        payload = {
            "gender": gender,
            "income": random.randint(30000, 150000),
            "credit_score": random.randint(580, 850)
        }
        
        try:
            start_time = time.time()
            resp = requests.post(sentinel_url, json=payload)
            latency_ms = int((time.time() - start_time) * 1000)
            
            count += 1
            
            if resp.status_code == 200:
                res_data = resp.json()
                status = res_data.get("status")
                
                if status == "MANUAL_REVIEW_REQUIRED":
                    review_id = res_data.get("review_id")
                    print(f"[{count:03d}] 🔴 INTERCEPTED: applicant {gender} -> ENQUEUED FOR REVIEW (ID: {review_id}) [{latency_ms}ms]")
                else:
                    prediction = res_data.get("prediction", "N/A")
                    pred_color = "💚" if prediction == "approved" else "💛"
                    print(f"[{count:03d}] Passed through: applicant {gender} -> Prediction: {pred_color} {prediction} [{latency_ms}ms]")
            else:
                print(f"[{count:03d}] Request failed with status code {resp.status_code}: {resp.text}")
                
        except Exception as e:
            print(f"[{count:03d}] Network error: {e}")
            
        # Send a request every 0.8 seconds
        time.sleep(0.8)

if __name__ == "__main__":
    main()
