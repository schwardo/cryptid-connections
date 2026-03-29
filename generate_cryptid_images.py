import csv
import argparse
import os
import sys

import urllib.request
import json
import base64

try:
    import google.generativeai as genai
except ImportError:
    print("Please install google-generativeai: pip install google-generativeai")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Generate cryptid images via Gemini API.")
    parser.add_argument("--limit", type=int, default=1, help="Number of new images to generate")
    args = parser.parse_args()

    # Read design notes for prompt context
    design_notes_path = os.path.join('gameplay', 'DESIGN_NOTES.md')
    try:
        with open(design_notes_path, 'r') as f:
            design_notes = f.read()
    except FileNotFoundError:
        print(f"Could not find {design_notes_path}!")
        sys.exit(1)

    csv_file = 'cryptids.csv'
    rows = []
    
    # Read existing CSV
    with open(csv_file, 'r', newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        # Ensure image_filename column exists
        if 'image_filename' not in fieldnames:
            fieldnames.append('image_filename')
        for row in reader:
            rows.append(row)

    # Initialize Gemini client config
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Make sure you have set the GEMINI_API_KEY environment variable.")
        sys.exit(1)
        
    genai.configure(api_key=api_key)

    # Ensure output directory exists
    output_dir = "artwork"
    os.makedirs(output_dir, exist_ok=True)
    
    generated_count = 0

    for row in rows:
        if generated_count >= args.limit:
            break
            
        # Skip rows that already have an image
        if row.get('image_filename'):
            continue
            
        title = row['title']
        cid = row['id']
        
        # Extract the attributes dynamically (excluding non-attribute columns)
        attributes = {k: v for k, v in row.items() if k not in ['id', 'title', 'image_filename']}
        
        print(f"Generating image {generated_count + 1}/{args.limit} for {title} (ID: {cid})...")
        
        # Format the attributes into a readable string
        attr_text = "\n".join([f"- {k.capitalize()}: {v}" for k, v in attributes.items()])
        
        # Build prompt using title, attributes, and design notes
        prompt = f"""
You are an expert concept artist. Generate an image of a cryptid named "{title}".

Here are the specific attributes for this cryptid:
{attr_text}

Here are the design notes explaining exactly what these attribute categories and values mean visually. Please ensure the image strictly incorporates these morphological features:
{design_notes}

The image should feel like a compelling, thematic concept art painting of a mysterious cryptid in its natural habitat, focusing clearly on its anatomy.
"""

        try:
            # Google frequently updates or deprecates image models (returning 404s for deprecated ones).
            # We will attempt the most modern endpoints successively until one succeeds.
            models_to_try = [
                ("models/gemini-2.0-flash-exp", "gemini"), # the generic 2.0 image-capable endpoint
                ("models/imagen-3.0-generate-002", "imagen"),
                ("models/gemini-3.1-flash-image-preview", "gemini"),
                ("models/imagen-3.0-generate-001", "imagen")
            ]
            
            image_b64 = None
            last_error = None
            
            for model_path, api_type in models_to_try:
                try:
                    if api_type == "gemini":
                        url = f"https://generativelanguage.googleapis.com/v1beta/{model_path}:generateContent?key={api_key}"
                        payload = {
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {"responseModalities": ["IMAGE"]}
                        }
                    else:
                        url = f"https://generativelanguage.googleapis.com/v1beta/{model_path}:predict?key={api_key}"
                        payload = {
                            "instances": [{"prompt": prompt}],
                            "parameters": {"sampleCount": 1}
                        }
                        
                    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                                 headers={'Content-Type': 'application/json'})
                    with urllib.request.urlopen(req) as response:
                        result = json.loads(response.read().decode('utf-8'))
                        if api_type == "gemini":
                            image_b64 = result['candidates'][0]['content']['parts'][0]['inlineData']['data']
                        else:
                            image_b64 = result['predictions'][0]['bytesBase64Encoded']
                        
                        # Break out of fallback loop on success
                        break
                except urllib.error.HTTPError as e:
                    last_error = f"HTTP {e.code}: {e.read().decode('utf-8')}"
                    continue # Try next model
                except Exception as e:
                    last_error = str(e)
                    continue

            if not image_b64:
                print(f"Failed to generate image for {title}. Final error: {last_error}")
                break
            
            # Format a safe filename
            safe_title = title.replace(' ', '_').replace('-', '_').replace("'", "")
            image_filename = f"{cid}_{safe_title}.jpg"
            image_path = os.path.join(output_dir, image_filename)
            
            # Save the generated image bytes
            with open(image_path, "wb") as f:
                f.write(base64.b64decode(image_b64))
                
            # Update the row with the newly generated filename
            row['image_filename'] = f"{cid}_{safe_title}"
            generated_count += 1
            print(f"Successfully generated and saved {image_filename}")
            
        except Exception as e:
            print(f"Error generating image for {title}: {e}")
            print("Stopping early to avoid wasting API calls.")
            break

    # Save the updated CSV (whether we hit the limit or errored out)
    if generated_count > 0:
        with open(csv_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            
        print(f"Finished. Generated {generated_count} new images. Updated {csv_file}.")
    else:
        print("No new images needed to be generated (or limit was 0).")

if __name__ == "__main__":
    main()
