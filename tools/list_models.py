import urllib.request
import json
import os

api_key = os.environ.get("GEMINI_API_KEY")

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
req = urllib.request.Request(url)
try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        for model in result.get('models', []):
            if 'image' in model['name'].lower() or 'generate' in model['name'].lower():
                print(f"Model: {model['name']}")
                print(f"Supported methods: {model.get('supportedGenerationMethods', [])}")
                print("---")
except Exception as e:
    print(f"Error: {e}")
