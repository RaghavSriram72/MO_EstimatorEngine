import cv2
import numpy as np
import json
import csv
from scipy.spatial import Delaunay
import math

# INTERNALLY: process_image is the most important function here

def kmeans_segmentation(image, k=5):
    """
    Segment image into K color clusters using K-means.
    """

    # Reshape image into Nx3 pixel array annd convert to float32
    
    pixel_values = image.reshape((-1, 3))
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

def load_image(image_path):
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Could not load image: {image_path}") 
    return image

def process_image(image, k_clusters = 6, min_area = 100):

    image, _ = remove_background(image)

    segmented_image, label_image, centers = kmeans_segmentation(
        image,
        k_clusters
    )

    # Visualization image
    output = image.copy()

    cluster_colors = generate_cluster_colors(k_clusters)

    all_results = []

    binary_masks = []

    object_id = 0

    # --------------------------------------------------------
    # PROCESS EACH CLUSTER
    # --------------------------------------------------------

    for cluster_idx in range(k_clusters):

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

            if area < min_area:
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

            binary_masks.append(contour_to_mask(contour,image_shape = segmented_image.shape))

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
    return segmented_image, output, all_results, np.array(binary_masks)

def remove_background(image):
    """
    Removes white background + light shadow background while preserving
    object regions. Output image keeps same shape as input.
    """
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    h, s, v = cv2.split(hsv)

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

def generate_cluster_colors(k):

    np.random.seed(42)

    colors = []

    for _ in range(k):
        color = tuple(int(x) for x in np.random.randint(0, 255, 3))
        colors.append(color)

    return colors

def clean_mask(mask, kernel_size = 5):
    """
    Remove noise and fill holes.
    """

    kernel = np.ones((kernel_size, kernel_size), np.uint8)

    # Remove small noise
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    # Fill holes
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    return mask

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
        "perimeter": float(perimeter)
    }

def contour_to_mask(contour, image_shape):

    mask = np.zeros(image_shape[:2], dtype=np.uint8)

    cv2.drawContours(
        mask,
        [contour],
        -1,
        1,
        thickness=cv2.FILLED
    )

    return mask

def merge_masks(masks, ids):
    # simple version of merging masks (just bitwise or binary masks)
    merged_mask = np.zeros_like(masks[0], dtype=np.uint8)
    for id in ids:
        merged_mask = np.logical_or(merged_mask, masks[id])
    merged_mask = merged_mask.astype(np.uint8)
    return merged_mask

def merge_masks_alpha_shape(
    masks,
    alpha=0.015,
    smooth=True,
    epsilon_ratio=0.005
):
    """
    Returns 3 values. Should run this when we believe the elements being merged are directly connected by obscured parts
    merged_mask: combined mask filled in to reflect the interpolated values
    combined: combined mask without filling empty space (same as the "simple" version of merging masks)
    perimeter: perimeter generated from interpolated hull shape
    """
    combined = np.zeros_like(masks[0], dtype=np.uint8)

    for mask in masks:
        combined = np.logical_or(combined, mask)

    combined = combined.astype(np.uint8)

    ys, xs = np.where(combined > 0)

    points = np.column_stack((xs, ys)).astype(np.float32)

    if len(points) < 4:
        return combined, None, 0, 0

    # Delaunay triangulation
    tri = Delaunay(points)

    edges = set()

    def add_edge(i, j):

        if (i, j) in edges or (j, i) in edges:
            return

        edges.add((i, j))

    for simplex in tri.simplices:

        ia, ib, ic = simplex

        pa = points[ia]
        pb = points[ib]
        pc = points[ic]

        a = np.linalg.norm(pa - pb)
        b = np.linalg.norm(pb - pc)
        c = np.linalg.norm(pc - pa)

        s = (a + b + c) / 2.0

        area_term = s * (s - a) * (s - b) * (s - c)

        if area_term <= 0:
            continue

        triangle_area = math.sqrt(area_term)

        circumradius = (a * b * c) / (4.0 * triangle_area)
        if circumradius < (1.0 / alpha):

            add_edge(ia, ib)
            add_edge(ib, ic)
            add_edge(ic, ia)

    edge_points = []

    for i, j in edges:

        edge_points.append(points[i])
        edge_points.append(points[j])

    if len(edge_points) == 0:
        return combined, None, 0, 0

    edge_points = np.array(edge_points)


    hull = cv2.convexHull(
        edge_points.astype(np.float32)
    )

    if smooth:
        epsilon = (
            epsilon_ratio *
            cv2.arcLength(hull, True)
        )

        hull = cv2.approxPolyDP(
            hull,
            epsilon,
            True
        )

    merged_mask = np.zeros_like(combined)

    cv2.drawContours(
        merged_mask,
        [hull.astype(np.int32)],
        -1,
        1,
        thickness=cv2.FILLED
    )
    perimeter = cv2.arcLength(
        hull.astype(np.float32),
        True
    )

    return merged_mask, combined, perimeter

def save_csv(results, filename):

    if len(results) == 0:
        return

    keys = results[0].keys()

    with open(filename, "w", newline="") as f:

        writer = csv.DictWriter(f, fieldnames=keys)

        writer.writeheader()

        writer.writerows(results)

def main():

    image = load_image(INPUT_IMAGE_PATH)

    segmented_image, annotated_image, results, _ = process_image(
        image
    )

    cv2.imwrite(SEGMENTED_IMAGE_OUTPUT_PATH, segmented_image)
    cv2.imwrite(ANNOTATED_IMAGE_OUTPUT_PATH, annotated_image)

    #save_json(results, OUTPUT_JSON)
    save_csv(results, RESULTS_FILE)

    print("\nDetected Objects")
    print("=" * 70)

    for obj in results:

        print(
            f"ID: {obj['id']:03d} | "
            f"Cluster: {obj['cluster']} | "
            f"W: {obj['width']:4d} | "
            f"H: {obj['height']:4d} | "
            f"Perimeter: {obj['perimeter']:8.1f}"
        )

    print("\nOutput files:")
    print("  - kmeans_segmented.png")
    # print(f"  - {OUTPUT_IMAGE}")
    # print(f"  - {OUTPUT_JSON}")
    # print(f"  - {OUTPUT_CSV}")

    # Display windows
    cv2.imshow("KMeans Segmentation", segmented_image)
    cv2.imshow("Detected Objects", annotated_image)

    cv2.waitKey(0)
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()