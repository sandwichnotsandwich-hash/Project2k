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

# Match the website title font: SF Pro Rounded Bold (the CSS stack's
# 'SF Pro Rounded' fallback is what the browser actually renders).
FONT_TITLE = "/System/Library/Fonts/SFNSRounded.ttf"
FONT_UI = "/System/Library/Fonts/SFNS.ttf"

title_font = ImageFont.truetype(FONT_TITLE, 180)
title_font.set_variation_by_name("Bold")
tag_font = ImageFont.truetype(FONT_UI, 50)
tag_font.set_variation_by_name("Regular")

GAP = 40  # space between title and tagline baseline row

# Render the title+tagline block onto a transparent canvas, then trim to
# the real rendered pixel bounds (ignoring font ascent/descent padding),
# and paste centered onto the final image.
pad = 40
block = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bdraw = ImageDraw.Draw(block)

project, twok = "PROJECT", "2K"
p_bbox = bdraw.textbbox((0, 0), project, font=title_font)
t_bbox = bdraw.textbbox((0, 0), twok, font=title_font)
p_w = p_bbox[2] - p_bbox[0]
t_w = t_bbox[2] - t_bbox[0]
title_h = max(p_bbox[3] - p_bbox[1], t_bbox[3] - t_bbox[1])
title_w = p_w + t_w

tag_bbox = bdraw.textbbox((0, 0), TAGLINE, font=tag_font)
tag_w = tag_bbox[2] - tag_bbox[0]
tag_h = tag_bbox[3] - tag_bbox[1]

title_x = (W - title_w) // 2
title_y = pad
bdraw.text((title_x - p_bbox[0], title_y - p_bbox[1]), project, font=title_font, fill=WHITE)
bdraw.text((title_x + p_w - t_bbox[0], title_y - t_bbox[1]), twok, font=title_font, fill=BLUE)

tag_x = (W - tag_w) // 2
tag_y = pad + title_h + GAP
bdraw.text((tag_x - tag_bbox[0], tag_y - tag_bbox[1]), TAGLINE, font=tag_font, fill=GREY)

# Trim transparent edges to get the real visual bounds
real_bbox = block.getbbox()
trimmed = block.crop(real_bbox)

# Compose final image with trimmed block centered vertically + horizontally
img = Image.new("RGBA", (W, H), BG)
tw, th = trimmed.size
img.paste(trimmed, ((W - tw) // 2, (H - th) // 2), trimmed)

img.save("public/og-image.png", optimize=True)
print(f"Wrote public/og-image.png ({W}x{H})")
