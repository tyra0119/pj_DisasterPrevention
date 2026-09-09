# 紹介動画の元になるスライドを作る。ナレーションはノートに入れ、後段で音声化する。
import sys, io
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

ROOT = r'C:\Users\takas\OneDrive\ドキュメント\GitHub\DisasterPrevention\公共交通オープンデータチャレンジ2026'
IMG = ROOT + r'\素材'
OUT = ROOT + r'\紹介スライド.pptx'
FULL = ROOT + r'\紹介スライド_詳細版.pptx'

INK = RGBColor(0x14, 0x18, 0x1d)
MUTE = RGBColor(0x5c, 0x66, 0x70)
RED = RGBColor(0xa4, 0x23, 0x1c)
DARK = RGBColor(0x5a, 0x10, 0x16)
GREEN = RGBColor(0x0b, 0x6b, 0x3a)
AMBER = RGBColor(0x9a, 0x5b, 0x06)
PANEL = RGBColor(0xf4, 0xf5, 0xf7)
WHITE = RGBColor(0xff, 0xff, 0xff)
FONT = 'Yu Gothic UI'

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
W, H = prs.slide_width, prs.slide_height


def box(slide, x, y, w, h, fill=None, line=None, radius=False):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, x, y, w, h)
    if radius:
        shp.adjustments[0] = 0.06
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid(); shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line; shp.line.width = Pt(1)
    shp.shadow.inherit = False
    return shp


def text(slide, x, y, w, h, runs, size=20, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.15):
    """runs: str | list of (str, dict) per paragraph. dict keys: size,color,bold,space"""
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.05)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    paras = runs if isinstance(runs, list) else [(runs, {})]
    for i, (s, o) in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = o.get('align', align)
        p.line_spacing = spacing
        if o.get('space'):
            p.space_before = Pt(o['space'])
        r = p.add_run(); r.text = s
        f = r.font; f.name = FONT; f.size = Pt(o.get('size', size)); f.bold = o.get('bold', bold)
        f.color.rgb = o.get('color', color)
    return tb


def label(slide, s, y=Inches(0.55)):
    text(slide, Inches(0.8), y, Inches(8), Inches(0.4), s, size=13, color=RED, bold=True)


def heading(slide, s, y=Inches(0.95), size=34, w=Inches(11.5)):
    paras = [(line, {}) for line in s.split('\n')]
    text(slide, Inches(0.8), y, w, Inches(1.4), paras, size=size, bold=True, spacing=1.05)


def phone(slide, name, x, y=Inches(0.45), h=Inches(6.6)):
    """スマホ画面。枠つき。"""
    w = int(h * 390 / 844)
    box(slide, x - Inches(0.08), y - Inches(0.08), w + Inches(0.16), h + Inches(0.16), fill=INK, radius=True)
    slide.shapes.add_picture(f'{IMG}\\{name}.png', x, y, width=w, height=h)
    return w


def footer(slide, n):
    text(slide, Inches(0.8), Inches(7.0), Inches(8), Inches(0.3), 'Move or Wait — 動くか、待つか  ·  公共交通オープンデータチャレンジ2026', size=10, color=MUTE)


def notes(slide, s):
    slide.notes_slide.notes_text_frame.text = s


n = 0
def new():
    global n
    n += 1
    s = prs.slides.add_slide(BLANK)
    if n > 1:
        footer(s, n)
    return s


# ── 1 表紙 ──
s = new()
box(s, 0, 0, W, H, fill=RED)
text(s, Inches(0.9), Inches(1.6), Inches(11), Inches(1.0), 'Move or Wait', size=60, color=WHITE, bold=True)
text(s, Inches(0.9), Inches(2.65), Inches(11), Inches(1.0), '動くか、待つか', size=44, color=WHITE, bold=True)
text(s, Inches(0.9), Inches(4.0), Inches(11), Inches(1.4), [
    ('地震のあと、「運転再開の見込みは立っていません」に数字を与える。', {'size': 24, 'color': WHITE}),
    ('訪日外国人が、待つか、今夜の寝場所を確保するかを、いま決められるように。', {'size': 24, 'color': WHITE, 'space': 6}),
])
text(s, Inches(0.9), Inches(6.3), Inches(11), Inches(0.5), '公共交通オープンデータチャレンジ2026 応募作品  ·  tyra0119.github.io/pj_DisasterPrevention', size=14, color=WHITE)
notes(s, 'Move or Wait、動くか待つか。地震のあと、待つか、今夜の寝場所を確保するかを、訪日外国人がいま決められるようにするアプリです。')

