from PIL import Image, ImageDraw

def create_icon(size, filename):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Google Docs Blue
    color = "#4285F4"

    # Draw a rounded rectangle or shield-like shape
    padding = size // 8
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=size // 4,
        fill=color
    )

    # Draw a checkmark in white
    # Simple checkmark coordinates relative to size
    check_color = "white"
    width = size // 8

    # Checkmark points
    points = [
        (size * 0.3, size * 0.5),
        (size * 0.45, size * 0.65),
        (size * 0.7, size * 0.35)
    ]

    draw.line(points, fill=check_color, width=width, joint="curve")

    image.save(filename)
    print(f"Generated {filename}")

if __name__ == "__main__":
    create_icon(16, "grammar-checker/icons/icon16.png")
    create_icon(48, "grammar-checker/icons/icon48.png")
    create_icon(128, "grammar-checker/icons/icon128.png")
