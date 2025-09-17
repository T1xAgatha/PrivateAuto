import sys
import argparse
import numpy as np
import os
from pathlib import Path
import tensorflow as tf
import cv2

# Define parameters used during training
IMAGE_SIZE = (64, 64)  # Should match the image_size used during training
CROP_WIDTH = 32        # Should match the crop_width used during training
CLASS_NAMES = [
    'apple', 'banana', 'chip', 'coin', 'dragon scale', 'epic coin', 'epic fish',
    'fish', 'golden fish', 'life potion', 'mermaid hair', 'ruby', 'unicorn horn',
    'wolf skin', 'zombie eye'
]

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / 'icon_recognition_model.h5'
TOP_K_RESULTS = 3

def preprocess_image_bytes(image_bytes: bytes, target_size, crop_width) -> np.ndarray:
    """Decode bytes, resize, crop-left, normalize, and add batch dimension."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Lỗi: Không thể giải mã dữ liệu hình ảnh. Dữ liệu có thể bị hỏng.")

    # Convert BGR to RGB to match Keras expectations
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, target_size)

    # Crop the left side
    cropped = img[:, :crop_width, :]

    # Normalize and expand dims
    cropped = cropped.astype('float32') / 255.0
    batch = np.expand_dims(cropped, axis=0)
    return batch

def predict_top_k(image_bytes: bytes, model_path: Path, class_names, target_size, crop_width, top_k=TOP_K_RESULTS):
    if not model_path.is_file():
        raise FileNotFoundError(f"Không tìm thấy model tại '{model_path}'")

    model = tf.keras.models.load_model(model_path)

    tensor = preprocess_image_bytes(image_bytes, target_size, crop_width)
    preds = model.predict(tensor, verbose=0)[0]

    # In case model didn't include softmax
    try:
        import math
        if np.max(preds) > 1.0 or np.min(preds) < 0.0:
            e_x = np.exp(preds - np.max(preds))
            preds = e_x / e_x.sum()
    except Exception:
        pass

    indices = np.argsort(preds)[-top_k:][::-1]
    results = [(class_names[i], float(preds[i])) for i in indices]
    return results

def main():
    parser = argparse.ArgumentParser(description="Nhận dạng icon vật phẩm (stdin/file) cho auto farm.")
    parser.add_argument("image_path", nargs="?", default=None, help="Đường dẫn ảnh (tùy chọn). Nếu không có sẽ đọc từ stdin.")
    args = parser.parse_args()

    try:
        # Read bytes either from file path or stdin
        if args.image_path:
            p = Path(args.image_path)
            if not p.is_file():
                raise FileNotFoundError(f"Lỗi: Tệp hình ảnh không tồn tại tại '{args.image_path}'")
            image_bytes = p.read_bytes()
        else:
            image_bytes = sys.stdin.buffer.read()

        if not image_bytes:
            raise ValueError("Lỗi: Không nhận được dữ liệu hình ảnh từ đầu vào.")

        results = predict_top_k(image_bytes, MODEL_PATH, CLASS_NAMES, IMAGE_SIZE, CROP_WIDTH)

        # stdout: labels comma-separated (for Node integration)
        labels = [label for label, _ in results]
        print(",".join(labels))

        # stderr: confidence line parsable by farm.js
        try:
            conf_str = ", ".join([f"{label}={(conf*100):.1f}%" for label, conf in results])
            print(f"CONF: {conf_str}", file=sys.stderr)
        except Exception:
            pass

    except Exception as e:
        print(f"error:{type(e).__name__} - {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()