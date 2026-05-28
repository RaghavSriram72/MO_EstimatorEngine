import torch
from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation
from PIL import Image
from pathlib import Path
import numpy as np

# Load model (downloads automatically first time)
processor = AutoImageProcessor.from_pretrained("facebook/mask2former-swin-tiny-coco-panoptic")
model = Mask2FormerForUniversalSegmentation.from_pretrained("facebook/mask2former-swin-tiny-coco-panoptic")
model.eval()

# Load image
image_path = Path(__file__).parent / "sinners.png"  # Change to your image name
image = Image.open(image_path).convert("RGB")

# Run segmentation
inputs = processor(images=image, return_tensors="pt")
with torch.no_grad():
    outputs = model(**inputs)

# Get results
result = processor.post_process_panoptic_segmentation(outputs, target_sizes=[image.size[::-1]])[0]
segmentation_map = result["segmentation"].cpu().numpy()
segments_info = result["segments_info"]

# Simple output
print(f"Found {len(segments_info)} objects")
print("\nDetected objects:")
for seg in segments_info:
    class_name = model.config.id2label[seg["label_id"]]
    print(f"  - {class_name} (confidence: {seg.get('score', 1.0):.2f})")

# Optional: Save results
np.save("segmentation_map.npy", segmentation_map)