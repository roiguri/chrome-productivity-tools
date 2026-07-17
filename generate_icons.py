from PIL import Image, ImageDraw, ImageFont

def create_icon(size):
    # Google Docs blue
    bg_color = (66, 133, 244)
    # White text
    text_color = (255, 255, 255)

    img = Image.new('RGB', (size, size), color=bg_color)
    draw = ImageDraw.Draw(img)

    # Try to load a font, otherwise use default
    try:
        # Use a larger font size relative to icon size
        font_size = max(int(size * 0.6), 10)
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", font_size)
    except IOError:
        font = ImageFont.load_default()

    text = "PG"
    # Get text bounding box to center it
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except AttributeError:
        # Fallback for older Pillow versions
        text_width, text_height = draw.textsize(text, font=font)

    x = (size - text_width) / 2
    y = (size - text_height) / 2 - (size * 0.1) # slightly shift up for visual balance

    draw.text((x, y), text, font=font, fill=text_color)

    img.save(f'password-generator/icons/icon{size}.png')

sizes = [16, 48, 128]
for size in sizes:
    create_icon(size)
    print(f"Created icon{size}.png")
