import cv2
import numpy as np
import json
import csv
from scipy.spatial import Delaunay
import math

# ============================================================
# CONFIGURATION
# ============================================================

INPUT_IMAGE = "avjcm.png"
OUTPUT_IMAGE = "segmented_output.png"
OUTPUT_JSON = "results.json"
OUTPUT_CSV = "results.csv"

# Number of color clusters
K_CLUSTERS = 6

# Ignore tiny objects
MIN_AREA = 100

# Morphology kernel size
KERNEL_SIZE = 5

# ============================================================
# K-MEANS SEGMENTATION
# ============================================================

def kmeans_segmentation(image, k=5):
    """
    Segment image into K color clusters using K-means.
    """

    # Reshape image into Nx3 pixel array
    
    pixel_values = image.reshape((-1, 3))

    # Convert to float32 for kmeans
    pixel_values = np.float32(pixel_values)

    # Stopping criteria
    criteria = (
        cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER,
        100,
        0.2
    )

    # Run K-means
    _, labels, centers = cv2.kmeans(
        pixel_values,
        k,
        None,
        criteria,
        10,
        cv2.KMEANS_RANDOM_CENTERS
    )

    # Convert centers back to uint8
    centers = np.uint8(centers)

    # Rebuild segmented image
    segmented_image = centers[labels.flatten()]
    segmented_image = segmented_image.reshape(image.shape)

    # Reshape labels back into image dimensions
    label_image = labels.reshape(image.shape[:2])

    return segmented_image, label_image, centers


# ============================================================
# MASK CLEANUP
# ============================================================

def clean_mask(mask):
    """
    Remove noise and fill holes.
    """

    kernel = np.ones((KERNEL_SIZE, KERNEL_SIZE), np.uint8)

    # Remove small noise
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    # Fill holes
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    return mask


# ============================================================
# OBJECT MEASUREMENT
# ============================================================

def measure_contour(contour):

    x, y, w, h = cv2.boundingRect(contour)

    area = cv2.contourArea(contour)

    perimeter = cv2.arcLength(contour, True)

    # Rotated rectangle
    rect = cv2.minAreaRect(contour)
    (_, _), (rw, rh), angle = rect

    return {
        "x": int(x),
        "y": int(y),
        "width": int(w),
        "height": int(h),
        #"rotated_width": float(rw),
        #"rotated_height": float(rh),
        #"rotation_angle": float(angle),
        #"area": float(area),
        "perimeter": float(perimeter)
    }


def generate_cluster_colors(k):

    np.random.seed(42)

    colors = []

    for _ in range(k):
        color = tuple(int(x) for x in np.random.randint(0, 255, 3))
        colors.append(color)

    return colors

def remove_background(image):
    """
    Removes white background + light shadow background while preserving
    object regions. Output image keeps same shape as input.
    """

    # -----------------------------
    # 1. Convert to HSV
    # -----------------------------
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    h, s, v = cv2.split(hsv)

    # -----------------------------
    # 2. Define background rules
    # -----------------------------
    # White / near-white background:
    # - low saturation
    # - high brightness

    bg_mask_white = (s < 40) & (v > 200)
    bg_mask_shadow = (s < 60) & (v > 120) & (v <= 200)
    bg_mask = bg_mask_white | bg_mask_shadow
    bg_mask = bg_mask.astype(np.uint8) * 255
    kernel = np.ones((5, 5), np.uint8)

    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_OPEN, kernel)
    bg_mask = cv2.morphologyEx(bg_mask, cv2.MORPH_CLOSE, kernel)
    fg_mask = cv2.bitwise_not(bg_mask)
    result = cv2.bitwise_and(image, image, mask=fg_mask)

    return result, fg_mask

def save_json(results, filename):

    with open(filename, "w") as f:
        json.dump(results, f, indent=4)