# ── 2 課題 ──
s = new()
label(s, '課題')
heading(s, '「運転再開の見込みは立っていません」')
box(s, Inches(0.8), Inches(2.2), Inches(7.2), Inches(1.5), fill=PANEL, radius=True)
text(s, Inches(1.0), Inches(2.35), Inches(6.8), Inches(1.3), [
    ('現在、安全確認のため運転を見合わせています。', {'size': 18}),
    ('運転再開の見込みは立っていません。', {'size': 18, 'bold': True}),
    ('— 地震のあと、どの鉄道会社も同じ文になる', {'size': 13, 'color': MUTE, 'space': 6}),
])
text(s, Inches(0.8), Inches(4.0), Inches(7.2), Inches(2.6), [
    ('方針ではない。点検内容で復旧時間が大きく変わり、数字が出せない。', {'size': 18}),
    ('2026-08-23 茨城県南部 M5.9 最大震度 5 弱', {'size': 16, 'bold': True, 'space': 14}),
    ('02:00 発生 → 05:00 始発から関東の在来線が運転見合わせ', {'size': 16}),
    ('→ 06:15 になっても再開見込みなし。4 時間以上、誰も「あとどれくらい」を言わない', {'size': 16, 'color': RED, 'bold': True}),
])
# 右: 時間軸
x0 = Inches(8.8)
box(s, x0, Inches(2.4), Inches(3.6), Inches(3.9), fill=PANEL, radius=True)
for i, (t, m, c) in enumerate([('02:00', '地震発生', INK), ('05:00', '始発から見合わせ', AMBER), ('06:15', '再開見込みなし', RED), ('?', 'あとどれくらい？', RED)]):
    y = Inches(2.6 + i * 0.95)
    text(s, x0 + Inches(0.2), y, Inches(1.1), Inches(0.6), t, size=22, bold=True, color=c)
    text(s, x0 + Inches(1.4), y + Inches(0.08), Inches(2.1), Inches(0.6), m, size=15, color=c)
notes(s, '地震のあと、鉄道会社の案内は全社同じです。「再開の見込みは立っていません」。点検内容で復旧時間が変わり、数字が出せないからです。8月23日の茨城県南部の地震では、発生から4時間以上、誰も「あとどれくらい」を言いませんでした。')

# ── 3 誰が困るか ──
s = new()
label(s, '誰が一番困るか')
heading(s, '一番判断材料がないのは、訪日外国人')
items = [('日本語のアナウンスが読めない', '駅の電光掲示も、車内放送も'),
         ('「点検」が何時間を意味するか知らない', '30 分なのか、明日なのか'),
         ('ホテルが数時間で埋まることを知らない', '駅周辺は地震のあとすぐ満室になる')]
for i, (a, b) in enumerate(items):
    y = Inches(2.3 + i * 1.15)
    box(s, Inches(0.8), y, Inches(7.4), Inches(0.95), fill=PANEL, radius=True)
    text(s, Inches(1.05), y + Inches(0.1), Inches(7), Inches(0.8), [(a, {'size': 20, 'bold': True}), (b, {'size': 14, 'color': MUTE})])
box(s, Inches(8.8), Inches(2.3), Inches(3.7), Inches(3.35), fill=RED, radius=True)
text(s, Inches(9.0), Inches(2.5), Inches(3.3), Inches(3.0), [
    ('1 時間目に決めるか', {'size': 24, 'color': WHITE, 'bold': True}),
    ('4 時間目に決めるかで', {'size': 24, 'color': WHITE, 'bold': True}),
    ('結果が変わる。', {'size': 24, 'color': WHITE, 'bold': True}),
    ('今夜の宿は取ってある。飛行機は明日。待てばいいのか、動くべきなのか。', {'size': 14, 'color': WHITE, 'space': 12}),
], anchor=MSO_ANCHOR.MIDDLE)
notes(s, '一番困るのは訪日外国人です。案内が読めず、点検が何時間か知らず、ホテルが数時間で埋まることも知りません。1時間目に決めるか4時間目かで、結果が変わります。')

