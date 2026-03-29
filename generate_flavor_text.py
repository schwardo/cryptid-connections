import csv
import argparse
import os
import sys
import json
import base64
import urllib.request
import time

try:
    import google.generativeai as genai
except ImportError:
    pass

def main():
    parser = argparse.ArgumentParser(description="Generate flavor text for cryptids via Gemini Vision.")
    parser.add_argument("--limit", type=int, default=64, help="Number of rows to process")
    parser.add_argument("--sleep-duration", type=float, default=2.0, help="Seconds to wait between API requests to avoid ratelimits")
    args = parser.parse_args()

    # Get API key
    api_key = os.environ.get("GEMINI_API_KEY")
    # If the user has it inside genai we'll just try os.environ.
    if not api_key:
        print("Make sure you have set the GEMINI_API_KEY environment variable.")
        sys.exit(1)

    csv_file = 'cryptids.csv'
    rows = []
    fieldnames = []
    
    # Read existing CSV
    with open(csv_file, 'r', newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        # Ensure flavor_text column exists
        if 'flavor_text' not in fieldnames:
            fieldnames.append('flavor_text')
        for row in reader:
            rows.append(row)

    processed_count = 0
    image_dir = os.path.join("artwork", "generated")

    import urllib.error
    # We will use a reliable, multi-model fallback list since old models get deprecated (HTTP 404).
    models_to_try = [
        "models/gemini-3.0-flash",
        "models/gemini-2.5-flash",
    ]

    for row in rows:
        if processed_count >= args.limit:
            break
            
        # Skip if flavor text already exists
        flavor = row.get('flavor_text')
        if flavor and str(flavor).strip():
            continue
            
        title = row.get('title', 'Unknown Cryptid')
        image_base = row.get('image_filename')
        
        if not image_base:
            continue
            
        # Try both common extensions
        image_path = os.path.join(image_dir, f"{image_base}.jpg")
        if not os.path.exists(image_path):
            image_path = os.path.join(image_dir, f"{image_base}.png")
            if not os.path.exists(image_path):
                print(f"Skipping {title}: Could not find image at {image_path}")
                continue
                
        # Read and base64 encode the image
        with open(image_path, "rb") as img_file:
            img_bytes = img_file.read()
            b64_img = base64.b64encode(img_bytes).decode('utf-8')
            
        mime_type = "image/png" if image_path.endswith('.png') else "image/jpeg"
        
        print(f"Generating flavor text for {title}...")
        
        prompt = (f"Write 1-2 sentences of compelling flavor text about this cryptid named '{title}'. "
                  f"Focus primarily on mysterious lore, a survivor's quote, or distinct tips on ways to spot it or things to look out for. "
                  f"Base the description *heavily* on its specific scary or mysterious visual details in this image. "
                  f"Do not write a generic description; act as an expert monster hunter writing an entry, but not more than 200 letters.")

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": b64_img
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.8,
                "maxOutputTokens": 2000
            }
        }
        
        flavor_text = None
        last_error = None
        
        for gemini_model in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/{gemini_model}:generateContent?key={api_key}"
            req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                         headers={'Content-Type': 'application/json'})
            
            try:
                with urllib.request.urlopen(req) as response:
                    result = json.loads(response.read().decode('utf-8'))
                    
                if 'candidates' not in result or len(result['candidates']) == 0:
                    last_error = f"Empty candidates: {result}"
                    continue
                    
                text_response = result['candidates'][0]['content']['parts'][0]['text'].strip()
                flavor_text = text_response.replace('\n', ' ').replace('\r', '')
                # Strip leading/trailing quotes sometimes placed by the AI
                flavor_text = flavor_text.strip('"').strip("'")
                break # Found a working model!
                
            except urllib.error.HTTPError as e:
                last_error = f"HTTP {e.code}: {e.read().decode('utf-8')}"
                continue
            except Exception as e:
                last_error = str(e)
                continue
                
        if flavor_text:
            row['flavor_text'] = flavor_text
            processed_count += 1
            print(f"Success: {flavor_text}")
            time.sleep(args.sleep_duration)
        else:
            print(f"Failed to generate text for {title}. Final error: {last_error}")
            break

    # Save the updated CSV
    if processed_count > 0:
        with open(csv_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            
        print(f"Finished. Generated {processed_count} flavor texts. Updated {csv_file}.")
    else:
        print("No new flavor texts needed to be generated.")

if __name__ == "__main__":
    main()