def save_csv(results, filename):

    if len(results) == 0:
        return

    keys = results[0].keys()

    with open(filename, "w", newline="") as f:

        writer = csv.DictWriter(f, fieldnames=keys)

        writer.writeheader()

        writer.writerows(results)

def colors_similar(c1, c2, tol=5):
    """
    Check if two cluster centers are similar in RGB space.
    """
    # expects BGR or RGB-like triplet stored in "cluster_center_bgr"
    return all(
        abs(int(a) - int(b)) <= tol
        for a, b in zip(c1, c2)
    )

def expand_box(obj, margin=3):
    """
    Expand bounding box by pixel margin.
    """

    return {
        "x": obj["x"] - margin,
        "y": obj["y"] - margin,
        "width": obj["width"] + 2 * margin,
        "height": obj["height"] + 2 * margin
    }

def is_inside_with_margin(inner, outer, margin=3):

    i = expand_box(inner, margin)
    o = expand_box(outer, margin)

    return (
        i["x"] >= o["x"] and
        i["y"] >= o["y"] and
        i["x"] + i["width"] <= o["x"] + o["width"] and
        i["y"] + i["height"] <= o["y"] + o["height"]
    )

def merge_boxes(a, b):
    """
    Merge two bounding boxes into one.
    """

    x1 = min(a["x"], b["x"])
    y1 = min(a["y"], b["y"])

    x2 = max(a["x"] + a["width"], b["x"] + b["width"])
    y2 = max(a["y"] + a["height"], b["y"] + b["height"])

    merged = dict(a)

    merged["x"] = x1
    merged["y"] = y1
    merged["width"] = x2 - x1
    merged["height"] = y2 - y1

    # optional: you can recompute centroid, area, etc. later
    return merged

def alpha_shape(points, alpha):
    """
    Compute concave hull (alpha shape).
    """

    if len(points) < 4:
        return cv2.convexHull(points)

    tri = Delaunay(points)

    edges = set()

    def add_edge(i, j):
        if (i, j) in edges or (j, i) in edges:
            return
        edges.add((i, j))

    # Filter triangles by circumradius
    for ia, ib, ic in tri.simplices:
        pa, pb, pc = points[ia], points[ib], points[ic]

        a = np.linalg.norm(pa - pb)
        b = np.linalg.norm(pb - pc)
        c = np.linalg.norm(pc - pa)

        s = (a + b + c) / 2.0
        area = max(s * (s - a) * (s - b) * (s - c), 1e-12)

        circum_r = (a * b * c) / (4.0 * math.sqrt(area))

        if circum_r < 1.0 / alpha:
            add_edge(ia, ib)
            add_edge(ib, ic)
            add_edge(ic, ia)

    hull_points = np.array([points[i] for i, _ in edges])

    return cv2.convexHull(hull_points.astype(np.float32))

def merged_perimeter_alpha(contours, alpha=1.0):

    pts = np.vstack(contours).astype(np.float32)

    hull = alpha_shape(pts, alpha)

    return hull, cv2.arcLength(hull, True)

def merge_simple(results, ids):
    pass

def merge_objects(results, color_tol=5, margin=3):
    merged = results.copy()
    changed = True

    while changed:
        changed = False
        new_list = []
        used = [False] * len(merged)

        for i in range(len(merged)):

            if used[i]:
                continue

            obj_a = merged[i]

            for j in range(len(merged)):

                if i == j or used[j]:
                    continue

                obj_b = merged[j]

                # -----------------------------
                # 1. Color similarity check
                # -----------------------------
                if not colors_similar(
                    obj_a["cluster_center_bgr"],
                    obj_b["cluster_center_bgr"],
                    tol=color_tol
                ):
                    continue

                # -----------------------------
                # 2. Spatial relationship check
                # -----------------------------

                a_inside_b = is_inside_with_margin(obj_a, obj_b, margin)
                b_inside_a = is_inside_with_margin(obj_b, obj_a, margin)

                # Merge if either contains the other
                if a_inside_b or b_inside_a:

                    merged_box = merge_boxes(obj_a, obj_b)

                    # preserve metadata (keep obj_a as base)
                    obj_a.update(merged_box)

                    merged[j] = obj_a
                    used[i] = True
                    changed = True
                    break

            if not used[i]:
                new_list.append(obj_a)
                used[i] = True

        merged = new_list

    # reassign IDs
    for idx, obj in enumerate(merged):
        obj["id"] = idx

    return merged