# ── 4 解決 ──
s = new()
label(s, '解決')
heading(s, '「あとどれくらい」に数字を与える', w=Inches(8))
text(s, Inches(0.8), Inches(2.1), Inches(7.6), Inches(4.6), [
    ('待つか、今夜の寝場所を確保するかを、いま決められるようにする。', {'size': 18, 'bold': True}),
    ('再開までの幅と時刻', {'size': 18, 'bold': True, 'color': RED, 'space': 18}),
    ('「51 分〜4 時間 26 分 · 12:24〜15:59 ごろ」。路線ごとに出す', {'size': 15}),
    ('決断の形で出す', {'size': 18, 'bold': True, 'color': RED, 'space': 12}),
    ('震度でも分数でもなく「今夜のうちに戻れる見込み」。終電と便の出発時刻から逆算', {'size': 15}),
    ('いまいる場所・宿・出国便', {'size': 18, 'bold': True, 'color': RED, 'space': 12}),
    ('事前に登録した場所ごとに、平常 / 遅れ / 停止 / 不通の印', {'size': 15}),
    ('この数字を出しているところは、他にない。', {'size': 16, 'bold': True, 'space': 18}),
])
phone(s, '01_verdict_en', Inches(9.4))
notes(s, 'このアプリは、その「あとどれくらい」に数字を与えます。再開まで51分から4時間26分、と幅と時刻で出し、「今夜のうちに戻れる見込み」という決断の形にします。終電と出国便の時刻から逆算しています。')

# ── 5 内訳 ──
s = new()
label(s, '根拠を開ける')
heading(s, '路線ごとに、なぜその幅なのかを見せる', w=Inches(8))
text(s, Inches(0.8), Inches(2.1), Inches(7.6), Inches(4.6), [
    ('宿の行をタップすると、その周りの路線が 1 行ずつ。', {'size': 17}),
    ('路線の「+」で内訳が開く。', {'size': 17, 'space': 4}),
    ('・線路上で最も強く揺れた観測点と震度', {'size': 15, 'space': 14}),
    ('・点検が要る区間の長さ (km)', {'size': 15}),
    ('・再開までの幅と時刻', {'size': 15}),
    ('・対応する線路 (国土数値情報の線路名称)', {'size': 15}),
    ('・鉄道会社の案内 (ODPT 運行情報) と、その時点', {'size': 15}),
    ('「鉄道会社の判断ではなく推定である」ことを毎回書く。', {'size': 15, 'color': MUTE, 'space': 14}),
    ('見込みを出すからこそ、根拠と限界を隠さない。', {'size': 15, 'color': MUTE}),
])
phone(s, '02_lines_en', Inches(9.4))
notes(s, '宿の行を開くと、周りの路線が並びます。路線ごとに、最も揺れた観測点、点検区間の長さ、再開までの幅、鉄道会社の案内が見えます。根拠と限界を隠しません。')

# ── 6 6強 ──
s = new()
label(s, '待たない判断')
heading(s, '震度 6 強なら、待たずに宿を取れ', size=26, w=Inches(5.6))
text(s, Inches(0.8), Inches(2.1), Inches(5.4), Inches(4.6), [
    ('「鉄道は使えない見込み」', {'size': 18, 'bold': True, 'color': DARK}),
    ('見込み時刻は出さない。出せないものを出さない。', {'size': 15}),
    ('「宿を取るなら早い方がいい。地震のあと、駅の近くはすぐ埋まります」', {'size': 15, 'space': 8}),
    ('帰れないときに休める場所', {'size': 18, 'bold': True, 'color': GREEN, 'space': 18}),
    ('一時滞在施設 (東京都・帰宅困難者向け) を青、', {'size': 15}),
    ('指定緊急避難場所 (国土地理院) を緑で、同じ地図に。', {'size': 15}),
    ('「休む場所」と「逃げる場所」は用途が違う。', {'size': 15, 'color': MUTE, 'space': 8}),
    ('現在地は住所で出す。駅員やタクシーに画面を見せれば伝わる。', {'size': 15, 'color': MUTE, 'space': 8}),
])
w = phone(s, '03_avoid_en', Inches(6.5))
phone(s, '04_shelter_en', Inches(6.5) + w + Inches(0.35))
notes(s, '震度6強なら、待たずに宿を取れと言い、時刻は出しません。休める場所として、東京都の一時滞在施設と指定緊急避難場所を同じ地図に。現在地は住所で表示します。')

