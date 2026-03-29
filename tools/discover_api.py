import urllib.request
import json

url = "https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    discovery = json.loads(response.read().decode('utf-8'))
    methods = discovery.get('resources', {}).get('models', {}).get('methods', {})
    for method, info in methods.items():
        print(f"Method: {method}")
        print(f"Path: {info.get('path')}")
        print("---")
