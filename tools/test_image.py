import urllib.request
import json
import base64
import os

api_key = os.environ.get("GEMINI_API_KEY")
url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key={api_key}"
payload = {
    "instances": [{"prompt": "A test image of an apple"}],
    "parameters": {"sampleCount": 1}
}
req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        print("Success!")
except Exception as e:
    print(f"Error: {e}")