# ── 7 仕組み ──
s = new()
label(s, '仕組み')
heading(s, '震度 → 路線 → 運転系統 → 待ち時間 → 決断')
steps = [
    ('気象庁の震度', '観測点 4,360 点。P2P地震情報と気象庁 bosai JSON から', INK),
    ('路線に重ねる', '国土数値情報 N02 の 596 路線・27,343 標本点に最大震度を割り当て。162 ms', INK),
    ('運転系統に組み替え', 'ODPT odpt:Railway / odpt:Station。「山手線」を旅客が知る一周に。190 系統', RED),
    ('推定式', '高浜・翠川 (2011) 日本地震工学会論文集。震度 4 → 注意運転点検 30 分 / 5 弱 → 徒歩点検 6.0 分/km ± 30 分 / 6 弱〜 → 時間を出さない', INK),
    ('運行情報で終わらせる', 'ODPT odpt:TrainInformation が「平常」なら推定を捨てる。「見合わせ」なら裏付け', RED),
    ('決断に翻訳', '終電・便の出発時刻から逆算して「今夜戻れる / 戻れない」', INK),
]
for i, (a, b, c) in enumerate(steps):
    y = Inches(2.15 + i * 0.78)
    box(s, Inches(0.8), y, Inches(0.55), Inches(0.55), fill=c, radius=True)
    text(s, Inches(0.8), y, Inches(0.55), Inches(0.55), str(i + 1), size=16, color=WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(1.5), y - Inches(0.05), Inches(3.2), Inches(0.6), a, size=17, bold=True, color=c, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(4.7), y - Inches(0.05), Inches(8.0), Inches(0.65), b, size=13, color=INK if c is INK else RED, anchor=MSO_ANCHOR.MIDDLE)
notes(s, '仕組みです。気象庁の震度を全国596路線に重ね、公共交通オープンデータセンターの路線と駅のデータで、旅客が知る運転系統に組み替えます。高浜・翠川の推定式で再開までの幅を出し、運行情報で「平常」なら推定を捨て、決断の形に翻訳します。')

# ── 数字の根拠 ──
s = new()
label(s, '数字の根拠')
heading(s, '再開までの時間は、既往研究の推定式から出している')
text(s, Inches(0.8), Inches(2.05), Inches(7.4), Inches(0.9), [
    ('高浜勉・翠川三郎「地震時の鉄道運休時間の推定方法」', {'size': 16, 'bold': True}),
    ('日本地震工学会論文集 第 11 巻第 2 号 (2011) 表 1・図 1。首都圏の鉄道事業者 24 社への聞き取り (2005 年千葉県北西部地震) が元', {'size': 12, 'color': MUTE}),
])
rows = [('震度 4', '注意運転点検・重要箇所の点検', '30 分 + 再開まで 5 分', INK),
        ('震度 5 弱・5 強', '徒歩点検', 'max(6.0 × L, 30) 分 ± 30 分 + 5 分', RED),
        ('震度 6 弱以上', '被害が出る領域。点検だけでは終わらない', '時間を出さない (日単位になりうる)', DARK)]
y = Inches(3.05)
text(s, Inches(0.8), y, Inches(1.8), Inches(0.35), '基準値', size=11, color=MUTE, bold=True)
text(s, Inches(2.6), y, Inches(2.6), Inches(0.35), '点検', size=11, color=MUTE, bold=True)
text(s, Inches(5.2), y, Inches(3.0), Inches(0.35), '再開まで', size=11, color=MUTE, bold=True)
y += Inches(0.35)
for a, b, c, col in rows:
    box(s, Inches(0.8), y, Inches(7.4), Inches(0.58), fill=PANEL, radius=True)
    text(s, Inches(0.95), y + Inches(0.05), Inches(1.7), Inches(0.5), a, size=14, bold=True, color=col, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(2.6), y + Inches(0.05), Inches(2.6), Inches(0.5), b, size=12.5, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(5.2), y + Inches(0.05), Inches(3.0), Inches(0.5), c, size=12.5, bold=True, color=col, anchor=MSO_ANCHOR.MIDDLE)
    y += Inches(0.64)
