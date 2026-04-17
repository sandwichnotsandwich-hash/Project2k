#!/usr/bin/env python3
"""Generate public/og-image.png. Regenerate after editing the tagline."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
BLUE = (10, 132, 255, 255)
GREY = (160, 160, 168, 255)

TITLE = "PROJECT2K"
TAGLINE = "Dial in your stats. Crush your PR."

FONT_ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"
FONT_UI = "/System/Library/Fonts/HelveticaNeue.ttc"

img = Image.new("RGBA", (W, H), BG)
draw = ImageDraw.Draw(img)

title_font = ImageFont.truetype(FONT_ROUNDED, 170)
title_font.set_variation_by_name("Bold")
tag_font = ImageFont.truetype(FONT_UI, 48)

# PROJECT + 2K, side by side, centered
project = "PROJECT"
twok = "2K"
p_bbox = draw.textbbox((0, 0), project, font=title_font)
t_bbox = draw.textbbox((0, 0), twok, font=title_font)
p_w = p_bbox[2] - p_bbox[0]
t_w = t_bbox[2] - t_bbox[0]
title_h = p_bbox[3] - p_bbox[1]
total_w = p_w + t_w
title_x = (W - total_w) // 2
title_y = int(H * 0.32) - title_h // 2

draw.text((title_x - p_bbox[0], title_y - p_bbox[1]), project, font=title_font, fill=WHITE)
draw.text((title_x + p_w - t_bbox[0], title_y - t_bbox[1]), twok, font=title_font, fill=BLUE)

# Tagline centered below
tag_bbox = draw.textbbox((0, 0), TAGLINE, font=tag_font)
tag_w = tag_bbox[2] - tag_bbox[0]
tag_h = tag_bbox[3] - tag_bbox[1]
tag_x = (W - tag_w) // 2
tag_y = title_y + title_h + 60
draw.text((tag_x - tag_bbox[0], tag_y - tag_bbox[1]), TAGLINE, font=tag_font, fill=GREY)

img.save("public/og-image.png", optimize=True)
print(f"Wrote public/og-image.png ({W}x{H})")
