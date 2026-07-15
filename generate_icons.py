from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background - Google Docs blue #4285F4
    margin = size // 10
    draw.ellipse((margin, margin, size - margin, size - margin), fill="#4285F4")

    # Inner face/circle
    inner_margin = size // 4
    draw.ellipse((inner_margin, inner_margin, size - inner_margin, size - inner_margin), fill="white")

    # Simple magnifying glass handle
    draw.line((size // 2, size - inner_margin, size - margin, size - margin), fill="white", width=size//10)

    img.save(f"find-me/icons/icon{size}.png")

os.makedirs("find-me/icons", exist_ok=True)
for size in [16, 48, 128]:
    create_icon(size)
