# 動画のサムネイル (1280×720)。判定帯の赤にスマホ画面を添える。
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = r'C:\Users\takas\OneDrive\ドキュメント\GitHub\DisasterPrevention\公共交通オープンデータチャレンジ2026'
OUT = ROOT + r'\素材\サムネイル.png'
FONT = r'C:\Windows\Fonts\YuGothB.ttc'
W, H = 1280, 720
RED = (0xa4, 0x23, 0x1c)
DARK = (0x7a, 0x18, 0x14)
WHITE = (255, 255, 255)
CREAM = (0xff, 0xe9, 0xe6)

im = Image.new('RGB', (W, H), RED)
d = ImageDraw.Draw(im)
# 右下を少し暗くして奥行き
grad = Image.new('L', (W, H), 0)
gd = ImageDraw.Draw(grad)
for i in range(H):
    gd.line([(0, i), (W, i)], fill=int(90 * i / H))
im.paste(Image.new('RGB', (W, H), DARK), (0, 0), grad)
d = ImageDraw.Draw(im)

f = lambda size: ImageFont.truetype(FONT, size)

# 左: 文言
d.text((70, 78), 'Move or Wait', font=f(68), fill=WHITE)
d.text((70, 168), '動くか、待つか', font=f(88), fill=WHITE)

d.rounded_rectangle((70, 300, 690, 372), radius=14, fill=CREAM)
d.text((92, 312), '「再開の見込みは立っていません」', font=f(36), fill=RED)
d.text((70, 400), 'に数字を与える。', font=f(52), fill=WHITE)

d.text((70, 520), '地震のあと、待つか、今夜の寝場所を確保するか。', font=f(30), fill=CREAM)
line = '訪日外国人向け  ·  日本語 / EN / 中文 / '
d.text((70, 566), line, font=f(26), fill=CREAM)
# 한국어 は游ゴシックに無いので Malgun Gothic で
kx = 70 + d.textlength(line, font=f(26))
d.text((kx, 566), '한국어', font=ImageFont.truetype(r'C:\Windows\Fonts\malgunbd.ttf', 26), fill=CREAM)
d.text((70, 650), '公共交通オープンデータチャレンジ2026', font=f(24), fill=CREAM)

# 右: スマホ画面。帯の部分が読めるサイズに
ph = Image.open(ROOT + r'\素材\01_verdict_en.png').convert('RGB')
ph_h = 660
ph = ph.resize((int(ph_h * 390 / 844), ph_h), Image.LANCZOS)
x, y = W - ph.width - 70, 40
# 影
shadow = Image.new('RGBA', (ph.width + 60, ph.height + 60), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((30, 30, ph.width + 30, ph.height + 30), radius=28, fill=(0, 0, 0, 140))
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
im.paste(shadow, (x - 30, y - 22), shadow)
# 枠
frame = Image.new('RGB', (ph.width + 16, ph.height + 16), (0x14, 0x18, 0x1d))
mask = Image.new('L', frame.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius=26, fill=255)
im.paste(frame, (x - 8, y - 8), mask)
pmask = Image.new('L', ph.size, 0)
ImageDraw.Draw(pmask).rounded_rectangle((0, 0, ph.width - 1, ph.height - 1), radius=20, fill=255)
im.paste(ph, (x, y), pmask)

im.save(OUT)
print('saved', OUT)