def process_image(image_path):

    image = cv2.imread(image_path)

    if image is None:
        raise FileNotFoundError(f"Could not load image: {image_path}") 

    image, _ = remove_background(image)

    segmented_image, label_image, centers = kmeans_segmentation(
        image,
        K_CLUSTERS
    )

    # Visualization image
    output = image.copy()

    cluster_colors = generate_cluster_colors(K_CLUSTERS)

    all_results = []

    object_id = 0

    # --------------------------------------------------------
    # PROCESS EACH CLUSTER
    # --------------------------------------------------------

    for cluster_idx in range(K_CLUSTERS):

        # Create binary mask for this cluster
        mask = np.uint8(label_image == cluster_idx) * 255

        # Clean mask
        mask = clean_mask(mask)

        # Find contours
        contours, _ = cv2.findContours(
            mask,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        # Cluster visualization color
        draw_color = cluster_colors[cluster_idx]

        # ----------------------------------------------------
        # PROCESS OBJECTS
        # ----------------------------------------------------

        for contour in contours:

            area = cv2.contourArea(contour)

            if area < MIN_AREA:
                continue

            measurement = measure_contour(contour)

            result = {
                "id": object_id,
                "cluster": cluster_idx, #related to k_means clustering, largely useless AFAIK
                "cluster_center_bgr": centers[cluster_idx].tolist(), #color of the element (post processing) in BGR format
                "group_id":-1, #id for merge group (post-hoc),-1 is default and means no group
                **measurement
            }

            all_results.append(result)

            # Draw contour
            cv2.drawContours(output, [contour], -1, draw_color, 2)

            # Draw bounding box
            x = measurement["x"]
            y = measurement["y"]
            w = measurement["width"]
            h = measurement["height"]

            cv2.rectangle(
                output,
                (x, y),
                (x + w, y + h),
                draw_color,
                2
            )

            # Label
            label = (
                f"ID:{object_id} "
                f"C:{cluster_idx} "
                f"W:{w} "
                f"H:{h}"
            )

            cv2.putText(
                output,
                label,
                (x, y - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                draw_color,
                2
            )

            object_id += 1
    # all_results = reconnect_same_color_fragments(
    #     label_image = label_image,
    #     centers = centers,
    #     image_shape = image.shape,
    #     color_tolerance = 5,
    #     bridge_size = 7,
    #     min_area = 100
    # )
    return segmented_image, output, all_results

def reconnect_same_color_fragments(
    label_image,
    centers,
    image_shape,
    color_tolerance=5,
    bridge_size=7,
    min_area=100
):
    """
    Reconstruct fragmented objects that share similar colors.

    This function:
    1. Finds clusters with similar colors
    2. Combines their masks
    3. Morphologically reconnects fragmented regions
    4. Returns merged contours suitable for measurement

    Parameters
    ----------
    label_image : np.ndarray
        2D cluster label image from K-means

    centers : np.ndarray
        Cluster centers (BGR colors)

    image_shape : tuple
        Original image shape

    color_tolerance : int
        Max allowed per-channel BGR difference

    bridge_size : int
        Morphological closing kernel size

    min_area : int
        Ignore tiny contours

    Returns
    -------
    results : list
        List of reconstructed objects
    """

    h, w = image_shape[:2]

    # --------------------------------------------------------
    # Helper: color similarity
    # --------------------------------------------------------

    def colors_similar(c1, c2):

        return all(
            abs(int(a) - int(b)) <= color_tolerance
            for a, b in zip(c1, c2)
        )

    # --------------------------------------------------------
    # Group clusters by similar color
    # --------------------------------------------------------

    cluster_groups = []
    used = set()

    num_clusters = len(centers)

    for i in range(num_clusters):

        if i in used:
            continue

        group = [i]
        used.add(i)

        for j in range(i + 1, num_clusters):

            if j in used:
                continue

            if colors_similar(centers[i], centers[j]):
                group.append(j)
                used.add(j)

        cluster_groups.append(group)

    # --------------------------------------------------------
    # Process each color group
    # --------------------------------------------------------

    results = []
    object_id = 0

    for group in cluster_groups:

        # ----------------------------------------------------
        # Build combined binary mask
        # ----------------------------------------------------

        mask = np.zeros((h, w), dtype=np.uint8)

        for cluster_idx in group:

            cluster_mask = np.uint8(label_image == cluster_idx) * 255

            mask = cv2.bitwise_or(mask, cluster_mask)

        # ----------------------------------------------------
        # Morphological reconstruction
        # This reconnects fragmented pieces
        # ----------------------------------------------------

        kernel = np.ones((bridge_size, bridge_size), np.uint8)

        reconstructed = cv2.morphologyEx(
            mask,
            cv2.MORPH_CLOSE,
            kernel
        )

        # ----------------------------------------------------
        # Optional cleanup
        # ----------------------------------------------------

        reconstructed = cv2.morphologyEx(
            reconstructed,
            cv2.MORPH_OPEN,
            np.ones((3, 3), np.uint8)
        )

        # ----------------------------------------------------
        # Extract reconstructed contours
        # ----------------------------------------------------

        contours, _ = cv2.findContours(
            reconstructed,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        # ----------------------------------------------------
        # Measure objects
        # ----------------------------------------------------

        for contour in contours:

            area = cv2.contourArea(contour)

            if area < min_area:
                continue

            x, y, bw, bh = cv2.boundingRect(contour)

            perimeter = cv2.arcLength(contour, True)

            rect = cv2.minAreaRect(contour)
            (_, _), (rw, rh), angle = rect

            result = {
                "id": object_id,

                # Keep original schema compatibility
                "cluster": group[0],

                # Preserve merged cluster information
                "cluster_group": group,

                # Original expected field
                "cluster_center_bgr": np.mean(
                    [centers[g] for g in group],
                    axis=0
                ).astype(int).tolist(),

                # Geometry
                "x": int(x),
                "y": int(y),
                "width": int(bw),
                "height": int(bh),

                "rotated_width": float(rw),
                "rotated_height": float(rh),
                "rotation_angle": float(angle),

                "area": float(area),
                "perimeter": float(perimeter),

                # Optional debug info
                "contour": contour
            }

            results.append(result)

            object_id += 1

    return results

def main():

    segmented_image, annotated_image, results = process_image(
        INPUT_IMAGE
    )

    cv2.imwrite("kmeans_segmented.png", segmented_image)
    cv2.imwrite(OUTPUT_IMAGE, annotated_image)

    save_json(results, OUTPUT_JSON)
    save_csv(results, OUTPUT_CSV)

    print("\nDetected Objects")
    print("=" * 70)

    for obj in results:

        print(
            f"ID: {obj['id']:03d} | "
            f"Cluster: {obj['cluster']} | "
            f"W: {obj['width']:4d} | "
            f"H: {obj['height']:4d} | "
            f"Area: {obj['area']:8.1f} | "
            f"Perimeter: {obj['perimeter']:8.1f}"
        )

    print("\nOutput files:")
    print("  - kmeans_segmented.png")
    print(f"  - {OUTPUT_IMAGE}")
    print(f"  - {OUTPUT_JSON}")
    print(f"  - {OUTPUT_CSV}")

    # Display windows
    cv2.imshow("KMeans Segmentation", segmented_image)
    cv2.imshow("Detected Objects", annotated_image)

    cv2.waitKey(0)
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()