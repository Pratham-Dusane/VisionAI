import urllib.request
import json
import sys

def test_running_endpoint():
    url = "http://localhost:8000/api/audits/llm-bias"
    payload = {
        "llm_endpoint": "mock-llm-service",
        "llm_api_key": "mock-key-123",
        "domain": "hiring",
        "org_id": "test-org-123",
        "rag_endpoint": "mock-rag-service"
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url, 
        data=data, 
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    print(f"Sending request to {url}...")
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            print("Response status code: 200")
            print("Keys in response:", list(res_json.keys()))
            
            assert "stereotype_amplification" in res_json, "Missing stereotype_amplification"
            assert "retrieval_bias" in res_json, "Missing retrieval_bias"
            
            print("Response checks passed successfully!")
            print("Sample response excerpt:")
            print(json.dumps(res_json, indent=2)[:500] + "...\n")
            return True
    except urllib.error.HTTPError as e:
        print(f"HTTPError: {e.code} - {e.reason}")
        print("Body:", e.read().decode('utf-8'))
        return False
    except Exception as e:
        print(f"Connection failed: {e}")
        print("Note: If the server is not running or hasn't been restarted with the new router, this is expected.")
        return False

if __name__ == "__main__":
    success = test_running_endpoint()
    sys.exit(0 if success else 1)