text(s, Inches(0.8), y + Inches(0.1), Inches(7.4), Inches(1.4), [
    ('L (点検区間) は、震度 5 弱以上が当たった区間だけを 3 km 回廊で数える。営業キロが分かる 7 系統で較正 (1.7 km/セル、±40%)。', {'size': 12.5}),
    ('この ±40% と式の ±30 分を重ねたものが、画面の「51 分〜4 時間 26 分」の幅。精度を装わず、幅で言う。', {'size': 12.5, 'space': 4}),
    ('国土交通省「首都圏鉄道の運転再開のあり方に関する協議会」報告書 (2012) の実施基準の例 (震度 4 で 55 km/h 以下の注意運転、5 弱で 25 km/h 以下、5 強以上は点検まで運転中止) とも整合。', {'size': 11.5, 'color': MUTE, 'space': 4}),
])
box(s, Inches(8.6), Inches(2.05), Inches(3.9), Inches(4.6), fill=RGBColor(0xfb, 0xec, 0xea), radius=True)
text(s, Inches(8.8), Inches(2.2), Inches(3.5), Inches(4.3), [
    ('この見積もりの限界', {'size': 16, 'bold': True, 'color': RED}),
    ('鉄道会社は気象庁の震度で判断していない。', {'size': 13, 'bold': True, 'space': 10}),
    ('各社は沿線の自前地震計の加速度 (gal) や SI 値で規制をかける。ここで使う震度は最大 20 km 離れた観測点の値で、代理指標にすぎない。', {'size': 12}),
    ('だから', {'size': 13, 'bold': True, 'space': 10}),
    ('・幅で出し、断定しない', {'size': 12}),
    ('・「鉄道会社の判断ではなく推定」と毎回表示', {'size': 12}),
    ('・実際に止まっているかは ODPT 運行情報で確定', {'size': 12}),
    ('・6 弱以上は時間を出さない', {'size': 12}),
], anchor=MSO_ANCHOR.TOP)
notes(s, '数字の根拠は、高浜・翠川「地震時の鉄道運休時間の推定方法」、日本地震工学会論文集2011年の推定式です。震度4は注意運転点検で30分。震度5弱以上は徒歩点検で1キロあたり6分、プラスマイナス30分。6弱以上は時間を出しません。点検区間の誤差と式のばらつきを重ねたものが、画面の幅です。鉄道会社は自前の地震計で判断するので、これは推定です。だから幅で出し、運行情報で確定させます。')

# ── 8 オープンデータ ──
s = new()
label(s, 'オープンデータの使い方')
heading(s, '運行情報を「主」ではなく「推定を終わらせる手段」として使う')
rows = [
    ('ODPT  odpt:Railway / odpt:Station', '線路名称 → 運転系統の対応表', 'N02 の山手線は 17 駅。運行情報も系統単位で来る', RED),
    ('ODPT  odpt:TrainInformation', '推定を終わらせる', '推定は上限まで「止まっている」と言い続ける。事業者が平常と言えば捨てる', RED),
    ('気象庁 bosai JSON / P2P地震情報', '震度分布', '鍵なし・CORS 開放。英語の震源名も入っている', INK),
    ('気象庁 震度観測点一覧表', '観測点 → 座標', '199 地震 6,016 点で欠落ゼロ', INK),
    ('国土数値情報 N02-25 (CC BY 4.0)', '駅・線路の形', '同梱して配れる。空港アクセス路線が揃う', INK),
    ('国土地理院 避難場所・逆ジオコーダ・タイル', '逃げる先・現在地の住所・地図', '住所は見せれば伝わる', INK),
    ('東京都 一時滞在施設 (CC BY 4.0)', '帰宅困難者が休む場所', '「逃げる」と「休む」は違う', INK),
]
y = Inches(2.15)
for a, b, c, col in rows:
    box(s, Inches(0.8), y, Inches(11.7), Inches(0.6), fill=PANEL if col is INK else RGBColor(0xfb, 0xec, 0xea), radius=True)
    text(s, Inches(0.95), y + Inches(0.05), Inches(4.3), Inches(0.5), a, size=13, bold=True, color=col, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(5.3), y + Inches(0.05), Inches(2.6), Inches(0.5), b, size=13, color=col, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(7.9), y + Inches(0.05), Inches(4.5), Inches(0.5), c, size=11.5, color=MUTE, anchor=MSO_ANCHOR.MIDDLE)
    y += Inches(0.66)
