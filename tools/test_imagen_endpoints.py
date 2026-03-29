import urllib.request
import urllib.error
import urllib.parse
import json
import base64
import os

api_key = os.environ.get("GEMINI_API_KEY")

def test_endpoint(url_path):
    url = f"https://generativelanguage.googleapis.com/{url_path}?key={api_key}"
    payload = {
        "instances": [{"prompt": "A test image of an apple"}],
        "parameters": {"sampleCount": 1}
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                    headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"{url_path}: Success!")
    except urllib.error.HTTPError as e:
        print(f"{url_path}: HTTP {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"{url_path}: Error: {e}")

test_endpoint("v1beta/models/imagen-3.0-generate-001:predict")
test_endpoint("v1beta/models/imagen-3.0-generate-002:predict")