notes(s, '公共交通オープンデータは2つの役割です。路線と駅で運転系統の対応表を作ること。運行情報で推定を終わらせること。「あとどれくらい」と「もう再開した」の両端を持つのはここだけです。')

# ── 9 実地震 ──
s = new()
label(s, '実際の地震で')
heading(s, '2026-08-23 茨城県南部 M5.9 を実データで', size=30, w=Inches(8.2))
tbl = [('山手線', '5 弱', '1 時間 44 分 〜 5 時間 35 分'),
       ('中央線快速', '5 弱', '1 時間 13 分 〜 4 時間 23 分'),
       ('京浜東北線・根岸線', '5 弱', '3 時間 15 分 〜 9 時間 9 分'),
       ('京急空港線', '5 弱', '35 分 〜 2 時間 1 分')]
y = Inches(2.2)
text(s, Inches(0.8), y, Inches(3.0), Inches(0.4), '系統', size=12, color=MUTE, bold=True)
text(s, Inches(3.8), y, Inches(1.2), Inches(0.4), '震度', size=12, color=MUTE, bold=True)
text(s, Inches(5.0), y, Inches(3.5), Inches(0.4), '再開まで (推定)', size=12, color=MUTE, bold=True)
y += Inches(0.4)
for a, b, c in tbl:
    box(s, Inches(0.8), y, Inches(7.7), Inches(0.55), fill=PANEL, radius=True)
    text(s, Inches(0.95), y + Inches(0.05), Inches(2.9), Inches(0.45), a, size=15, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(3.8), y + Inches(0.05), Inches(1.2), Inches(0.45), b, size=15, anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(5.0), y + Inches(0.05), Inches(3.5), Inches(0.45), c, size=15, color=RED, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    y += Inches(0.62)
text(s, Inches(0.8), y + Inches(0.2), Inches(7.7), Inches(1.6), [
    ('実際: JR 東日本は始発から見合わせ、発生 4 時間 15 分後の 06:15 でも再開見込みなし。', {'size': 15, 'bold': True}),
    ('推定の幅と整合する。', {'size': 15}),
    ('?event=<id> で過去の地震をいつでも再現できる。実地震ごとに幅と実再開時刻を記録し、式を校正していく。', {'size': 13, 'color': MUTE, 'space': 10}),
])
phone(s, '09_real_event_ja', Inches(9.4))
notes(s, '8月23日の地震を実データで再現しました。山手線は1時間44分から5時間35分。実際にJR東日本は4時間15分後でも再開見込みを出していませんでした。幅と整合します。')

# ── 10 設定・共有・4言語 ──
s = new()
label(s, '地震の前に済ませる')
heading(s, '宿と出国便は事前に。\nリンクで配れる。4 言語。', size=26, w=Inches(4.6))
text(s, Inches(0.8), Inches(2.5), Inches(4.4), Inches(4.3), [
    ('設定は URL に入る', {'size': 17, 'bold': True, 'color': RED}),
    ('?lang=en&home=…&flight=NRT&dep=…', {'size': 12, 'color': MUTE}),
    ('宿・旅行会社・空港が、客に設定つきリンクを配れる。地震のあとに設定させない。', {'size': 14, 'space': 4}),
    ('駅名検索は英語でも日本語でも', {'size': 17, 'bold': True, 'color': RED, 'space': 16}),
    ('ODPT の駅名 (英語) と N02 の全駅 (日本語)', {'size': 14}),
    ('日本語・英語・中文・한국어', {'size': 17, 'bold': True, 'color': RED, 'space': 16}),
    ('震源名は気象庁の英語名。時刻は 24 時間表記に固定', {'size': 14}),
    ('圏外でも最後の判定を表示', {'size': 17, 'bold': True, 'color': RED, 'space': 16}),
    ('Service Worker。地震直後の輻輳に備える', {'size': 14}),
])
x = Inches(5.6)
for name in ['06_settings_en', '07_verdict_ja', '08_verdict_ko']:
    w = phone(s, name, x, y=Inches(1.2), h=Inches(5.0))
    x += w + Inches(0.3)
notes(s, '宿と出国便は地震の前に設定します。設定はURLに入るので、宿や旅行会社が客にリンクを配れます。4言語対応、圏外でも動きます。')

# ── 11 技術 ──
s = new()
label(s, '技術')
heading(s, '依存ゼロ・ビルドなし・サーバなし。地震直後に落ちない作り')
cards = [('162 ms', '全国 596 路線・27,343 標本点への震度割り当て (ブラウザ内)'),
         ('0 件', '観測点の座標解決の欠落。199 地震・6,016 点'),
         ('98.2%', '運転系統の対応表の駅被覆。190/215 系統'),
         ('14 通り', '速報・震度 4・5 弱・6 強・遠方・期限切れ・深夜・4 言語… のシナリオ確認')]
for i, (a, b) in enumerate(cards):
    x = Inches(0.8 + (i % 2) * 6.0); y = Inches(2.2 + (i // 2) * 1.55)
    box(s, x, y, Inches(5.7), Inches(1.35), fill=PANEL, radius=True)
    text(s, x + Inches(0.25), y + Inches(0.1), Inches(2.0), Inches(1.1), a, size=30, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
    text(s, x + Inches(2.3), y + Inches(0.1), Inches(3.2), Inches(1.1), b, size=13, anchor=MSO_ANCHOR.MIDDLE)
text(s, Inches(0.8), Inches(5.5), Inches(11.7), Inches(1.3), [
    ('GitHub Pages の静的配信。ES modules + JSDoc、地図タイル描画も自前。地震・運行情報は常に網から、同梱データはキャッシュ優先。', {'size': 14}),
    ('検証スクリプト同梱: verify:shindo / verify:rail / verify:systems / verify:regulation / verify:traininfo。?scenario= と ?event= で審査中もいつでも判定が見える。', {'size': 14, 'color': MUTE, 'space': 6}),
])
notes(s, '依存ゼロ、ビルドなし、サーバなしの静的サイトで、地震直後でも落ちにくい作りです。震度の割り当てはブラウザ内で162ミリ秒。14通りのシナリオで確認済みです。')

# ── 限界と安全側の設計 ──
s = new()
label(s, '正直な限界と、間違え方の設計')
heading(s, '外すなら、安全側に外れるように作ってある')
left = [('推定は推定', '既往研究の式であり、実際の再開は点検結果次第。だから幅で出し、運行情報で上書きする'),
        ('一時滞在施設は東京都のみ', '機械可読で公開している自治体が少ない。未収録の地域ではその旨を表示し、指定緊急避難場所は全国で出す'),
        ('避難場所が「いま開いているか」は取れない', 'L-Alert は非公開。「まず安全な建物にいるなら動くな」を先に言う'),
        ('英語の駅名検索は関東のみ', 'ODPT の収録範囲。他地域は日本語で検索できる')]
for i, (a, b) in enumerate(left):
    y = Inches(2.1 + i * 1.12)
    box(s, Inches(0.8), y, Inches(6.0), Inches(0.98), fill=PANEL, radius=True)
    text(s, Inches(1.0), y + Inches(0.08), Inches(5.6), Inches(0.85), [(a, {'size': 15, 'bold': True}), (b, {'size': 11.5, 'color': MUTE})])
right = [('速報段階では判定しない', '区域単位の震度しか無いうちは「詳細を待っています」。「平常どおり」と誤って出さない'),
         ('推定の期限切れを言う', '上限を過ぎたら「再開しているかもしれません」。古い判定を出し続けない'),
         ('「平常」なら推定を捨てる', '事業者が平常と言えば推定は消える。不要な宿を取らせる方向の失敗を塞ぐ'),
         ('文面は現在形の事実だけ読む', '「運休の可能性があります」「遅延はありません」を止まっている・遅れていると読まない')]
for i, (a, b) in enumerate(right):
    y = Inches(2.1 + i * 1.12)
    box(s, Inches(7.1), y, Inches(5.4), Inches(0.98), fill=RGBColor(0xea, 0xf4, 0xee), radius=True)
    text(s, Inches(7.3), y + Inches(0.08), Inches(5.0), Inches(0.85), [(a, {'size': 15, 'bold': True, 'color': GREEN}), (b, {'size': 11.5, 'color': MUTE})])
notes(s, '限界も正直に書きます。推定は推定で、一時滞在施設は東京都のみです。その上で、外すなら安全側に外れるようにしました。速報段階では判定せず、期限が切れたらそう言い、事業者が平常と言えば推定を捨てます。')

# ── 12 まとめ ──
s = new()
box(s, 0, 0, W, H, fill=RED)
text(s, Inches(0.9), Inches(1.4), Inches(11.5), Inches(2.4), [
    ('「あとどれくらい」を出しているのは、ここだけ。', {'size': 40, 'color': WHITE, 'bold': True}),
    ('待つか、今夜の寝場所を確保するかを、いま決められる。', {'size': 26, 'color': WHITE, 'space': 18}),
])
text(s, Inches(0.9), Inches(4.3), Inches(11.5), Inches(1.6), [
    ('数字の根拠は高浜・翠川 (2011) の推定式。公共交通オープンデータで線路名称を運転系統に組み替え、運行情報で推定を終わらせる。', {'size': 18, 'color': WHITE}),
    ('次は: 一時滞在施設を大阪・京都・福岡へ / 津波の避難場所 / ODPT 航空データで出国便 / 実地震で式を校正', {'size': 15, 'color': WHITE, 'space': 10}),
])
text(s, Inches(0.9), Inches(6.2), Inches(11.5), Inches(0.8), [
    ('Move or Wait — 動くか、待つか', {'size': 20, 'color': WHITE, 'bold': True}),
    ('https://tyra0119.github.io/pj_DisasterPrevention/', {'size': 16, 'color': WHITE}),
])
notes(s, '「あとどれくらい」を出しているのは、ここだけです。Move or Wait、動くか待つか。ありがとうございました。')

# 詳細版 (14 枚、最終プレゼン用) をそのまま保存
prs.save(FULL)
print('saved', FULL, n, 'slides')

# 動画版 (120 秒以内)。内訳・事前設定・技術の 3 枚を落とし、原稿を詰める。
# 読み上げは約 7 文字/秒。切替 0.5 秒込みで 120 秒に収めるため、原稿は合計 780 文字まで。
SHORT = {
    1: 'Move or Wait、動くか待つか。地震のあと、待つか、今夜の寝場所を確保するかを、いま決められるようにします。',
    2: '地震のあと、鉄道会社は全社「再開の見込みは立っていません」としか言えません。8月23日の地震では、4時間以上、誰も「あとどれくらい」を言いませんでした。',
    3: '一番困るのは訪日外国人です。案内が読めず、点検が何時間か知らず、ホテルが数時間で埋まることも知りません。',
    4: 'このアプリは、その「あとどれくらい」に数字を与えます。再開まで51分から4時間26分、と幅で出し、「今夜のうちに戻れる見込み」という決断の形にします。',
    6: '震度6強なら、待たずに宿を取れと言います。休める場所として、一時滞在施設と指定緊急避難場所を同じ地図に出します。',
    7: '気象庁の震度を全国596路線に重ね、公共交通オープンデータセンターの路線と駅のデータで運転系統に組み替え、推定式で幅を出し、運行情報が「平常」なら推定を捨てます。',
    8: '根拠は、高浜・翠川「地震時の鉄道運休時間の推定方法」、日本地震工学会論文集2011年の推定式です。震度4は注意運転点検で30分、5弱以上は徒歩点検で1キロ6分、プラスマイナス30分。6弱以上は時間を出しません。鉄道会社は自前の地震計で判断するので、幅で出し、運行情報で確定させます。',
    9: '公共交通オープンデータは、運転系統の対応表を作ることと、運行情報で推定を終わらせること、2つの役割です。',
    10: '8月23日の地震を実データで再現すると、山手線は1時間44分から5時間35分。実際にJR東日本は4時間後でも見込みを出しておらず、幅と整合します。',
    13: '推定は推定です。だから速報段階では判定せず、期限が切れたらそう言い、事業者が平常と言えば推定を捨てる。外すなら安全側に外れるようにしました。',
    14: '「あとどれくらい」を出しているのは、ここだけです。Move or Wait、動くか待つか。',
}
print('video narration chars:', sum(len(v) for v in SHORT.values()))
slides = list(prs.slides)
for i, slide in enumerate(slides, 1):
    if i in SHORT:
        notes(slide, SHORT[i])
sld_ids = prs.slides._sldIdLst
for i in sorted(set(range(1, n + 1)) - set(SHORT), reverse=True):
    rid = sld_ids[i - 1].rId
    prs.part.drop_rel(rid)
    del sld_ids[i - 1]
prs.save(OUT)
print('saved', OUT, len(prs.slides), 'slides')
